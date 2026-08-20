"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { correctDaeguVoiceText } from "./voiceCorrections";

// 표준 SpeechRecognition은 아직 lib.dom.d.ts에 없고(webkit 접두사 시절 API가 그대로
// 굳어진 상태), 별도 타입 패키지를 추가하지 않기로 해서(요구사항: 추가 라이브러리
// 설치 없이 구현) 여기서 필요한 만큼만 최소로 선언한다. kakao.ts의 `window.kakao: any`
// 패턴과 동일하게 엄격한 타이핑은 포기하고 any로 둔다.
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export type VoiceLang = "ko-KR" | "en-US";

export type VoiceSearchErrorCode =
  | "unsupported"
  | "insecure"
  | "not-allowed"
  | "no-speech"
  | "network"
  | "aborted"
  | "generic";

interface UseVoiceSearchOptions {
  lang: VoiceLang;
  onResult: (transcript: string) => void;
  onError: (code: VoiceSearchErrorCode) => void;
}

// 브라우저의 SpeechRecognition 에러 코드(event.error)를 우리가 구분해서 안내할 몇
// 가지 케이스로 좁힌다. 문서화된 값: no-speech, aborted, audio-capture, network,
// not-allowed, service-not-allowed, bad-grammar, language-not-supported.
function mapErrorCode(rawCode: string | undefined): VoiceSearchErrorCode {
  switch (rawCode) {
    case "not-allowed":
    case "service-not-allowed":
    case "audio-capture":
      return "not-allowed";
    case "no-speech":
      return "no-speech";
    case "network":
      return "network";
    case "aborted":
      return "aborted";
    default:
      return "generic";
  }
}

// navigator.permissions로 마이크 권한 상태를 먼저 확인한다 — 'denied'면 브라우저가
// 팝업조차 안 띄우므로 SpeechRecognition.start()를 시도하기 전에 걸러서 더 명확한
// 안내(설정에서 직접 풀어야 함)를 줄 수 있다. 'prompt'(아직 결정 안 됨)이면 실제
// getUserMedia를 호출해 권한 팝업을 띄운다 — 이 스트림 자체는 SpeechRecognition이
// 내부적으로 별도 캡처를 하므로 권한만 확인한 뒤 즉시 트랙을 정지한다. Permissions
// API가 "microphone" 이름을 지원하지 않는 브라우저(Firefox 등)에서는 조용히 넘어가고
// SpeechRecognition 자체의 onerror 처리에 맡긴다 — 다른 기능에 영향 없는 비침습적
// 처리를 위해 여기서 던지는 예외는 전부 삼킨다.
async function checkMicrophonePermission(): Promise<"granted" | "denied" | "unavailable"> {
  if (typeof navigator === "undefined") return "unavailable";

  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
      if (status.state === "granted") return "granted";
      if (status.state === "denied") return "denied";
      // status.state === "prompt" — 아래에서 실제 권한 팝업을 띄워 결정을 받는다.
    }
  } catch {
    // "microphone" 권한 이름을 모르는 브라우저 — 무시하고 getUserMedia로 넘어간다.
  }

  if (!navigator.mediaDevices?.getUserMedia) return "unavailable";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return "granted";
  } catch {
    return "denied";
  }
}

// Web Speech API(webkitSpeechRecognition)만으로 음성 검색을 구현한 훅. 별도 npm
// 패키지 없이, 브라우저가 기본 제공하는 SpeechRecognition/webkitSpeechRecognition
// 생성자를 그대로 쓴다. 지원하지 않는 브라우저이거나(대부분의 Firefox 등)
// HTTPS가 아닌 컨텍스트, 마이크 권한 거부 등은 onError로 콜백해 호출부가 UI
// 알림(토스트 등)으로 안내하게 한다.
export function useVoiceSearch({ lang, onResult, onError }: UseVoiceSearchOptions) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  // start()/onResult/onError가 최신 값을 참조하도록 ref로 들고 있는다 — recognition
  // 인스턴스는 start() 시점에 한 번만 만들어지고 그 안의 콜백은 그때의 클로저를 쓰므로,
  // 매 렌더마다 recognition을 새로 만들지 않으면서도 최신 lang/콜백을 반영해야 한다.
  const langRef = useRef(lang);
  langRef.current = lang;
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const isSupported =
    typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (recognitionRef.current) return; // 이미 듣고 있는 중이면 중복 시작하지 않는다.

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      onErrorRef.current("unsupported");
      return;
    }
    // getUserMedia(마이크 접근)는 HTTPS(또는 localhost) 같은 보안 컨텍스트가 아니면
    // 브라우저가 애초에 허용하지 않는다 — 실행 전에 먼저 걸러서 더 명확한 안내를 준다.
    if (window.isSecureContext === false) {
      onErrorRef.current("insecure");
      return;
    }

    const permission = await checkMicrophonePermission();
    if (permission === "denied") {
      onErrorRef.current("not-allowed");
      return;
    }
    // permission이 "granted"거나(방금 프롬프트에서 막 허용받은 경우 포함) "unavailable"
    // (권한 API 자체를 지원 안 하는 브라우저)이면 계속 진행한다 — "unavailable"인 경우
    // recognition.start()가 실패하면 onerror가 걸러준다.
    if (recognitionRef.current) return; // 권한 확인이 비동기로 도는 사이 이미 다른 시작 요청이 있었으면 중복 방지.

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = langRef.current;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = (event: { error?: string }) => {
      setIsListening(false);
      recognitionRef.current = null;
      onErrorRef.current(mapErrorCode(event?.error));
    };
    recognition.onresult = (event: { results: { [index: number]: { [index: number]: { transcript?: string } } } }) => {
      const rawTranscript = event.results?.[0]?.[0]?.transcript?.trim();
      if (rawTranscript) onResultRef.current(correctDaeguVoiceText(rawTranscript));
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      onErrorRef.current("generic");
    }
  }, []);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  // 언어를 바꾸는 동안 듣고 있었다면 새 언어로 다시 시작해야 하니 일단 멈춘다 —
  // recognition.lang은 시작 후에는 바꿔도 반영되지 않는 구현이 대부분이다.
  useEffect(() => {
    if (isListening) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return { isListening, isSupported, toggle };
}
