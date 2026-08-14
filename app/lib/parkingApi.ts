import { haversineDistanceM, type LatLng } from "./geo";
import type { ParkingLot } from "./types";

// 공공데이터포털 "전국주차장정보표준데이터" (국토교통부) + 대구광역시 통합주차정보시스템(pis.daegu.go.kr).
// 서버에서만 사용하는 모듈 — 서비스키가 노출되지 않도록 클라이언트 컴포넌트에서 직접 import하지 않는다.
const DEFAULT_API_BASE = "https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api";
const DEFAULT_DAEGU_INFO_ENDPOINT = "https://pis.daegu.go.kr/api/serviceApply/prkInfo";
const DEFAULT_DAEGU_CONGESTION_ENDPOINT = "https://pis.daegu.go.kr/api/serviceApply/rltmPrkInfo";
const PAGE_SIZE = 1000;
// 대구 구간은 실시간 혼잡도를 포함하므로 표준데이터보다 훨씬 짧은 주기로 갱신한다.
const CACHE_TTL_MS = 2 * 60 * 1000;

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

  return {
    id: item.prkInfo.pkltId,
    name: normalizeDaeguName(item),
    address: item.prkFcltInfo.roadNmAddr?.trim() || item.prkFcltInfo.lotnoAddr?.trim() || "주소 정보 없음",
    lat,
    lng,
    distanceM: 0, // 조회 시점에 haversine으로 다시 계산해 채운다.
    totalSpots: item.prkFcltInfo.prkNocmprt || 0,
    availableSpots: realtime ? realtime.totRmndPrkNocmprt : null,
    congestion: realtime ? mapDaeguCongestionCode(realtime.prkCnfSttsCd) : "moderate",
    fee: mapDaeguFee(item.prkOperInfo),
    hours: mapDaeguHours(item.prkOperInfo),
    evSpots: countDaeguZones(item.prkZoneInfoList, "전기"),
    disabledSpots: countDaeguZones(item.prkZoneInfoList, "장애인"),
    realtimeSupported: Boolean(realtime),
    lastSyncedMinutesAgo: realtime ? 0 : null,
  };
}

async function fetchDaeguJson<T>(endpoint: string, key: string, label: string): Promise<T[]> {
  const res = await fetch(endpoint, {
    headers: {
      accept: "application/json;charset=UTF-8",
      Authentication: key,
    },
  });
  if (!res.ok) {
    throw new Error(`${label} API 요청 실패 (HTTP ${res.status})`);
  }
  const json = await res.json();
  if (json?.resultCode !== "200") {
    throw new Error(`${label} API 오류: ${json?.message ?? "알 수 없는 오류"}`);
  }
  console.log(`[대구시 API] ${label} 200 OK — ${json?.totCnt ?? json?.data?.length ?? 0}건 수신`);
  return json?.data ?? [];
}

async function loadDaeguCityParkingLots(): Promise<ParkingLot[]> {
  const infoEndpoint = process.env.DAEGU_PARKING_INFO_ENDPOINT || DEFAULT_DAEGU_INFO_ENDPOINT;
  const infoKey = process.env.DAEGU_PARKING_INFO_KEY;
  const congestionEndpoint = process.env.DAEGU_REALTIME_CONGESTION_ENDPOINT || DEFAULT_DAEGU_CONGESTION_ENDPOINT;
  const congestionKey = process.env.DAEGU_REALTIME_CONGESTION_KEY;
  if (!infoKey) throw new Error("DAEGU_PARKING_INFO_KEY가 설정되어 있지 않습니다.");
  if (!congestionKey) throw new Error("DAEGU_REALTIME_CONGESTION_KEY가 설정되어 있지 않습니다.");

  const [infoItems, congestionItems] = await Promise.all([
    fetchDaeguJson<DaeguPrkInfoItem>(infoEndpoint, infoKey, "주차장 기본정보"),
    fetchDaeguJson<DaeguRltmPrkInfoItem>(congestionEndpoint, congestionKey, "실시간 주차 혼잡도"),
  ]);

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
