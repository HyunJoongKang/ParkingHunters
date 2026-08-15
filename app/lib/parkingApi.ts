import { HttpsProxyAgent } from "https-proxy-agent";
import nodeFetch from "node-fetch";
import { haversineDistanceM, type LatLng } from "./geo";
import { clampAvailableSpots, resolveCongestion } from "./format";
import type { ParkingLot } from "./types";

// 공공데이터포털 "전국주차장정보표준데이터" (국토교통부) + 대구광역시 통합주차정보시스템(pis.daegu.go.kr).
// 서버에서만 사용하는 모듈 — 서비스키가 노출되지 않도록 클라이언트 컴포넌트에서 직접 import하지 않는다.
const DEFAULT_API_BASE = "https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api";
const DEFAULT_DAEGU_INFO_ENDPOINT = "https://pis.daegu.go.kr/api/serviceApply/prkInfo";
const DEFAULT_DAEGU_CONGESTION_ENDPOINT = "https://pis.daegu.go.kr/api/serviceApply/rltmPrkInfo";
const PAGE_SIZE = 1000;
// 대구 구간은 실시간 혼잡도를 포함하므로 표준데이터보다 훨씬 짧은 주기로 갱신한다.
// (5분 = 300초 — Next.js의 next.revalidate와 같은 의미의 캐시 주기를 이 앱 자체 캐시로
// 구현한다. 아래 fetchDaeguJson 설명 참고.)
const CACHE_TTL_MS = 5 * 60 * 1000;

interface RawParkingItem {
  prkplceNo: string;
  prkplceNm: string;
  prkplceSe: string; // "공영" | "민영"
  prkplceType: string; // "노외"(주차장 부지) | "노상"(도로변 구간) | "부설" 등
  rdnmadr: string;
  lnmadr: string;
  prkcmprt: string;
  weekdayOperOpenHhmm: string;
  weekdayOperColseHhmm: string; // 원본 API 필드명의 오탈자(Colse)를 그대로 따른다.
  parkingchrgeInfo: string; // "무료" | "유료"
  basicTime: string;
  basicCharge: string;
  addUnitTime: string;
  addUnitCharge: string;
  latitude: string;
  longitude: string;
  insttNm: string;
}

interface RawPage {
  items: RawParkingItem[];
  totalCount: number;
}

interface DaeguZoneEntry {
  dvrPrkZoneSeCd: string; // "일반" | "장애인 전용" | "전기차 전용" 등
  dvrPrkZoneNocmprt: number;
}

interface DaeguPrkInfoItem {
  prkInfo: { pkltId: string; pkltNm: string; useYn: string };
  prkFcltInfo: {
    pkltSeCd: string; // "공영" | "민영"
    pkltTypeCd: string; // "노상" | "노외" | "부설" 등
    roadNmAddr: string | null;
    lotnoAddr: string | null;
    prkNocmprt: number;
    lat: number;
    lot: number; // 필드명은 "lot"이지만 실제 값은 경도(longitude)다.
  };
  prkOperInfo: {
    operHrWkdaySeCd: string; // "전일운영"이면 24시간
    wkdayOperBgngHr: string; // "HHmm" (예: "0800")
    wkdayOperEndHr: string;
    crgLevySeNm: string; // "무료" | "유료"
    gnrlFrstCrgLevyHr: string; // 분 단위 (필드명의 "Hr"와 달리 실제로는 분)
    gnrlFrstCrg: number | null;
    gnrlAddCrgLevyHr: string;
    gnrlMntbyAddCrg: number | null;
  };
  prkZoneInfoList: DaeguZoneEntry[];
}

interface DaeguRltmPrkInfoItem {
  rltmPrkInfo: {
    pkltId: string;
    prkCnfSttsCd: string; // "여유(점유 50%미만)" | "보통(...)" | "혼잡(...)" | "만차(...)"
    totRmndPrkNocmprt: number;
  };
}

let cache: { fetchedAt: number; lots: ParkingLot[] } | null = null;

