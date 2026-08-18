"use client";

export interface NaviTarget {
  name: string;
  lat: number;
  lng: number;
}

interface ReactNativeWebViewBridge {
  postMessage: (message: string) => void;
}

// 추후 네이티브 앱(WebView) 전환 시, 앱 쪽에서 window.NativeBridge.startNavi를
// 직접 주입해 KNSDK 인앱 내비게이션을 실행하는 용도로 예약해 둔 인터페이스.
interface NativeNaviBridge {
  startNavi: (name: string, lat: number, lng: number) => void;
}

declare global {
  interface Window {
    ReactNativeWebView?: ReactNativeWebViewBridge;
    NativeBridge?: NativeNaviBridge;
  }
}

const NAVI_MESSAGE_TYPE = "startNavi";

function buildKakaoWebNaviUrl({ name, lat, lng }: NaviTarget): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
}

// 지금은 항상 일반 브라우저 환경(window.NativeBridge, window.ReactNativeWebView
// 모두 없음)이라 카카오맵 웹 길찾기를 새 탭으로 연다. 추후 이 페이지를 WebView로
// 감싼 네이티브 앱으로 전환하면, 앱 쪽에서 아래 둘 중 하나를 주입해 분기를 태운다:
//   - window.NativeBridge.startNavi(name, lat, lng) 형태의 커스텀 브리지 함수
//   - window.ReactNativeWebView.postMessage(json)  (React Native WebView 표준 방식,
//     메시지 형태: { type: "startNavi", name, lat, lng })
// 두 브리지 모두 없으면(=지금의 웹 환경) 외부로 이탈하는 웹 링크로 대체한다.
export function startNavigation(target: NaviTarget) {
  if (typeof window === "undefined") return;

  if (!Number.isFinite(target.lat) || !Number.isFinite(target.lng) || (target.lat === 0 && target.lng === 0)) {
    console.error("[navi] 잘못된 좌표로 startNavigation 호출됨:", target);
    return;
  }

  if (window.NativeBridge?.startNavi) {
    console.log("[navi] NativeBridge.startNavi 경로 사용 (KNSDK 인앱 내비)", target);
    window.NativeBridge.startNavi(target.name, target.lat, target.lng);
    return;
  }

  if (window.ReactNativeWebView?.postMessage) {
    console.log("[navi] ReactNativeWebView.postMessage 경로 사용", target);
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: NAVI_MESSAGE_TYPE, name: target.name, lat: target.lat, lng: target.lng })
    );
    return;
  }

  // 여기로 오면 NativeBridge가 아직 주입되지 않았거나(WebView 로드 타이밍 문제)
  // 순수 웹 브라우저 환경이라는 뜻이다. 앱(WebView) 안에서 이 로그가 보이면
  // KNSDK 인앱 내비 대신 카카오맵 웹 링크로 새 창을 여는 중이라는 신호다.
  console.warn("[navi] NativeBridge 없음 — 카카오맵 웹 링크로 폴백", target);
  window.open(buildKakaoWebNaviUrl(target), "_blank", "noopener,noreferrer");
}
