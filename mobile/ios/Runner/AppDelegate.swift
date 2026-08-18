import Flutter
import UIKit

private let naviChannelName = "com.daeguparking.daegu_parking_app/navi"

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    NaviBridge.initializeKNSDK()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    let naviChannel = FlutterMethodChannel(
      name: naviChannelName,
      binaryMessenger: engineBridge.applicationRegistrar.messenger()
    )
    naviChannel.setMethodCallHandler { [weak self] call, result in
      guard call.method == "startNavi" else {
        result(FlutterMethodNotImplemented)
        return
      }
      guard
        let args = call.arguments as? [String: Any],
        let lat = args["lat"] as? Double,
        let lng = args["lng"] as? Double,
        lat.isFinite, lng.isFinite,
        !(lat == 0 && lng == 0)
      else {
        NSLog("[KNSDK] 잘못된 좌표로 startNavi 호출됨: %@", String(describing: call.arguments))
        result(FlutterError(code: "INVALID_ARGS", message: "lat/lng가 필요합니다.", details: nil))
        return
      }
      // initializeKNSDK()의 완료 콜백이 아직 안 왔으면 KNNaviViewController가
      // KNSDK를 호출하는 순간 네이티브 크래시로 이어진다 — 여기서 먼저 막는다.
      guard NaviBridge.isInitialized() else {
        NSLog("[KNSDK] 초기화가 아직 끝나지 않음: %@", NaviBridge.initializationErrorMessage() ?? "nil")
        result(FlutterError(
          code: "KNSDK_NOT_READY",
          message: "내비게이션 SDK가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.",
          details: NaviBridge.initializationErrorMessage()
        ))
        return
      }
      let name = (args["name"] as? String) ?? ""
      guard let presenter = self?.window?.rootViewController else {
        result(FlutterError(code: "NO_ROOT_VC", message: "내비게이션을 표시할 화면을 찾을 수 없습니다.", details: nil))
        return
      }
      NaviBridge.startNavi(from: presenter, name: name, lat: lat, lng: lng)
      result(nil)
    }
  }
}