// 대구시 "주차장정보조회(기본정보)" API 키가 아직 승인 전이거나 일시적으로 401을 반환할 때,
// 화면이 완전히 먹통(에러 페이지)이 되지 않도록 보여줄 최소한의 임시 목록. 실제 API가
// 정상화되면 getCachedLots()가 다음 캐시 주기에 자동으로 실데이터로 교체한다.
const DUMMY_DAEGU_PARKING_LOTS: ParkingLot[] = [
  {
    id: "dummy-daegu-001",
    name: "동성로 공영주차장 (임시 데이터)",
    address: "대구광역시 중구 동성로2가",
    lat: 35.8703,
    lng: 128.5911,
    distanceM: 0,
    totalSpots: 120,
    availableSpots: null,
    congestion: "moderate",
    fee: { baseMin: 30, baseFee: 1000, addMin: 10, addFee: 500 },
    hours: "24시간",
    evSpots: 4,
    disabledSpots: 3,
    realtimeSupported: false,
    lastSyncedMinutesAgo: null,
  },
  {
    id: "dummy-daegu-002",
    name: "반월당 공영주차장 (임시 데이터)",
    address: "대구광역시 중구 남산동",
    lat: 35.8656,
    lng: 128.5875,
    distanceM: 0,
    totalSpots: 200,
    availableSpots: null,
    congestion: "moderate",
    fee: { baseMin: 30, baseFee: 1200, addMin: 10, addFee: 600 },
    hours: "06:00 ~ 24:00",
    evSpots: 6,
    disabledSpots: 4,
    realtimeSupported: false,
    lastSyncedMinutesAgo: null,
  },
  {
    id: "dummy-daegu-003",
    name: "대구역 공영주차장 (임시 데이터)",
    address: "대구광역시 북구 태평로3가",
    lat: 35.8765,
    lng: 128.5939,
    distanceM: 0,
    totalSpots: 150,
    availableSpots: null,
    congestion: "moderate",
    fee: { baseMin: 30, baseFee: 1000, addMin: 10, addFee: 500 },
    hours: "24시간",
    evSpots: 5,
    disabledSpots: 3,
    realtimeSupported: false,
    lastSyncedMinutesAgo: null,
  },
  {
    id: "dummy-daegu-004",
    name: "김광석다시그리기길 주차장 (임시 데이터)",
    address: "대구광역시 중구 대봉동",
    lat: 35.8629,
    lng: 128.6017,
    distanceM: 0,
    totalSpots: 80,
    availableSpots: null,
    congestion: "moderate",
    fee: { baseMin: 0, baseFee: 0, addMin: 0, addFee: 0 },
    hours: "24시간",
    evSpots: 2,
    disabledSpots: 2,
    realtimeSupported: false,
    lastSyncedMinutesAgo: null,
  },
  {
    id: "dummy-daegu-005",
    name: "수성못 공영주차장 (임시 데이터)",
    address: "대구광역시 수성구 두산동",
    lat: 35.8264,
    lng: 128.6208,
    distanceM: 0,
    totalSpots: 100,
    availableSpots: null,
    congestion: "moderate",
    fee: { baseMin: 30, baseFee: 500, addMin: 10, addFee: 300 },
    hours: "24시간",
    evSpots: 3,
    disabledSpots: 2,
    realtimeSupported: false,
    lastSyncedMinutesAgo: null,
  },
];

function mapFee(item: RawParkingItem) {
  const baseMin = Number(item.basicTime) || 0;
  if (item.parkingchrgeInfo !== "유료" || !item.basicCharge) {
    return { baseMin, baseFee: 0, addMin: 0, addFee: 0 };
  }
  return {
    baseMin,
    baseFee: Number(item.basicCharge) || 0,
    addMin: Number(item.addUnitTime) || 0,
    addFee: Number(item.addUnitCharge) || 0,
  };
}

