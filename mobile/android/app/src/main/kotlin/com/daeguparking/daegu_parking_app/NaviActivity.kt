package com.daeguparking.daegu_parking_app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.core.app.ActivityCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.kakaomobility.knsdk.KNRouteAvoidOption
import com.kakaomobility.knsdk.KNRoutePriority
import com.kakaomobility.knsdk.KNSDK
import com.kakaomobility.knsdk.common.objects.KNError
import com.kakaomobility.knsdk.common.objects.KNPOI
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_CitsGuideDelegate
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_GuideStateDelegate
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_LocationGuideDelegate
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_RouteGuideDelegate
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_SafetyGuideDelegate
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_VoiceGuideDelegate
import com.kakaomobility.knsdk.guidance.knguidance.KNGuideRouteChangeReason
import com.kakaomobility.knsdk.guidance.knguidance.citsguide.KNGuide_Cits
import com.kakaomobility.knsdk.guidance.knguidance.common.KNLocation
import com.kakaomobility.knsdk.guidance.knguidance.locationguide.KNGuide_Location
import com.kakaomobility.knsdk.guidance.knguidance.routeguide.KNGuide_Route
import com.kakaomobility.knsdk.guidance.knguidance.routeguide.objects.KNMultiRouteInfo
import com.kakaomobility.knsdk.guidance.knguidance.safetyguide.KNGuide_Safety
import com.kakaomobility.knsdk.guidance.knguidance.safetyguide.objects.KNSafety
import com.kakaomobility.knsdk.guidance.knguidance.voiceguide.KNGuide_Voice
import com.kakaomobility.knsdk.trip.kntrip.KNTrip
import com.kakaomobility.knsdk.trip.kntrip.knroute.KNRoute
import com.kakaomobility.knsdk.ui.view.KNNaviView

