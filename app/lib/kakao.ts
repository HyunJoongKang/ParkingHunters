import type { LatLng, RegionLabel } from "./geo";

declare global {
  interface Window {
    kakao: any;
  }
}

export interface KakaoPlace {
  id: string;
  place_name: string;
  category_name: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string; // 경도(lng), 문자열로 내려옴
  y: string; // 위도(lat), 문자열로 내려옴
  distance: string; // location 기준 검색 시 미터 단위로 내려옴(문자열)
}

export interface PlaceSuggestion {
  id: string;
  /** 표시용 이름 — POI명 또는 도로명/지번 주소 자체 */
  name: string;
  address: string;
  category?: string;
  lat: number;
  lng: number;
  distanceM: number | null;
}

// Kakao Places 키워드 검색 결과를 Promise로 감싼다.
function keywordSearch(keyword: string, rect: string): Promise<KakaoPlace[]> {
  return new Promise((resolve) => {
    const places = new window.kakao.maps.services.Places();
    places.keywordSearch(
      keyword,
      (data: KakaoPlace[], status: string) => {
        resolve(status === window.kakao.maps.services.Status.OK ? data : []);
      },
      { rect, size: 15 }
    );
  });
}

// Kakao Geocoder 주소 검색 결과를 Promise로 감싼다. Places 키워드 검색은 상호명 등
// POI 위주라, "○○로 123" 같은 도로명 주소나 "○○읍/면/동" 같은 행정구역명을 그대로
// 입력하면 결과가 안 나오는 경우가 많다. 주소 자체를 파싱하는 이 API를 함께 써서
// 그런 입력도 좌표로 변환되게 한다.
function addressSearch(keyword: string, options?: { page?: number; size?: number }): Promise<any[]> {
  return new Promise((resolve) => {
    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.addressSearch(
      keyword,
      (data: any[], status: string) => {
        resolve(status === window.kakao.maps.services.Status.OK ? data : []);
      },
      options
    );
  });
}

// 대경권(대구광역시 + 경상북도) 주소인지 판별한다. 임당역처럼 이름이나 노선상
// 대구로 착각하기 쉽지만 실제 행정구역은 경산시(경북)인 장소도 서비스 대상에
// 포함하기 위해, 경북 데이터를 함께 서비스하기 시작한 백엔드 범위와 맞춘다.
export function isDaegyeongAddress(address: string): boolean {
  return (
    address.startsWith("대구") || address.startsWith("경북") || address.startsWith("경상북도")
  );
}

function isDaeguAddress(address: string): boolean {
  return address.startsWith("대구");
}

const ADDRESS_SEARCH_PAGE_SIZE = 30;
const ADDRESS_SEARCH_MAX_PAGES = 5; // "동성로"처럼 같은 도로명이 여러 시/군에 흔한 경우 대비

// "동성로"(대구·경주·영주·부산 등 여러 지역에 동명 도로가 있음)처럼 도로명 검색은
// 결과가 관련도와 무관하게(지역코드 순 등으로) 정렬돼, 대구 항목이 뒤 페이지에
// 묻히고 그보다 앞선 페이지의 경북 동명 도로(예: 경주 동성로)가 먼저 걸리는 경우가
// 있다. 그래서 도로명(ROAD) 결과는 첫 페이지만 보고 판단하지 않고, "대구" 항목을
// 찾을 때까지(또는 페이지가 끝날 때까지) 몇 페이지 더 확인한다 — 경북 매치만으로는
// 멈추지 않는다. "해운대"/"대구"처럼 행정구역(REGION) 결과는 전국에 유일하므로
// 그대로 신뢰한다.
async function addressSearchPreferringDaegyeong(keyword: string): Promise<any[]> {
  const first = await addressSearch(keyword, { size: ADDRESS_SEARCH_PAGE_SIZE, page: 1 });
  if (first.length === 0 || first[0]?.address_type !== "ROAD") {
    return first;
  }
  if (first.some((a) => isDaeguAddress(a.address_name))) {
    return first;
  }

  let all = first;
  for (let page = 2; page <= ADDRESS_SEARCH_MAX_PAGES; page++) {
    const next = await addressSearch(keyword, { size: ADDRESS_SEARCH_PAGE_SIZE, page });
    if (next.length === 0) break;
    all = [...all, ...next];
    if (next.some((a) => isDaeguAddress(a.address_name))) break;
    if (next.length < ADDRESS_SEARCH_PAGE_SIZE) break; // 마지막 페이지
  }
  return all;
}

