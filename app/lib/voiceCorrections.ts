// 음성 인식이 대구 지명/주차 관련 단어를 사투리 억양이나 발음 유사성 때문에 잘못
// 알아듣는 경우가 흔하다(예: "동성로"를 "동성노"로). STT 엔진 자체를 바꿀 수 없으니
// 인식된 텍스트에 대한 후처리(post-processing)로 알려진 오인식 패턴을 교정한다.
interface Correction {
  pattern: string;
  replacement: string;
}

const DAEGU_VOICE_CORRECTIONS: Correction[] = [
  { pattern: "동성노", replacement: "동성로" },
  { pattern: "동산로", replacement: "동성로" },
  { pattern: "수성모드", replacement: "수성못" },
  { pattern: "수성모", replacement: "수성못" },
  { pattern: "칠성시장은", replacement: "칠성시장" },
  { pattern: "칠성시장역", replacement: "칠성시장" },
  { pattern: "범어역", replacement: "범어" },
  { pattern: "버머", replacement: "범어" },
  { pattern: "반월땅", replacement: "반월당" },
  { pattern: "반월당역", replacement: "반월당" },
  { pattern: "동대구", replacement: "동대구역" },
  { pattern: "공영주차", replacement: "공영주차장" },
  { pattern: "공용주차장", replacement: "공영주차장" },
];

// 긴 패턴부터 적용한다 — "수성모"(3글자) 규칙이 먼저 걸리면 "수성모드"(4글자)의
// 앞부분만 바뀌어 "수성못드"처럼 꼬리가 남는다. 길이 내림차순으로 처리하면 더 구체적인
// (긴) 패턴이 먼저 온전히 소비되고, 짧은 패턴은 그 나머지에만 적용된다.
const SORTED_CORRECTIONS = [...DAEGU_VOICE_CORRECTIONS].sort((a, b) => b.pattern.length - a.pattern.length);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// replacement가 pattern으로 시작하는 경우(예: "동대구" -> "동대구역", "공영주차" ->
// "공영주차장") 이미 정확히 말한 부분("동대구역", "공영주차장")까지 다시 걸려 "동대구역역"
// 처럼 접미사가 중복될 수 있다. replacement의 나머지 접미사가 뒤따르지 않을 때만
// 치환하도록 negative lookahead로 막는다.
function buildPattern({ pattern, replacement }: Correction): RegExp {
  const suffix = replacement.startsWith(pattern) ? replacement.slice(pattern.length) : "";
  const guard = suffix ? `(?!${escapeRegExp(suffix)})` : "";
  return new RegExp(`${escapeRegExp(pattern)}${guard}`, "g");
}

const COMPILED_CORRECTIONS = SORTED_CORRECTIONS.map((entry) => ({
  regex: buildPattern(entry),
  replacement: entry.replacement,
}));

// 음성 인식 결과 텍스트를 대구 지명 교정 단어집으로 후처리한다. 검색을 실행하기 전에
// (setQuery/performSearch로 넘기기 전에) 항상 이 함수를 거친다.
export function correctDaeguVoiceText(text: string): string {
  let result = text;
  for (const { regex, replacement } of COMPILED_CORRECTIONS) {
    result = result.replace(regex, replacement);
  }
  return result;
}
