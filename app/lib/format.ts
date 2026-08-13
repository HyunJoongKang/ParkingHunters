import { getDictionary, type Locale } from "./i18n";
import type { Congestion, ParkingFee } from "./types";

export const CONGESTION_COLOR: Record<Congestion, string> = {
  available: "#1fa971",
  moderate: "#d4a017",
  busy: "#e07a2c",
  full: "#e0473d",
};

export const UNKNOWN_COLOR = "#94a3ac";

export function statusColor(realtimeSupported: boolean, congestion: Congestion): string {
  return realtimeSupported ? CONGESTION_COLOR[congestion] : UNKNOWN_COLOR;
}

export function congestionLabel(congestion: Congestion, locale: Locale = "ko"): string {
  return getDictionary(locale).congestionLabel[congestion];
}

export function statusLabel(
  realtimeSupported: boolean,
  congestion: Congestion,
  locale: Locale = "ko"
): string {
  const t = getDictionary(locale);
  return realtimeSupported ? t.congestionLabel[congestion] : t.statusUnknown;
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

// 60분 이상이면 "시간" 단위로 바꿔 표시한다(예: 90 -> "1시간 30분").
// 요금 안내는 분 단위 숫자만 나열하면 "150분"처럼 한눈에 안 들어와서, 기본/추가
// 요금 문구에 공통으로 쓴다.
export function formatMinutesDuration(minutes: number, locale: Locale = "ko"): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (locale === "en") {
    const min = (n: number) => `${n} ${n === 1 ? "min" : "mins"}`;
    const hr = (n: number) => `${n} ${n === 1 ? "hr" : "hrs"}`;
    if (minutes < 60) return min(minutes);
    return rest === 0 ? hr(hours) : `${hr(hours)} ${min(rest)}`;
  }
  if (minutes < 60) return `${minutes}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

export function formatBaseFee(fee: ParkingFee, locale: Locale = "ko"): string {
  const duration = formatMinutesDuration(fee.baseMin, locale);
  if (fee.baseFee === 0) {
    return locale === "en" ? `${duration} free` : `${duration} 무료`;
  }
  const amount = fee.baseFee.toLocaleString();
  return locale === "en" ? `${duration} ₩${amount}` : `${duration} ${amount}원`;
}

export function formatAddFee(fee: ParkingFee, locale: Locale = "ko"): string {
  if (fee.addMin === 0 || fee.addFee === 0) {
    return locale === "en" ? "No additional fee" : "추가 요금 없음";
  }
  const duration = formatMinutesDuration(fee.addMin, locale);
  const amount = fee.addFee.toLocaleString();
  return locale === "en" ? `₩${amount} per ${duration}` : `${duration}당 ${amount}원`;
}

export function formatFee(fee: ParkingFee, locale: Locale = "ko"): string {
  return locale === "en"
    ? `Base ${formatBaseFee(fee, locale)} · Then ${formatAddFee(fee, locale)}`
    : `기본 ${formatBaseFee(fee, locale)} · 이후 ${formatAddFee(fee, locale)}`;
}

export function formatSyncedAgo(minutes: number | null, locale: Locale = "ko"): string {
  const t = getDictionary(locale);
  if (minutes === null) return t.syncedUnsupported;
  if (minutes === 0) return t.syncedJustNow;
  return t.syncedMinutesAgo(minutes);
}

// ---- 한글 → 로마자(개정 로마자 표기법 근사) ----
// 완전한 국립국어원 표기 규칙(구개음화·경음화 등)을 전부 구현하진 않지만, 지명에서
// 흔히 나타나 결과를 크게 좌우하는 비음화·유음화는 반영한다. 그렇지 않으면 "약령시"가
// 발음과 다른 "Yaknyeongsi"로 나온다 — ㄱ받침 뒤에 ㄹ이 오면 실제로는 "양녕시"로
// 발음되므로, 그 규칙을 적용해야 공식 표기인 "Yangnyeongsi"가 나온다.
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const MEDIALS_COUNT = 21;
const FINALS_COUNT = 28;

const INITIAL_ROMAN = [
  "g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s",
  "ss", "", "j", "jj", "ch", "k", "t", "p", "h",
];
const MEDIAL_ROMAN = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa",
  "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i",
];
// 받침(종성)은 실제 발음대로 대표음 7개(k/n/t/l/m/p/ng)로 단순화한다. ㄺ·ㄼ 같은
// 겹받침은 흔한 지명 표기 관행에 맞춰 근사치로 매핑했다.
const FINAL_ROMAN = [
  "", "k", "k", "k", "n", "n", "n", "t", "l", "k",
  "m", "l", "l", "l", "p", "l", "m", "p", "p", "t",
  "t", "ng", "t", "t", "k", "t", "p", "t",
];

const INITIAL_N = 2;
const INITIAL_R = 5;
const INITIAL_M = 6;

function isHangulSyllable(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code >= HANGUL_BASE && code <= HANGUL_LAST;
}

function decomposeHangul(ch: string) {
  const code = ch.codePointAt(0)! - HANGUL_BASE;
  return {
    initial: Math.floor(code / (MEDIALS_COUNT * FINALS_COUNT)),
    medial: Math.floor((code % (MEDIALS_COUNT * FINALS_COUNT)) / FINALS_COUNT),
    final: code % FINALS_COUNT,
  };
}

// 2음절씩 묶어 하나의 "단어"처럼 대문자로 시작하는 덩어리로 나눈다(예: "경상감영"
// 4음절 -> "Gyeongsang"+"Gamyeong"). 홀수로 남는 마지막 한 음절은 새 단어를 만들지
// 않고 직전 덩어리에 붙인다(예: "약령시" 3음절 -> "Yangnyeongsi" 하나로 유지).
function chunkIntoWords(syllables: string[]): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < syllables.length; i += 2) {
    const pair = syllables.slice(i, i + 2);
    if (pair.length === 1 && chunks.length > 0) {
      chunks[chunks.length - 1] += pair[0];
    } else {
      chunks.push(pair.join(""));
    }
  }
  return chunks.map((word) => word.charAt(0).toUpperCase() + word.slice(1));
}

// 한글 음절이 이어지는 구간 하나를 로마자로 바꾼다. 인접한 두 음절 사이의
// 자음 동화(비음화 "약+령"->"양+녕", 유음화 "신+라"->"실+라")를 먼저 반영한 뒤
// 음절 단위로 조합한다.
function romanizeHangulRun(run: string): string {
  const syllables = [...run].map(decomposeHangul);
  const initials = syllables.map((s) => s.initial);
  const finalSounds = syllables.map((s) => FINAL_ROMAN[s.final]);

  for (let i = 0; i < syllables.length - 1; i++) {
    const nextInitial = initials[i + 1];
    if (finalSounds[i] === "k" && (nextInitial === INITIAL_N || nextInitial === INITIAL_M)) {
      finalSounds[i] = "ng";
    } else if (finalSounds[i] === "t" && (nextInitial === INITIAL_N || nextInitial === INITIAL_M)) {
      finalSounds[i] = "n";
    } else if (finalSounds[i] === "p" && (nextInitial === INITIAL_N || nextInitial === INITIAL_M)) {
      finalSounds[i] = "m";
    } else if (finalSounds[i] === "k" && nextInitial === INITIAL_R) {
      finalSounds[i] = "ng";
      initials[i + 1] = INITIAL_N;
    } else if (finalSounds[i] === "p" && nextInitial === INITIAL_R) {
      finalSounds[i] = "m";
      initials[i + 1] = INITIAL_N;
    } else if (finalSounds[i] === "n" && nextInitial === INITIAL_R) {
      finalSounds[i] = "l";
    } else if (finalSounds[i] === "l" && nextInitial === INITIAL_N) {
      initials[i + 1] = INITIAL_R;
    }
  }

  const romanizedSyllables = syllables.map(
    (s, i) => INITIAL_ROMAN[initials[i]] + MEDIAL_ROMAN[s.medial] + finalSounds[i]
  );
  return chunkIntoWords(romanizedSyllables).join(" ");
}

// 임의 텍스트를 순회하며 한글 음절 구간만 로마자로 바꾸고, 공백·숫자·괄호·영문
// 등 그 외 문자는 그대로 둔다.
function transliterateHangul(text: string): string {
  let result = "";
  let i = 0;
  while (i < text.length) {
    if (isHangulSyllable(text[i])) {
      let j = i + 1;
      while (j < text.length && isHangulSyllable(text[j])) j++;
      result += romanizeHangulRun(text.slice(i, j));
      i = j;
    } else {
      result += text[i];
      i++;
    }
  }
  return result;
}

// 전국주차장정보표준데이터의 이름은 "OO공영주차장"처럼 고유명사 뒤에 유형이 붙는
// 형태다. 유형 단어는 뜻으로 옮기고("공영주차장" -> "Public Parking"), 로마자
// 표기가 없는 고유명사(예: "남산", "약령시")는 위 로마자화 함수로 음역해 자연스러운
// 영문 문장으로 합친다(괄호 병기 없이) — 예: "남산공영주차장" -> "Namsan Public Parking".
// 아래 목록에 없는 유형(예: "OO환승주차장")도 통째로 음역해, 어떤 이름이든 한글이
// 그대로 남지 않게 한다.
const PARKING_TYPE_SUFFIXES: Array<[string, string]> = [
  ["노외주차장", "Off-street Parking"],
  ["부설주차장", "Attached Parking"],
  ["민영주차장", "Private Parking"],
  ["공영주차장", "Public Parking"],
  ["공용주차장", "Public Parking"],
  ["노상주차장", "On-street Parking"],
  ["주차장", "Parking"],
];

// 고유명사 자리에 자주 등장하는 일반명사는 음역 대신 뜻으로 옮긴다(예: "공원" ->
// "Park"). 접미사로만 검사하므로 목록은 짧게 유지한다 — 지나치게 넓히면 실제
// 고유명사 일부를 오역할 수 있다.
const COMMON_PLACE_WORDS: Array<[string, string]> = [
  ["공원", "Park"],
  ["광장", "Square"],
  ["시장", "Market"],
  ["사거리", "Intersection"],
];

// parkingApi.ts의 normalizeName이 이름 없는 항목에 붙이는 고정 문자열 — 실제
// 지명이 아니라 앱이 생성한 문구라 그대로 영문으로 옮길 수 있다.
const UNNAMED_LOT_KO = "이름 미상 공영주차장";
const UNNAMED_LOT_EN = "Unnamed Public Parking";

export function getLocalizedParkingName(name: string, locale: Locale = "ko"): string {
  if (locale !== "en") return name;
  if (name === UNNAMED_LOT_KO) return UNNAMED_LOT_EN;

  for (const [ko, en] of PARKING_TYPE_SUFFIXES) {
    // 유형 단어는 대부분 이름 끝에 오지만("OO공영주차장"), "남천 노외주차장 앞"처럼
    // 뒤에 부가 설명이 더 붙는 경우도 있어 끝에서만 찾지 않고 문자열 전체에서 찾는다.
    // 앞뒤에 남는 텍스트(고유명사, "앞" 같은 부가 표기, normalizeName이 붙이는
    // "(...)" 괄호)는 모두 하나로 합쳐 로마자화할 고유명사로 취급한다.
    const index = name.lastIndexOf(ko);
    if (index === -1) continue;

    const before = name
      .slice(0, index)
      .replace(/\(\s*$/, "")
      .trim();
    const after = name
      .slice(index + ko.length)
      .replace(/^\)\s*/, "")
      .trim();
    const remainder = [before, after].filter(Boolean).join(" ");
    if (!remainder) return en;

    const placeMatch = COMMON_PLACE_WORDS.find(([placeKo]) => remainder.endsWith(placeKo));
    if (placeMatch) {
      const [placeKo, placeEn] = placeMatch;
      const prefix = remainder.slice(0, -placeKo.length).trim();
      const prefixRoman = prefix ? transliterateHangul(prefix) : "";
      return [prefixRoman, placeEn, en].filter(Boolean).join(" ");
    }

    return `${transliterateHangul(remainder)} ${en}`;
  }

  return transliterateHangul(name);
}