function toPlaceFromKakaoPlace(p: KakaoPlace): PlaceSuggestion {
  return {
    id: `place-${p.id}`,
    name: p.place_name,
    address: p.road_address_name || p.address_name,
    category: p.category_name?.split(">").pop()?.trim(),
    lat: Number(p.y),
    lng: Number(p.x),
    distanceM: Number(p.distance) || null,
  };
}

function toPlaceFromAddress(a: any, index: number): PlaceSuggestion {
  const roadAddress = a.road_address?.address_name as string | undefined;
  return {
    id: `addr-${index}-${a.x}-${a.y}`,
    name: roadAddress || a.address_name,
    address: a.address_name,
    lat: Number(a.y),
    lng: Number(a.x),
    distanceM: null,
  };
}

// 대경권 안의 장소/주소만 남기고, Places(상호/장소명) + Geocoder(도로명/지번 주소) 검색
// 결과를 합쳐서 반환한다. 타이핑 중 보여주는 연관 검색어 드롭다운용 — 후보를
// 넓게 모아 보여주는 용도라 지명/상호 우선순위를 따지지 않는다.
export async function searchDaeguPlaces(keyword: string, rect: string): Promise<PlaceSuggestion[]> {
  const [places, addresses] = await Promise.all([
    keywordSearch(keyword, rect),
    addressSearch(keyword),
  ]);

  const combined = [
    ...places.map(toPlaceFromKakaoPlace),
    ...addresses.map(toPlaceFromAddress),
  ].filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

  const seenCoords = new Set<string>();
  return combined
    .filter((s) => isDaegyeongAddress(s.address))
    .filter((s) => {
      const key = `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;
      if (seenCoords.has(key)) return false;
      seenCoords.add(key);
      return true;
    })
    .slice(0, 15);
}

export type DaegyeongSearchOutcome =
  | { kind: "region"; place: PlaceSuggestion }
  | { kind: "outOfRegion" }
  | { kind: "places"; suggestions: PlaceSuggestion[] };

// 검색창에서 엔터(제출) 시 쓰는 판정 로직. "해운대"처럼 지명으로 해석 가능한
// 입력은 상호명 검색보다 지명/주소 해석을 우선한다 — Geocoder(addressSearch)는
// rect 제한이 없는 전국 단위 주소 검색이라, 결과가 있다면 그게 사용자가 실제로
// 가리키는 행정구역이다(예: "해운대" -> "부산 해운대구"). 그 지역이 대경권
// 밖이면 상호명 부분일치(예: "해운대물총칼국수")로 넘어가지 않고 즉시 종료한다.
// Geocoder에 결과가 없을 때만(예: "임당역"처럼 역/상호명) 상호명 검색으로 넘어간다.
export async function resolveDaegyeongSearch(
  keyword: string,
  rect: string
): Promise<DaegyeongSearchOutcome> {
  const addresses = await addressSearchPreferringDaegyeong(keyword);
  if (addresses.length > 0) {
    // 같은 도로명이 여러 지역에 있을 수 있으니(예: "동성로"), 첫 결과가 아니라
    // 대경권에 해당하는 항목을 찾아 우선 사용한다. 대구와 경북 동명 지명이 함께
    // 걸리면(예: 대구 동성로 vs 경주 동성로) 대구 쪽을 우선한다. 없으면 그때
    // 대경권 밖으로 판정한다.
    const daeguIndex = addresses.findIndex((a) => isDaeguAddress(a.address_name));
    const daegyeongIndex =
      daeguIndex !== -1 ? daeguIndex : addresses.findIndex((a) => isDaegyeongAddress(a.address_name));
    const chosen = daegyeongIndex === -1 ? addresses[0] : addresses[daegyeongIndex];
    const place = toPlaceFromAddress(chosen, Math.max(daegyeongIndex, 0));
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) {
      // 좌표를 못 얻으면 주소 해석 자체가 무의미하니 상호명 검색으로 넘어간다.
    } else if (daegyeongIndex === -1) {
      return { kind: "outOfRegion" };
    } else {
      return { kind: "region", place };
    }
  }

  const places = await keywordSearch(keyword, rect);
  const seenCoords = new Set<string>();
  const suggestions = places
    .map(toPlaceFromKakaoPlace)
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && isDaegyeongAddress(s.address))
    .filter((s) => {
      const key = `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;
      if (seenCoords.has(key)) return false;
      seenCoords.add(key);
      return true;
    })
    .slice(0, 15);

  return { kind: "places", suggestions };
}

