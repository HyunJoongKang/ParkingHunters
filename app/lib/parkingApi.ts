import { haversineDistanceM, type LatLng } from "./geo";
import type { ParkingLot } from "./types";

// 공공데이터포털 "전국주차장정보표준데이터" (국토교통부).
// 서버에서만 사용하는 모듈 — 서비스키가 노출되지 않도록 클라이언트 컴포넌트에서 직접 import하지 않는다.
const API_BASE = "https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api";
const PAGE_SIZE = 1000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간 — 정적 표준데이터라 자주 바뀌지 않는다.

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
  if (!raw) return "이름 미상 공영주차장";
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

async function fetchPage(serviceKey: string, pageNo: number): Promise<RawPage> {
  const url = `${API_BASE}?serviceKey=${serviceKey}&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&type=json`;
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

async function loadDaeguGyeongbukPublicParkingLots(): Promise<ParkingLot[]> {
  const serviceKey = process.env.DATA_GO_KR_PARKING_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error("DATA_GO_KR_PARKING_SERVICE_KEY가 설정되어 있지 않습니다.");
  }

  const first = await fetchPage(serviceKey, 1);
  const totalPages = Math.max(1, Math.ceil(first.totalCount / PAGE_SIZE));
  const restPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => fetchPage(serviceKey, i + 2))
  );

  const lots: ParkingLot[] = [];
  for (const page of [first, ...restPages]) {
    for (const item of page.items) {
      const isDaeguGyeongbuk = item.insttNm?.includes("대구") || item.insttNm?.includes("경상북도");
      if (!isDaeguGyeongbuk || item.prkplceSe !== "공영") continue;
      const lot = mapItem(item);
      if (lot) lots.push(lot);
    }
  }
  return lots;
}

async function getCachedLots(): Promise<ParkingLot[]> {
  const now = Date.now();
  if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
    const lots = await loadDaeguGyeongbukPublicParkingLots();
    cache = { fetchedAt: now, lots };
  }
  return cache.lots;
}

export async function getNearestPublicParkingLots(
  origin: LatLng | null,
  limit: number
): Promise<ParkingLot[]> {
  const lots = await getCachedLots();

  if (!origin) {
    return lots.slice(0, limit);
  }

  return [...lots]
    .map((lot) => ({ ...lot, distanceM: haversineDistanceM(origin, { lat: lot.lat, lng: lot.lng }) }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}