// "하양읍 대경로"처럼 도로변 구간(노상주차장)이 도로명만으로 등록된 경우가 많아,
// 이름만 보면 주차장이 아니라 도로처럼 보인다. "주차" 표기가 없으면 유형을 붙여 명확히 한다.
function normalizeName(item: RawParkingItem): string {
  const raw = item.prkplceNm?.trim();
  const isPrivate = item.prkplceSe === "민영";
  if (!raw) return isPrivate ? "이름 미상 주차장 (민영)" : "이름 미상 공영주차장";
  if (isPrivate) return raw.includes("주차") ? `${raw} (민영)` : `${raw} 주차장 (민영)`;
  if (raw.includes("주차")) return raw;
  const suffix = item.prkplceType === "노상" ? "노상주차장" : "공영주차장";
  return `${raw} (${suffix})`;
}

function mapHours(item: RawParkingItem): string {
  const open = item.weekdayOperOpenHhmm;
  const close = item.weekdayOperColseHhmm;
  if (!open || !close) return "운영시간 정보 없음";
  if (open === "00:00" && (close === "23:59" || close === "24:00")) return "24시간";
  return `${open} ~ ${close}`;
}

function mapItem(item: RawParkingItem): ParkingLot | null {
  const lat = Number(item.latitude);
  const lng = Number(item.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return null;
  }
  return {
    id: item.prkplceNo,
    name: normalizeName(item),
    address: item.rdnmadr?.trim() || item.lnmadr?.trim() || "주소 정보 없음",
    lat,
    lng,
    distanceM: 0, // 조회 시점에 haversine으로 다시 계산해 채운다.
    totalSpots: Number(item.prkcmprt) || 0,
    // 이 표준데이터는 실시간 여유 정보를 제공하지 않는 정적 데이터라 항상 null/false.
    availableSpots: null,
    congestion: "moderate",
    fee: mapFee(item),
    hours: mapHours(item),
    evSpots: 0,
    disabledSpots: 0,
    realtimeSupported: false,
    lastSyncedMinutesAgo: null,
  };
}

function mapDaeguCongestionCode(code: string | undefined): ParkingLot["congestion"] {
  if (code?.startsWith("여유")) return "available";
  if (code?.startsWith("보통")) return "moderate";
  if (code?.startsWith("혼잡")) return "busy";
  if (code?.startsWith("만차")) return "full";
  return "moderate";
}

function normalizeDaeguName(item: DaeguPrkInfoItem): string {
  const raw = item.prkInfo.pkltNm?.trim();
  const isPrivate = item.prkFcltInfo.pkltSeCd === "민영";
  if (!raw) return isPrivate ? "이름 미상 주차장 (민영)" : "이름 미상 공영주차장";
  if (isPrivate) return raw.includes("주차") ? `${raw} (민영)` : `${raw} 주차장 (민영)`;
  if (raw.includes("주차")) return raw;
  const suffix = item.prkFcltInfo.pkltTypeCd === "노상" ? "노상주차장" : "공영주차장";
  return `${raw} (${suffix})`;
}

function formatHhmm(hhmm: string): string {
  return hhmm.length === 4 ? `${hhmm.slice(0, 2)}:${hhmm.slice(2)}` : hhmm;
}

function mapDaeguHours(op: DaeguPrkInfoItem["prkOperInfo"]): string {
  if (op.operHrWkdaySeCd === "전일운영") return "24시간";
  const { wkdayOperBgngHr: open, wkdayOperEndHr: close } = op;
  if (!open || !close) return "운영시간 정보 없음";
  return `${formatHhmm(open)} ~ ${formatHhmm(close)}`;
}

function mapDaeguFee(op: DaeguPrkInfoItem["prkOperInfo"]) {
  if (op.crgLevySeNm !== "유료") {
    return { baseMin: 0, baseFee: 0, addMin: 0, addFee: 0 };
  }
  return {
    baseMin: Number(op.gnrlFrstCrgLevyHr) || 0,
    baseFee: Number(op.gnrlFrstCrg) || 0,
    addMin: Number(op.gnrlAddCrgLevyHr) || 0,
    addFee: Number(op.gnrlMntbyAddCrg) || 0,
  };
}

