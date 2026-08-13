"use client";

import { useEffect } from "react";
import { loadKakaoMapsSdk } from "../lib/kakao";

// 레이아웃에 마운트되어 앱 진입 시점부터 Kakao Maps SDK를 미리 불러와 둔다.
// 화면을 렌더링하지 않는 순수 로더 컴포넌트.
export default function KakaoMapsLoader() {
  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!appKey) {
      console.error(
        "[KakaoSDK] NEXT_PUBLIC_KAKAO_JS_KEY가 설정되어 있지 않습니다. .env.local을 확인해 주세요."
      );
      return;
    }
    console.log("[KakaoSDK] 로드 시작. appKey 길이:", appKey.length);
    loadKakaoMapsSdk(appKey)
      .then(() => {
        console.log(
          "[KakaoSDK] 로드 완료. services 사용 가능:",
          Boolean(window.kakao?.maps?.services)
        );
      })
      .catch((err) => {
        console.error("[KakaoSDK] 로드 실패:", err);
      });
  }, []);

  return null;
}
