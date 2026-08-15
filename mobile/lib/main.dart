import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

// 2단계에서 배포한 Vercel 프로덕션 URL(고정 alias).
const String kWebAppUrl = "https://my-first-app-omega-lime.vercel.app";

// MainActivity.kt(Android)의 MethodChannel과 이름이 일치해야 한다.
const String kNaviChannelName = "com.daeguparking.daegu_parking_app/navi";
const MethodChannel kNaviChannel = MethodChannel(kNaviChannelName);

// 웹앱(app/lib/navi.ts)이 우선적으로 시도하는 window.NativeBridge.startNavi(name,
// lat, lng)를 흉내낸다. webview_flutter의 JS 채널은 postMessage(String)만 제공하므로,
// 페이지 로드 후 이 스크립트를 주입해 실제 함수 형태의 브리지처럼 보이게 감싼다.
const String kNativeBridgeShim = '''
window.NativeBridge = window.NativeBridge || {};
window.NativeBridge.startNavi = function(name, lat, lng) {
  NativeBridge.postMessage(JSON.stringify({ name: name, lat: lat, lng: lng }));
};
''';

void main() {
  runApp(const DaeguParkingApp());
}

class DaeguParkingApp extends StatelessWidget {
  const DaeguParkingApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '대구 주차',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0F9C8F))),
      home: const WebViewScreen(),
    );
  }
}

class WebViewScreen extends StatefulWidget {
  const WebViewScreen({super.key});

  @override
  State<WebViewScreen> createState() => _WebViewScreenState();
}

