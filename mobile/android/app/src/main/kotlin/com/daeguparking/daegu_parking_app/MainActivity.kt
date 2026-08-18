package com.daeguparking.daegu_parking_app

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import com.kakaomobility.knsdk.KNLanguageType
import com.kakaomobility.knsdk.KNSDK
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    companion object {
        private const val NAVI_CHANNEL = "com.daeguparking.daegu_parking_app/navi"
        private const val TAG = "KNSDK"

        // 카카오 개발자 콘솔에서 발급받은 실제 네이티브 앱 키(웹에서 쓰는
        // NEXT_PUBLIC_KAKAO_JS_KEY, REST API 키와는 다른 값). 이 앱의 패키지명
        // (com.daeguparking.daegu_parking_app)과 디버그/릴리스 키 해시가 콘솔의
        // 플랫폼 설정(Android)에 등록되어 있어야 초기화가 성공한다(미등록 시
        // "C103 SDK Certification Failed - INVALID_TOKEN"로 실패).
        private const val KNSDK_APP_KEY = "820ee81b7911aae2b04c5ab9ec63736c"

        // initializeWithAppKey는 비동기 콜백이라, 완료 전에 NaviActivity가 KNSDK를
        // 호출하면(특히 설치 직후 데이터 추출이 끝나기 전 사용자가 바로 길찾기를 누르는
        // 경우) 네이티브 예외로 앱 전체가 죽는다. 이 플래그로 완료 여부를 확인한 뒤에만
        // NaviActivity를 띄운다.
        @Volatile
        var isKNSDKReady = false
            private set

        @Volatile
        var knsdkInitErrorMessage: String? = null
            private set
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        initKNSDK()
    }

    // KNSDK 릴리스 노트(v1.10.1)가 요구하는 "설치된 단말/사용자를 식별하는 변하지 않는 값"
    // (aCsId, aAppUserId)으로 ANDROID_ID를 쓴다. 별도 회원 시스템이 없는 이 앱에는
    // 충분하다 — 로그인 붙이면 실제 사용자 ID로 교체한다.
    private fun deviceId(): String =
        Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown-device"

    private fun initKNSDK() {
        try {
            KNSDK.install(application, "$filesDir/knsdk")

            val deviceId = deviceId()
            Log.d(TAG, "초기화 시작 (deviceId=$deviceId)")
            KNSDK.initializeWithAppKey(
                KNSDK_APP_KEY,
                BuildConfig.VERSION_NAME,
                deviceId, // aCsId
                deviceId, // aAppUserId
                KNLanguageType.KNLanguageType_KOREAN
            ) { error ->
                if (error != null) {
                    knsdkInitErrorMessage = "${error.code} ${error.msg}"
                    Log.e(TAG, "초기화 실패: ${error.code} ${error.msg}")
                } else {
                    isKNSDKReady = true
                    Log.d(TAG, "초기화 완료")
                }
            }
        } catch (t: Throwable) {
            knsdkInitErrorMessage = t.message
            Log.e(TAG, "초기화 중 예외 발생", t)
        }
    }

    // Flutter WebView(mobile/lib/main.dart)가 주입한 window.NativeBridge.startNavi(name,
    // lat, lng) 호출을 이 MethodChannel로 받아, KNSDK 인앱 내비 화면(NaviActivity)을 띄운다.
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, NAVI_CHANNEL)
            .setMethodCallHandler { call, result ->
                if (call.method != "startNavi") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                try {
                    val name = call.argument<String>("name") ?: ""
                    val lat = call.argument<Double>("lat")
                    val lng = call.argument<Double>("lng")
                    if (lat == null || lng == null || lat.isNaN() || lng.isNaN() ||
                        (lat == 0.0 && lng == 0.0)
                    ) {
                        Log.e(TAG, "잘못된 좌표로 startNavi 호출됨: lat=$lat, lng=$lng")
                        result.error("INVALID_ARGS", "lat/lng가 필요합니다.", null)
                        return@setMethodCallHandler
                    }
                    if (!isKNSDKReady) {
                        Log.e(TAG, "KNSDK 초기화가 아직 끝나지 않음: $knsdkInitErrorMessage")
                        result.error(
                            "KNSDK_NOT_READY",
                            "내비게이션 SDK가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.",
                            knsdkInitErrorMessage
                        )
                        return@setMethodCallHandler
                    }
                    startActivity(
                        Intent(this, NaviActivity::class.java).apply {
                            putExtra(NaviActivity.EXTRA_NAME, name)
                            putExtra(NaviActivity.EXTRA_LAT, lat)
                            putExtra(NaviActivity.EXTRA_LNG, lng)
                        }
                    )
                    result.success(null)
                } catch (t: Throwable) {
                    Log.e(TAG, "startNavi 처리 중 예외 발생", t)
                    result.error("NAVI_START_FAILED", t.message, null)
                }
            }
    }
}