function countDaeguZones(zones: DaeguZoneEntry[], keyword: string): number {
  return zones.filter((z) => z.dvrPrkZoneSeCd?.includes(keyword)).reduce((sum, z) => sum + (z.dvrPrkZoneNocmprt || 0), 0);
}

function mapDaeguItem(
  item: DaeguPrkInfoItem,
  congestionByPkltId: Map<string, DaeguRltmPrkInfoItem["rltmPrkInfo"]>
): ParkingLot | null {
  const { lat, lot: lng } = item.prkFcltInfo;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return null;
  }

  const realtime = congestionByPkltId.get(item.prkInfo.pkltId);
  const totalSpots = item.prkFcltInfo.prkNocmprt || 0;
  // 대구시 실시간 API가 순간적으로 totalSpots보다 큰 잔여 면수(예: 46/40)를 내려보내는
  // 경우가 있어, 화면에 닿기 전에 여기서 한 번 보정하고 상태 태그도 그 값과 맞춘다.
  const availableSpots = realtime ? clampAvailableSpots(realtime.totRmndPrkNocmprt, totalSpots) : null;
  const congestion =
    realtime && availableSpots != null
      ? resolveCongestion(availableSpots, totalSpots, mapDaeguCongestionCode(realtime.prkCnfSttsCd))
      : "moderate";

  return {
    id: item.prkInfo.pkltId,
    name: normalizeDaeguName(item),
    address: item.prkFcltInfo.roadNmAddr?.trim() || item.prkFcltInfo.lotnoAddr?.trim() || "주소 정보 없음",
    lat,
    lng,
    distanceM: 0, // 조회 시점에 haversine으로 다시 계산해 채운다.
    totalSpots,
    availableSpots,
    congestion,
    fee: mapDaeguFee(item.prkOperInfo),
    hours: mapDaeguHours(item.prkOperInfo),
    evSpots: countDaeguZones(item.prkZoneInfoList, "전기"),
    disabledSpots: countDaeguZones(item.prkZoneInfoList, "장애인"),
    realtimeSupported: Boolean(realtime),
    lastSyncedMinutesAgo: realtime ? 0 : null,
  };
}

// 대구시 API(기본정보/혼잡도 모두)는 신청 시 등록한 고정 IP만 허용하는 화이트리스트
// 방식이라, Vercel 서버리스 환경의 매 요청마다 바뀌는 아웃바운드 IP로는 인증이
// 거부된다(HTTP 401). FIXIE_URL(Fixie 등 고정 IP 프록시 URL)이 설정돼 있으면 두
// 호출 모두 그 프록시를 거쳐 나가 항상 같은 고정 IP로 보이게 한다 — Vercel 기본
// 유동 IP는 등록 자체가 불가능하므로(계속 바뀜), 프록시 없이는 절대 통과할 수 없다.
//
// 실제로 curl로 직접 확인한 결과: 이 프록시의 고정 IP(52.5.155.132)는 혼잡도뿐 아니라
// 기본정보 API에도 아직 화이트리스트 등록이 안 돼 있어 401이 난다(대구시 쪽 조치 필요).
// 그래서 앱이 먹통되지 않도록 DUMMY_DAEGU_PARKING_LOTS 폴백이 항상 필요하다.
//
// 전역 fetch()(undici 기반)는 프록시 연결에 쓰는 dispatcher/agent 옵션을 안정적으로
// 지원하지 않는다 — Next.js가 자체 fetch 패치를 씌워 dispatcher가 씹히는 사례가
// 보고돼 있다(https://github.com/vercel/next.js/discussions/81916). 그래서 이 호출은
// http.Agent 기반 프록시(https-proxy-agent)를 정식으로 지원하는 node-fetch를 쓴다.
const daeguProxyAgent = process.env.FIXIE_URL ? new HttpsProxyAgent(process.env.FIXIE_URL) : undefined;

