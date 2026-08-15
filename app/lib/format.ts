import type { RegionLabel } from "./geo";
import { getDictionary, type Locale } from "./i18n";
import type { Congestion, ParkingFee, ParkingLot } from "./types";

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

// 실시간 소스가 순간적으로 totalSpots보다 큰 값(예: 46/40)이나 음수를 내려보내는
// 경우가 있어, 화면에 보이기 전에 [0, totalSpots] 범위로 방어적으로 잘라낸다.
export function clampAvailableSpots(available: number, total: number): number {
  return Math.min(Math.max(available, 0), total);
}

// 보정된 잔여 면수가 총 면수와 같으면(=완전히 비어 있음) 반드시 "여유"로, 0이면
// 반드시 "만차"로 강제해 상태 태그가 숫자와 모순되지 않게 한다. 그 사이 구간은
// 대구시 실시간 API가 이미 분류해 내려주는 혼잡도 문구를 그대로 신뢰한다.
export function resolveCongestion(available: number, total: number, apiCongestion: Congestion): Congestion {
  if (total > 0 && available >= total) return "available";
  if (available <= 0) return "full";
  return apiCongestion;
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

// parkingApi.ts의 normalizeName/normalizeDaeguName이 민영 주차장 이름 끝에는 항상
// "(민영)"을 붙이므로(공영은 그런 고정 접미사가 없을 수 있어 반대로는 판별 불가),
// 이 표시만으로 공영/민영 배지를 가른다.
export function isPrivateLot(name: string): boolean {
  return name.includes("민영");
}

// 지도 마커에 표시할 짧은 텍스트 — 실시간 정보가 있으면 혼잡도+잔여 면수를,
// 없으면(="정보없음", 회색 마커) 요금(무료/금액)을 보여준다.
export function formatMarkerLabel(lot: ParkingLot, locale: Locale = "ko"): string {
  const t = getDictionary(locale);
  if (lot.realtimeSupported && lot.availableSpots != null) {
    return `${t.congestionLabel[lot.congestion]} ${lot.availableSpots}${t.spotsUnit}`;
  }
  if (lot.fee.baseFee === 0) return t.badgeFree;
  const amount = lot.fee.baseFee.toLocaleString();
  return locale === "en" ? `₩${amount}` : `${amount}원`;
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
export function transliterateHangul(text: string): string {
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

// 주차장 주소(도로명/지번)는 별도 영문 표기 없이 원본 문자열 그대로 내려오므로,
// 영문 모드에서는 한글 구간만 로마자로 바꿔 화면에 한글이 남지 않게 한다.
// 이상적인 표기 규칙(예: "동인동1가" -> "Dongin-dong 1-ga")까지는 아니어도,
// transliterateHangul이 한글이 아닌 문자(숫자·기호)는 그대로 두므로 완전한
// 로마자 문자열이 된다.
export function getLocalizedAddress(address: string, locale: Locale = "ko"): string {
  return locale === "en" ? transliterateHangul(address) : address;
}

// depth-1(시/도) 지역명 — kakao.ts의 reverseGeocode가 이미 광역시/특별시 등 접미사를
// 제거해 넘겨준다("대구", "서울"). "도"만 남아있는 경우("경상북도")에만 "-do"를
// 붙인다. depth-2/3과 같은 표로 처리하면 "대구"가 "대"+"구(-gu)"로 잘못 갈라져
// "Dae-gu"가 되는 문제가 있어(고유명사 끝 글자가 우연히 구/동 등과 같음), 전용
// 규칙으로 분리했다.
function romanizeSido(sido: string): string {
  if (sido.length > 1 && sido.endsWith("도")) {
    return `${transliterateHangul(sido.slice(0, -1))}-do`;
  }
  return transliterateHangul(sido);
}

// depth-2(시/군/구), depth-3(읍/면/동/리/가) 공통 로마자 접미사 규칙.
const SUB_ADMIN_SUFFIXES: Array<[string, string]> = [
  ["시", "-si"],
  ["군", "-gun"],
  ["구", "-gu"],
  ["읍", "-eup"],
  ["면", "-myeon"],
  ["동", "-dong"],
  ["리", "-ri"],
  ["가", "-ga"],
];

function romanizeSubAdminUnit(word: string): string {
  for (const [ko, romanSuffix] of SUB_ADMIN_SUFFIXES) {
    if (!word.endsWith(ko) || word.length <= ko.length) continue;
    const stem = word.slice(0, -ko.length);
    // "고산1동"처럼 단위명 앞에 숫자가 붙은 경우 숫자 앞부분만 로마자화하고
    // 숫자와 접미사는 그대로 이어 붙인다("Gosan 1-dong").
    const match = stem.match(/^(.*?)(\d+)$/);
    if (match) {
      return `${transliterateHangul(match[1])} ${match[2]}${romanSuffix}`;
    }
    return `${transliterateHangul(stem)}${romanSuffix}`;
  }
  return transliterateHangul(word);
}

// kakao.ts의 reverseGeocode가 돌려주는 행정구역 계층을 화면 표기 문자열로 합친다.
// 한글 모드는 기존처럼 큰 단위 -> 작은 단위("대구 수성구 고산1동"), 영문 모드는
// 로마자 접미사를 붙이고 영어 어순(작은 단위 -> 큰 단위)으로 재배열한다.
// 예(en): "Gosan 1-dong, Suseong-gu, Daegu"
export function formatRegionLabel(region: RegionLabel, locale: Locale = "ko"): string {
  if (locale === "en") {
    return [
      region.dong ? romanizeSubAdminUnit(region.dong) : null,
      region.gu ? romanizeSubAdminUnit(region.gu) : null,
      romanizeSido(region.sido),
    ]
      .filter(Boolean)
      .join(", ");
  }
  return [region.sido, region.gu, region.dong].filter(Boolean).join(" ");
}
