import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

// Cloudtype에 배포한 프로덕션 URL. 대구시 API의 해외 IP 차단 문제 때문에
// Vercel에서 국내 리전 PaaS(Cloudtype)로 이전했다.
const String kWebAppUrl = "https://port-next-parkinghunters-mt11lnjif422a8c1.sel3.cloudtype.app";

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

// 웹앱(app/lib/voiceSearch.ts)이 우선적으로 확인하는 window.NativeVoice를 흉내낸다.
// Android/iOS WebView에는 브라우저의 Web Speech API가 없어서(WebView 엔진 공통의
// 한계), 음성 인식 자체는 네이티브(speech_to_text 패키지, OS 음성 인식 엔진)로
// 대신 처리하고 시작/중지 신호만 이 채널로 주고받는다.
const String kNativeVoiceShim = '''
window.NativeVoice = window.NativeVoice || {};
window.NativeVoice.startListening = function(lang) {
  NativeVoice.postMessage(JSON.stringify({ action: 'start', lang: lang }));
};
window.NativeVoice.stopListening = function() {
  NativeVoice.postMessage(JSON.stringify({ action: 'stop' }));
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

  final stt.SpeechToText _speech = stt.SpeechToText();
  bool _speechInitialized = false;

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
      ..addJavaScriptChannel('NativeVoice', onMessageReceived: _handleNativeVoiceMessage)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            setState(() => _isLoading = true);
            // onPageFinished에서만 주입하면, 로드가 느릴 때 사용자가 그 사이 길찾기를
            // 눌러 window.NativeBridge.startNavi가 아직 없는 상태(경쟁 상태)가 생기고,
            // navi.ts가 카카오맵 웹 링크로 폴백해 외부 카카오맵/내비 앱이 열리게 된다.
            // 네비게이션 시작 시점에 최대한 일찍 주입해 그 틈을 없앤다.
            _controller.runJavaScript(kNativeBridgeShim);
            _controller.runJavaScript(kNativeVoiceShim);
          },
          onPageFinished: (_) async {
            // 웹앱(app/lib/navi.ts, app/lib/voiceSearch.ts)이 우선 시도하는
            // window.NativeBridge.startNavi(...)/window.NativeVoice.startListening(...)
            // 형태를 흉내내는 얇은 JS 래퍼를 페이지 로드마다 주입한다. webview_flutter의
            // JS 채널은 postMessage(String)만 제공하므로 실제 함수처럼 보이게 감싼다.
            // onPageStarted 주입이 어떤 이유로든 적용되지 않았을 경우를 대비한 재주입.
            await _controller.runJavaScript(kNativeBridgeShim);
            await _controller.runJavaScript(kNativeVoiceShim);
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
    debugPrint('[NativeBridge] startNavi 요청 수신: ${message.message}');
    try {
      final data = jsonDecode(message.message) as Map<String, dynamic>;
      await kNaviChannel.invokeMethod('startNavi', {
        'name': data['name'] as String? ?? '',
        'lat': (data['lat'] as num).toDouble(),
        'lng': (data['lng'] as num).toDouble(),
      });
      debugPrint('[NativeBridge] startNavi 네이티브 호출 성공');
    } on PlatformException catch (e) {
      // KNSDK_NOT_READY(초기화 미완료), INVALID_ARGS(좌표 문제), NAVI_START_FAILED
      // (네이티브 예외) 등 MainActivity.kt/AppDelegate.swift가 돌려주는 실제 실패
      // 원인이 여기 찍힌다 — 인앱 내비가 왜 안 뜨는지는 이 로그로 확인한다.
      debugPrint('[NativeBridge] startNavi 네이티브 호출 실패: ${e.code} ${e.message} ${e.details}');
      if (mounted) _showLaunchFailedMessage();
    } catch (e, st) {
      debugPrint('[NativeBridge] startNavi 메시지 처리 중 예외: $e\n$st');
      if (mounted) _showLaunchFailedMessage();
    }
  }

  // window.NativeVoice.startListening/stopListening(app/lib/voiceSearch.ts)이
  // postMessage로 보낸 { action: 'start'|'stop', lang } 요청을 처리한다. 실제 마이크
  // 권한 확인과 오디오 캡처는 speech_to_text(OS 네이티브 음성 인식)가 전부 담당하고,
  // 여기서는 그 결과/오류/듣는 중 상태를 다시 웹 페이지의 window.__onNativeVoice*
  // 콜백으로 돌려준다.
  Future<void> _handleNativeVoiceMessage(JavaScriptMessage message) async {
    Map<String, dynamic> data;
    try {
      data = jsonDecode(message.message) as Map<String, dynamic>;
    } catch (e) {
      debugPrint('[NativeVoice] 메시지 파싱 실패: $e');
      return;
    }

    final action = data['action'] as String?;
    if (action == 'start') {
      await _startVoiceListening((data['lang'] as String?) ?? 'ko-KR');
    } else if (action == 'stop') {
      await _speech.stop();
    }
  }

  Future<void> _startVoiceListening(String lang) async {
    if (_speech.isListening) return; // 이미 듣고 있으면 중복 시작하지 않는다.

    if (!_speechInitialized) {
      _speechInitialized = await _speech.initialize(
        onStatus: _handleSpeechStatus,
        onError: (error) {
          debugPrint('[NativeVoice] 오류: ${error.errorMsg} (permanent: ${error.permanent})');
          _postToWeb('__onNativeVoiceError', _mapSpeechErrorToWebCode(error.errorMsg));
        },
      );
    }

    if (!_speechInitialized) {
      // initialize() 실패는 대개 마이크/음성 인식 권한이 없거나 기기가 음성 인식
      // 자체를 지원하지 않는 경우다(예: 구형 기기, 관련 서비스 미설치).
      debugPrint('[NativeVoice] speech_to_text 초기화 실패 — 권한 거부 또는 기기 미지원');
      _postToWeb('__onNativeVoiceError', 'not-allowed');
      return;
    }

    // 대구 사투리는 별도 로케일이 없어 표준 한국어로 고정한다 — 웹 쪽 요청도 이미
    // 'ko-KR'로 고정돼 있다. speech_to_text/OS 로케일 id 표기(밑줄)에 맞춰 변환한다.
    final localeId = lang.replaceAll('-', '_');
    await _speech.listen(
      onResult: (result) {
        if (result.finalResult && result.recognizedWords.trim().isNotEmpty) {
          _postToWeb('__onNativeVoiceResult', result.recognizedWords.trim());
        }
      },
      listenOptions: stt.SpeechListenOptions(localeId: localeId, partialResults: false),
    );
  }

  void _handleSpeechStatus(String status) {
    debugPrint('[NativeVoice] 상태 변경: $status');
    final isListening = status == 'listening';
    _controller.runJavaScript(
      'window.__onNativeVoiceListeningChange && window.__onNativeVoiceListeningChange($isListening)',
    );
  }

  // 문자열 값을 안전하게 JSON 인코딩해 웹 페이지의 전역 콜백을 호출한다 — 인식된
  // 텍스트에 특수문자/인용부호가 섞여 있어도 JS 문자열 리터럴이 깨지지 않게 한다.
  void _postToWeb(String callbackName, String value) {
    final encoded = jsonEncode(value);
    _controller.runJavaScript('window.$callbackName && window.$callbackName($encoded)');
  }

  // speech_to_text의 플랫폼별 에러 문자열을 app/lib/voiceSearch.ts가 이해하는
  // 코드로 좁힌다. 문서화된 값 예시: error_no_match, error_speech_timeout,
  // error_network, error_permission, error_audio_error 등.
  String _mapSpeechErrorToWebCode(String? errorMsg) {
    switch (errorMsg) {
      case 'error_no_match':
      case 'error_speech_timeout':
        return 'no-speech';
      case 'error_network':
      case 'error_network_timeout':
        return 'network';
      case 'error_permission':
      case 'error_audio_error':
        return 'not-allowed';
      default:
        return 'generic';
    }
  }

  // 길찾기는 반드시 KNSDK 인앱 내비(NativeBridge.startNavi -> MainActivity/AppDelegate
  // -> NaviActivity/KNNaviViewController)로만 처리한다. 예전에는 이 경로가 실패하면
  // app/lib/navi.ts가 카카오맵 웹 링크(https://map.kakao.com/...)로 폴백했고, 이걸
  // url_launcher로 카카오맵/카카오내비 앱을 여는 외부 실행 폴백이 있었다 — 이러면
  // 인앱 내비가 왜 안 떴는지(KNSDK 초기화 실패, 좌표 변환 실패 등) 원인이 가려진다.
  // 그래서 카카오맵/내비 관련 요청(및 http가 아닌 임의 스킴)은 절대 외부로 보내지
  // 않고 여기서 막은 뒤 원인 진단용 로그만 남긴다.
  Future<NavigationDecision> _handleNavigationRequest(NavigationRequest request) async {
    final uri = Uri.tryParse(request.url);
    if (uri == null) return NavigationDecision.navigate;

    final isHttp = uri.scheme == 'http' || uri.scheme == 'https';
    final isKakaoNaviLink =
        uri.host.contains('map.kakao.com') || uri.host.contains('kakaonavi') || uri.host.contains('kakaomap');

    if (!isHttp || isKakaoNaviLink) {
      debugPrint(
        '[Navi] 외부 앱 실행 요청을 차단함: ${request.url} '
        '(KNSDK 인앱 내비 경로(NativeBridge.startNavi)가 실패했다는 뜻일 수 있음 — '
        '위 [NativeBridge] 로그에서 실패 원인을 확인할 것)',
      );
      if (mounted) _showLaunchFailedMessage();
      return NavigationDecision.prevent;
    }
    return NavigationDecision.navigate;
  }

  void _showLaunchFailedMessage() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('내비게이션을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.')),
    );
  }

  @override
  void dispose() {
    _speech.stop();
    super.dispose();
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