// 캐시 주기(5분): Next.js의 fetch 옵션인 next: { revalidate: 300 }은 여기서 쓸 수 없다 —
// 그 캐시는 Next.js가 패치한 전역 fetch()에만 걸리고, node-fetch(위 daeguProxyAgent 주석
// 참고 — 프록시 agent 옵션 때문에 이걸 쓴다)에는 그런 훅 자체가 없어 조용히 무시된다.
// 대신 getCachedLots()의 CACHE_TTL_MS(5 * 60 * 1000)가 이 호출들을 감싸 같은 효과(5분에
// 한 번만 대구시 API를 실제로 호출)를 낸다.
async function fetchDaeguJson<T>(
  endpoint: string,
  key: string,
  label: string,
  agent?: HttpsProxyAgent<string>
): Promise<T[]> {
  const res = await nodeFetch(endpoint, {
    headers: {
      accept: "application/json;charset=UTF-8",
      Authentication: key,
    },
    agent,
  });
  if (!res.ok) {
    throw new Error(`${label} API 요청 실패 (HTTP ${res.status})`);
  }
  // node-fetch의 json()은 unknown을 반환한다(네이티브 fetch는 any) — 이 API의
  // 응답 형태를 강타입으로 정의해 두지 않은 기존 스타일을 그대로 유지한다.
  const json = (await res.json()) as any;
  if (json?.resultCode !== "200") {
    throw new Error(`${label} API 오류: ${json?.message ?? "알 수 없는 오류"}`);
  }
  console.log(`[대구시 API] ${label} 200 OK — ${json?.totCnt ?? json?.data?.length ?? 0}건 수신`);
  return json?.data ?? [];
}

async function loadDaeguCityParkingLots(): Promise<ParkingLot[]> {
  const infoEndpoint = process.env.DAEGU_PARKING_INFO_ENDPOINT || DEFAULT_DAEGU_INFO_ENDPOINT;
  const infoKey = process.env.DAEGU_PARKING_INFO_KEY;
  const congestionEndpoint = process.env.DAEGU_PARKING_CONGESTION_ENDPOINT || DEFAULT_DAEGU_CONGESTION_ENDPOINT;
  const congestionKey = process.env.DAEGU_PARKING_CONGESTION_KEY;

  // 기본정보 API 키가 아직 없거나(승인 대기) 호출 자체가 실패(401 등)하면, 화면이 완전히
  // 멈추는 대신 DUMMY_DAEGU_PARKING_LOTS로 대체한다. 키가 정상화되면 다음 캐시 주기
  // (CACHE_TTL_MS)에 자동으로 실데이터로 교체된다.
  if (!infoKey) {
    console.warn("[대구시 API] DAEGU_PARKING_INFO_KEY가 설정되어 있지 않아 임시 주차장 목록으로 대체합니다.");
    return DUMMY_DAEGU_PARKING_LOTS;
  }

  let infoItems: DaeguPrkInfoItem[];
  try {
    infoItems = await fetchDaeguJson<DaeguPrkInfoItem>(infoEndpoint, infoKey, "주차장 기본정보", daeguProxyAgent);
  } catch (err) {
    console.warn(
      `[대구시 API] 기본정보 조회 실패 — 임시 주차장 목록으로 대체합니다: ${(err as Error).message}`
    );
    return DUMMY_DAEGU_PARKING_LOTS;
  }

  // 실시간 혼잡도는 부가 정보라, 이 호출이 실패해도(키 미설정/401 등) 기본정보만으로
  // 목록은 계속 보여준다 — 혼잡도 표시만 "moderate" 기본값으로 빠진다.
  let congestionItems: DaeguRltmPrkInfoItem[] = [];
  if (!congestionKey) {
    console.warn(
      "[대구시 API] DAEGU_PARKING_CONGESTION_KEY가 설정되어 있지 않아 혼잡도 없이 기본정보만 표시합니다."
    );
  } else {
    try {
      congestionItems = await fetchDaeguJson<DaeguRltmPrkInfoItem>(
        congestionEndpoint,
        congestionKey,
        "실시간 주차 혼잡도",
        daeguProxyAgent
      );
    } catch (err) {
      console.warn(
        `[대구시 API] 실시간 혼잡도 조회 실패 — 혼잡도 없이 기본정보만 표시합니다: ${(err as Error).message}`
      );
    }
  }

  const congestionByPkltId = new Map(
    congestionItems.map((c) => [c.rltmPrkInfo.pkltId, c.rltmPrkInfo])
  );

  const lots: ParkingLot[] = [];
  for (const item of infoItems) {
    if (item.prkInfo.useYn !== "Y") continue;
    const lot = mapDaeguItem(item, congestionByPkltId);
    if (lot) lots.push(lot);
  }
  return lots;
}