// 좌표 → 행정구역 계층(예: 대구/수성구/고산1동)으로 역지오코딩한다. 검색창 아래
// "현재 위치" 칩에 쓰인다. 건물 주소 DB가 없는 좌표도 있어 coord2Address 대신 항상
// 행정/법정동 계층을 내려주는 coord2RegionCode를 쓴다.
// 한글/영문 화면 표기로 합치는 건 format.ts의 formatRegionLabel이 맡는다 — 계층별로
// 로마자 접미사 규칙이 달라(예: 대구는 접미사 없음, 수성구는 "-gu") 문자열로 미리
// 합쳐버리면 그 구분이 사라진다.
export function reverseGeocode(coords: LatLng): Promise<RegionLabel | null> {
  return new Promise((resolve) => {
    if (!window.kakao?.maps?.services?.Geocoder) {
      resolve(null);
      return;
    }
    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.coord2RegionCode(coords.lng, coords.lat, (data: any[], status: string) => {
      if (status !== window.kakao.maps.services.Status.OK || !data.length) {
        resolve(null);
        return;
      }
      const region = data.find((d) => d.region_type === "H") ?? data[0];
      const sido = region.region_1depth_name?.replace(
        /(특별자치시|특별자치도|광역시|특별시)$/,
        ""
      );
      if (!sido) {
        resolve(null);
        return;
      }
      resolve({
        sido,
        gu: region.region_2depth_name || null,
        dong: region.region_3depth_name || null,
      });
    });
  });
}

const KAKAO_SCRIPT_ID = "kakao-map-sdk";
const LOAD_CALLBACK_TIMEOUT_MS = 8000;

let kakaoLoadPromise: Promise<void> | null = null;

// Next.js <Script> 컴포넌트로 이 SDK를 불러오면 카카오가 내부적으로 document.write로
// 엔진 스크립트를 추가 주입하는 방식이라, 동적 삽입 스크립트의 기본값인 async=true
// 상태에서 브라우저가 그 document.write 호출을 조용히 무시해 window.kakao가 끝내
// 생기지 않는 문제가 있다(다른 프로젝트에서 직접 확인함). 그래서 <script>를 직접
// 만들어 async=false로 지정해 head에 appendChild하는 방식을 사용한다.
export function loadKakaoMapsSdk(appKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("브라우저 환경이 아닙니다."));
  }
  if (window.kakao?.maps?.load) {
    return Promise.resolve();
  }
  if (kakaoLoadPromise) {
    return kakaoLoadPromise;
  }

  kakaoLoadPromise = new Promise((resolve, reject) => {
    const src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      appKey
    )}&libraries=services&autoload=false`;

    const existing = document.getElementById(KAKAO_SCRIPT_ID);
    const script =
      existing instanceof HTMLScriptElement ? existing : document.createElement("script");
    script.id = KAKAO_SCRIPT_ID;
    script.src = src;
    script.async = false;

    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const settleResolve = () => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      resolve();
    };
    const settleReject = (err: Error) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      kakaoLoadPromise = null;
      reject(err);
    };

    script.onload = () => {
      if (!window.kakao?.maps?.load) {
        settleReject(new Error("Kakao SDK는 로드됐지만 window.kakao.maps.load를 찾을 수 없습니다."));
        return;
      }
      timeoutId = setTimeout(() => {
        settleReject(new Error("Kakao 지도 엔진 스크립트 로딩이 응답 없이 멈췄습니다."));
      }, LOAD_CALLBACK_TIMEOUT_MS);
      window.kakao.maps.load(() => settleResolve());
    };
    script.onerror = () => {
      settleReject(new Error("카카오 지도 SDK를 불러오지 못했습니다. 네트워크 상태를 확인해 주세요."));
    };

    if (!existing) {
      document.head.appendChild(script);
    }
  });

  return kakaoLoadPromise;
}
