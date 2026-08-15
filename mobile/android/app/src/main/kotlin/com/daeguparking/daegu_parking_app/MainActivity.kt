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

        // TODO: 카카오 개발자 콘솔 > 내 애플리케이션 > 앱 키 > 네이티브 앱 키로 교체한다.
        // (웹에서 쓰는 NEXT_PUBLIC_KAKAO_JS_KEY, REST API 키와는 다른 값이다.)
        private const val KNSDK_APP_KEY = "820ee81b7911aae2b04c5ab9ec63736c"
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
        KNSDK.install(application, "$filesDir/knsdk")

        val deviceId = deviceId()
        KNSDK.initializeWithAppKey(
            KNSDK_APP_KEY,
            BuildConfig.VERSION_NAME,
            deviceId, // aCsId
            deviceId, // aAppUserId
            KNLanguageType.KNLanguageType_KOREAN
        ) { error ->
            if (error != null) {
                Log.e("KNSDK", "초기화 실패: ${error.code} ${error.msg}")
            }
        }
    }

    // Flutter WebView(mobile/lib/main.dart)가 주입한 window.NativeBridge.startNavi(name,
    // lat, lng) 호출을 이 MethodChannel로 받아, KNSDK 인앱 내비 화면(NaviActivity)을 띄운다.
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, NAVI_CHANNEL)
            .setMethodCallHandler { call, result ->
                if (call.method == "startNavi") {
                    val name = call.argument<String>("name") ?: ""
                    val lat = call.argument<Double>("lat")
                    val lng = call.argument<Double>("lng")
                    if (lat == null || lng == null) {
                        result.error("INVALID_ARGS", "lat/lng가 필요합니다.", null)
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
                } else {
                    result.notImplemented()
                }
            }
    }
}