async function fetchPage(apiBase: string, serviceKey: string, pageNo: number): Promise<RawPage> {
  // serviceKey는 발급 시점에 이미 URL 인코딩된 값이므로 encodeURIComponent로 재인코딩하지 않는다.
  const url = `${apiBase}?serviceKey=${serviceKey}&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&type=json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`전국주차장정보표준데이터 API 요청 실패 (HTTP ${res.status})`);
  }
  const json = await res.json();
  if (json?.header?.resultCode !== "00") {
    throw new Error(`전국주차장정보표준데이터 API 오류: ${json?.header?.resultMsg ?? "알 수 없는 오류"}`);
  }
  return {
    items: json?.body?.items?.item ?? [],
    totalCount: json?.body?.totalCount ?? 0,
  };
}

// 대구는 실시간 혼잡도까지 제공하는 대구시 API(loadDaeguCityParkingLots)로 대체했으므로,
// 여기서는 그 API가 다루지 않는 경상북도만 표준데이터에서 가져온다.
async function loadGyeongbukParkingLots(): Promise<ParkingLot[]> {
  const apiBase = process.env.DATA_GO_KR_PARKING_ENDPOINT || DEFAULT_API_BASE;
  const serviceKey = process.env.DATA_GO_KR_PARKING_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error("DATA_GO_KR_PARKING_SERVICE_KEY가 설정되어 있지 않습니다.");
  }

  const first = await fetchPage(apiBase, serviceKey, 1);
  const totalPages = Math.max(1, Math.ceil(first.totalCount / PAGE_SIZE));
  const restPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => fetchPage(apiBase, serviceKey, i + 2))
  );

  const lots: ParkingLot[] = [];
  for (const page of [first, ...restPages]) {
    for (const item of page.items) {
      if (!item.insttNm?.includes("경상북도")) continue;
      const lot = mapItem(item);
      if (lot) lots.push(lot);
    }
  }
  return lots;
}

async function getCachedLots(): Promise<ParkingLot[]> {
  const now = Date.now();
  if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
    const [daeguCityLots, gyeongbukLots] = await Promise.all([
      loadDaeguCityParkingLots(),
      loadGyeongbukParkingLots(),
    ]);
    cache = { fetchedAt: now, lots: [...daeguCityLots, ...gyeongbukLots] };
  }
  return cache.lots;
}

export async function getNearestParkingLots(
  origin: LatLng | null,
  limit: number,
  radiusM?: number
): Promise<ParkingLot[]> {
  const lots = await getCachedLots();

  if (!origin) {
    return lots.slice(0, limit);
  }

  const withDistance = [...lots]
    .map((lot) => ({ ...lot, distanceM: haversineDistanceM(origin, { lat: lot.lat, lng: lot.lng }) }))
    .sort((a, b) => a.distanceM - b.distanceM);

  const withinRadius =
    radiusM != null && radiusM > 0 ? withDistance.filter((lot) => lot.distanceM <= radiusM) : withDistance;

  return withinRadius.slice(0, limit);
}