// KNSDK 인앱 내비 주행 화면. MainActivity의 MethodChannel("startNavi")이 목적지 좌표를
// 받으면 이 액티비티를 띄운다. Flutter 엔진과는 무관한 순수 네이티브 화면이라 별도
// 액티비티로 분리했다(FlutterActivity 위에 겹쳐 그리는 대신).
//
// 아래 6개 KNGuidance_*Delegate 인터페이스의 정확한 메서드 시그니처(널러블 여부 포함)는
// 공식 가이드 문서 요약만으로는 100% 확정할 수 없어, 실제 knsdk_ui-1.12.7.aar의
// classes.jar를 javap + 코틀린 컴파일러 에러 메시지로 직접 확인했다.
//
// KNNaviView.setStateDelegate/setGuideStateDelegate/setGuidance는 디컴파일한
// classes.jar에는 public으로 보이지만 실제로는 코틀린 internal API라 외부 모듈에서
// 컴파일되지 않는다(컴파일러가 "Unresolved reference"로 확인해 줌) — 그래서 화면 종료는
// KNGuidance_GuideStateDelegate.guidanceGuideEnded로 대신 처리한다.
class NaviActivity :
    Activity(),
    KNGuidance_GuideStateDelegate,
    KNGuidance_LocationGuideDelegate,
    KNGuidance_RouteGuideDelegate,
    KNGuidance_SafetyGuideDelegate,
    KNGuidance_VoiceGuideDelegate,
    KNGuidance_CitsGuideDelegate {

    companion object {
        const val EXTRA_NAME = "name"
        const val EXTRA_LAT = "lat"
        const val EXTRA_LNG = "lng"
        private const val TAG = "NaviActivity"
    }

    private lateinit var naviView: KNNaviView
    private lateinit var fusedLocationClient: FusedLocationProviderClient

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_navi)
        naviView = findViewById(R.id.navi_view)

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)

        // MainActivity가 KNSDK 초기화 완료 여부를 확인한 뒤에만 이 액티비티를 띄우지만,
        // 딥링크 등 다른 경로로 직접 진입할 가능성에 대비해 여기서도 한 번 더 막는다 —
        // 초기화 전에 KNSDK 호출(convertWGS84ToKATEC 등)이 들어가면 네이티브 크래시로
        // 앱 전체가 죽는다.
        if (!MainActivity.isKNSDKReady) {
            Log.e(TAG, "KNSDK가 초기화되지 않은 상태로 진입: ${MainActivity.knsdkInitErrorMessage}")
            Toast.makeText(this, "내비게이션 SDK가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        val destName = intent.getStringExtra(EXTRA_NAME) ?: "목적지"
        val destLat = intent.getDoubleExtra(EXTRA_LAT, 0.0)
        val destLng = intent.getDoubleExtra(EXTRA_LNG, 0.0)
        if (destLat.isNaN() || destLng.isNaN() || (destLat == 0.0 && destLng == 0.0)) {
            Log.e(TAG, "잘못된 목적지 좌표: lat=$destLat, lng=$destLng")
            Toast.makeText(this, "목적지 좌표가 올바르지 않습니다.", Toast.LENGTH_SHORT).show()
            finish()
            return
        }
        startTrip(destName, destLat, destLng)
    }

    // WGS84(위도/경도) -> KATEC 좌표계로 변환해 KNPOI를 만든다. KNPOI 생성자의 좌표
    // 파라미터가 Int(KATEC) 기반이라(디컴파일로 확인), 우리 웹앱이 쓰는 일반 위경도를
    // 그대로 넘길 수 없다. (name, IntPoint) 2-인자 생성자는 internal이라 외부에서 못
    // 쓰므로, 공개된 (name, longitude, latitude, address) 4-인자 생성자를 쓴다 — 나머지
    // 뒤쪽 인자들은 코틀린 기본값이 있어 생략 가능하다(공식 가이드 예시와 동일한 형태).
    // KNSDK가 초기화되지 않았거나 좌표가 KATEC으로 변환 불가능한 값이면 예외를 던질 수
    // 있어(디컴파일 확인 안 된 내부 구현이라 보장 못 함) 여기서 잡아 null로 흡수한다 —
    // 호출부가 그대로 크래시하는 대신 사용자에게 안내 메시지를 보여주고 화면을 닫게 한다.
    private fun toKnPoi(name: String, lat: Double, lng: Double): KNPOI? {
        return try {
            val katec = KNSDK.convertWGS84ToKATEC(lat, lng)
            KNPOI(name, katec.x.toInt(), katec.y.toInt(), name)
        } catch (t: Throwable) {
            Log.e(TAG, "좌표 변환 실패 (name=$name, lat=$lat, lng=$lng)", t)
            null
        }
    }

    @SuppressLint("MissingPermission")
    private fun startTrip(destName: String, destLat: Double, destLng: Double) {
        val hasFine = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val hasCoarse = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        if (!hasFine && !hasCoarse) {
            Toast.makeText(this, "위치 권한이 필요합니다.", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        fusedLocationClient.lastLocation
            .addOnSuccessListener { location ->
                try {
                    if (location == null) {
                        Log.e(TAG, "현재 위치를 확인할 수 없음 (lastLocation == null)")
                        Toast.makeText(this, "현재 위치를 확인할 수 없습니다.", Toast.LENGTH_SHORT).show()
                        finish()
                        return@addOnSuccessListener
                    }
                    val start = toKnPoi("현재 위치", location.latitude, location.longitude)
                    val goal = toKnPoi(destName, destLat, destLng)
                    if (start == null || goal == null) {
                        Toast.makeText(this, "좌표 변환에 실패했습니다.", Toast.LENGTH_SHORT).show()
                        finish()
                        return@addOnSuccessListener
                    }
                    KNSDK.makeTripWithStart(start, goal, null, null) { error, trip ->
                        try {
                            if (error != null || trip == null) {
                                Log.e(TAG, "경로 탐색 실패: ${error?.code} ${error?.msg}")
                                Toast.makeText(this, "경로 탐색에 실패했습니다: ${error?.msg}", Toast.LENGTH_SHORT).show()
                                finish()
                                return@makeTripWithStart
                            }
                            beginGuidance(trip)
                        } catch (t: Throwable) {
                            Log.e(TAG, "경로 탐색 콜백 처리 중 예외 발생", t)
                            Toast.makeText(this, "내비게이션 시작 중 오류가 발생했습니다.", Toast.LENGTH_SHORT).show()
                            finish()
                        }
                    }
                } catch (t: Throwable) {
                    Log.e(TAG, "경로 탐색 요청 중 예외 발생", t)
                    Toast.makeText(this, "내비게이션 시작 중 오류가 발생했습니다.", Toast.LENGTH_SHORT).show()
                    finish()
                }
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "현재 위치를 가져오지 못함", e)
                Toast.makeText(this, "현재 위치를 가져오지 못했습니다.", Toast.LENGTH_SHORT).show()
                finish()
            }
    }

    private fun beginGuidance(trip: KNTrip) {
        try {
            val guidance = KNSDK.sharedGuidance()
            if (guidance == null) {
                Log.e(TAG, "sharedGuidance()가 null — 초기화가 완료되지 않았을 수 있음")
                Toast.makeText(this, "내비게이션을 시작할 수 없습니다.", Toast.LENGTH_SHORT).show()
                finish()
                return
            }
            guidance.guideStateDelegate = this
            guidance.locationGuideDelegate = this
            guidance.routeGuideDelegate = this
            guidance.safetyGuideDelegate = this
            guidance.voiceGuideDelegate = this
            guidance.citsGuideDelegate = this

            naviView.initWithGuidance(
                guidance,
                trip,
                KNRoutePriority.KNRoutePriority_Recommand,
                KNRouteAvoidOption.KNRouteAvoidOption_None.value
            )
        } catch (t: Throwable) {
            Log.e(TAG, "내비게이션 화면 초기화 중 예외 발생", t)
            Toast.makeText(this, "내비게이션 화면을 표시할 수 없습니다.", Toast.LENGTH_SHORT).show()
            finish()
        }
    }

    override fun onBackPressed() {
        try {
            naviView.guideCancel()
        } catch (t: Throwable) {
            Log.e(TAG, "guideCancel 중 예외 발생", t)
        }
        super.onBackPressed()
    }

    override fun onDestroy() {
        try {
            KNSDK.sharedGuidance()?.stop()
        } catch (t: Throwable) {
            Log.e(TAG, "가이던스 종료 중 예외 발생", t)
        }
        super.onDestroy()
    }

    // ---- KNGuidance_GuideStateDelegate ----
    override fun guidanceGuideStarted(aGuidance: KNGuidance) {}
    override fun guidanceCheckingRouteChange(aGuidance: KNGuidance) {}
    override fun guidanceRouteUnchanged(aGuidance: KNGuidance) {}
    override fun guidanceRouteUnchangedWithError(aGuidance: KNGuidance, aError: KNError) {}
    override fun guidanceOutOfRoute(aGuidance: KNGuidance) {}
    override fun guidanceRouteChanged(
        aGuidance: KNGuidance,
        aFromRoute: KNRoute,
        aFromLocation: KNLocation,
        aToRoute: KNRoute,
        aToLocation: KNLocation,
        aChangeReason: KNGuideRouteChangeReason
    ) {}
    // 주행 종료 시 화면을 닫는다 — KNNaviView 자체의 상태 델리게이트(internal이라 접근
    // 불가)가 아니라 KNGuidance 쪽 델리게이트로 종료를 감지한다.
    override fun guidanceGuideEnded(aGuidance: KNGuidance) {
        finish()
    }
    override fun guidanceDidUpdateRoutes(
        aGuidance: KNGuidance,
        aRoutes: List<KNRoute>,
        aMultiRouteInfo: KNMultiRouteInfo?
    ) {}
    override fun guidanceDidUpdateIndoorRoute(aGuidance: KNGuidance, aRoute: KNRoute?) {}

    // ---- KNGuidance_LocationGuideDelegate ----
    override fun guidanceDidUpdateLocation(aGuidance: KNGuidance, aLocationGuide: KNGuide_Location) {}

    // ---- KNGuidance_RouteGuideDelegate ----
    override fun guidanceDidUpdateRouteGuide(aGuidance: KNGuidance, aRouteGuide: KNGuide_Route) {}

    // ---- KNGuidance_SafetyGuideDelegate ----
    override fun guidanceDidUpdateSafetyGuide(aGuidance: KNGuidance, aSafetyGuide: KNGuide_Safety?) {}
    override fun guidanceDidUpdateAroundSafeties(aGuidance: KNGuidance, aSafeties: List<KNSafety>?) {}

    // ---- KNGuidance_VoiceGuideDelegate ----
    override fun shouldPlayVoiceGuide(
        aGuidance: KNGuidance,
        aVoiceGuide: KNGuide_Voice,
        aNewData: MutableList<ByteArray>
    ): Boolean = true
    override fun willPlayVoiceGuide(aGuidance: KNGuidance, aVoiceGuide: KNGuide_Voice) {}
    override fun didFinishPlayVoiceGuide(aGuidance: KNGuidance, aVoiceGuide: KNGuide_Voice) {}

    // ---- KNGuidance_CitsGuideDelegate ----
    override fun didUpdateCitsGuide(aGuidance: KNGuidance, aCitsGuide: KNGuide_Cits) {}
}
