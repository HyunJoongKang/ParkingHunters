"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

  const start = useCallback(() => {
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
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) onResultRef.current(transcript);
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