class _WebViewScreenState extends State<WebViewScreen> {
  late final WebViewController _controller;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _requestLocationPermission();
    _controller = _buildController();
  }

  // 앱 실행 시 위치 권한(GPS)을 자동으로 요청한다. 웹 페이지의
  // navigator.geolocation 호출은 OS 권한이 없으면 WebView 쪽 설정과 무관하게
  // 항상 실패하므로, WebView를 띄우기 전에 먼저 확보해 둔다.
  Future<void> _requestLocationPermission() async {
    final status = await Permission.locationWhenInUse.request();
    if (status.isPermanentlyDenied) {
      // 사용자가 "다시 묻지 않음"으로 거부한 경우 — 앱 자체 권한 요청 UI로는
      // 더 이상 다시 띄울 수 없으므로, 필요하면 설정 화면으로 안내한다.
      // (현재는 조용히 넘어가고, 웹 페이지 쪽 위치 실패 안내 문구가 대신 보여진다.)
    }
  }

  WebViewController _buildController() {
    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..addJavaScriptChannel('NativeBridge', onMessageReceived: _handleNativeBridgeMessage)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) => setState(() => _isLoading = true),
          onPageFinished: (_) async {
            // 웹앱(app/lib/navi.ts)이 우선 시도하는 window.NativeBridge.startNavi(...)
            // 형태를 흉내내는 얇은 JS 래퍼를 페이지 로드마다 주입한다. webview_flutter의
            // JS 채널은 postMessage(String)만 제공하므로 실제 함수처럼 보이게 감싼다.
            await _controller.runJavaScript(kNativeBridgeShim);
            setState(() => _isLoading = false);
          },
          onNavigationRequest: _handleNavigationRequest,
        ),
      );

    // 보안 옵션: 로컬 파일(file://) 접근을 막아 WebView가 기기 파일시스템을
    // 임의로 읽어가는 경로를 차단한다. iOS(WKWebView)는 별도 설정 없이도
    // 기본적으로 로컬 파일 접근 권한을 부여하지 않으므로 Android 전용 설정이다.
    if (controller.platform is AndroidWebViewController) {
      final androidController = controller.platform as AndroidWebViewController;
      androidController.setAllowFileAccess(false);
      androidController.setGeolocationEnabled(true);
      // 웹 페이지가 navigator.geolocation을 호출하면 이 웹앱은 이미 우리가
      // 배포한, 신뢰하는 도메인(kWebAppUrl)만 로드하므로 확인창 없이 바로
      // 허용한다 — 위치 접근 자체는 위의 OS 권한 요청에서 이미 사용자 동의를
      // 받았다.
      androidController.setGeolocationPermissionsPromptCallbacks(
        onShowPrompt: (request) async {
          return const GeolocationPermissionsResponse(allow: true, retain: true);
        },
      );
    }

    controller.loadRequest(Uri.parse(kWebAppUrl));
    return controller;
  }

  // window.NativeBridge.startNavi(name, lat, lng)가 postMessage로 보낸 JSON을 받아
  // 네이티브(MainActivity.kt)의 MethodChannel로 그대로 넘긴다. 실제 KNSDK 인앱 내비
  // 화면을 띄우는 처리는 전부 네이티브 쪽(NaviActivity)에서 한다.
  Future<void> _handleNativeBridgeMessage(JavaScriptMessage message) async {
    try {
      final data = jsonDecode(message.message) as Map<String, dynamic>;
      await kNaviChannel.invokeMethod('startNavi', {
        'name': data['name'] as String? ?? '',
        'lat': (data['lat'] as num).toDouble(),
        'lng': (data['lng'] as num).toDouble(),
      });
    } catch (_) {
      if (mounted) _showLaunchFailedMessage();
    }
  }

  // 웹 내 [길찾기] 버튼은 카카오맵 웹 링크(https://map.kakao.com/...)를 새 탭으로
  // 열거나(app/lib/navi.ts), 추후 카카오내비 딥링크(kakaonavi-sdk://...)로 이동을
  // 시도할 수 있다. 두 경우 모두 WebView 안에서는 정상적으로 열리지 않으므로,
  // http/https가 아닌 스킴이거나 카카오맵/내비 외부 링크면 url_launcher로 넘겨
  // 카카오내비 앱(설치되어 있다면) 또는 기본 브라우저로 실행한다.
  Future<NavigationDecision> _handleNavigationRequest(NavigationRequest request) async {
    final uri = Uri.tryParse(request.url);
    if (uri == null) return NavigationDecision.navigate;

    final isHttp = uri.scheme == 'http' || uri.scheme == 'https';
    final isExternalMapLink =
        isHttp && (uri.host.contains('map.kakao.com') || uri.host.contains('kakaonavi'));

    if (!isHttp || isExternalMapLink) {
      await _launchExternally(uri);
      return NavigationDecision.prevent;
    }
    return NavigationDecision.navigate;
  }

  Future<void> _launchExternally(Uri uri) async {
    try {
      final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!launched && mounted) {
        _showLaunchFailedMessage();
      }
    } catch (_) {
      // 카카오내비 앱 등 대상 앱이 설치되어 있지 않아 스킴을 처리할 수 없는
      // 경우(kakaonavi-sdk:// 등) — 앱을 강제 종료시키지 않고 안내만 한다.
      if (mounted) _showLaunchFailedMessage();
    }
  }

  void _showLaunchFailedMessage() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('카카오내비 앱을 열 수 없습니다. 설치 후 다시 시도해 주세요.')),
    );
  }

  // 시스템 뒤로가기를 웹 페이지 히스토리 뒤로가기와 연동한다. WebView 안에
  // 더 돌아갈 히스토리가 있으면 그쪽을 먼저 소비하고, 없을 때만 앱 종료 등
  // 기본 동작(pop)으로 넘어간다.
  Future<bool> _onWillPop() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
      return false;
    }
    return true;
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        final navigator = Navigator.of(context);
        final shouldPop = await _onWillPop();
        if (shouldPop && mounted) {
          navigator.maybePop();
        }
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: _controller),
              if (_isLoading) const Center(child: CircularProgressIndicator()),
            ],
          ),
        ),
      ),
    );
  }
}
