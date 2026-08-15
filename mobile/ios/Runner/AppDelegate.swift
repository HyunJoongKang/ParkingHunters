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
        let lng = args["lng"] as? Double
      else {
        result(FlutterError(code: "INVALID_ARGS", message: "lat/lng가 필요합니다.", details: nil))
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
