import type { LatLng } from "./geo";

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
function addressSearch(keyword: string): Promise<any[]> {
  return new Promise((resolve) => {
    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.addressSearch(keyword, (data: any[], status: string) => {
      resolve(status === window.kakao.maps.services.Status.OK ? data : []);
    });
  });
}

// 대구 안의 장소/주소만 남기고, Places(상호/장소명) + Geocoder(도로명/지번 주소) 검색
// 결과를 합쳐서 반환한다.
export async function searchDaeguPlaces(
  keyword: string,
  rect: string
): Promise<PlaceSuggestion[]> {
  const [places, addresses] = await Promise.all([
    keywordSearch(keyword, rect),
    addressSearch(keyword),
  ]);

  const fromPlaces: PlaceSuggestion[] = places.map((p) => ({
    id: `place-${p.id}`,
    name: p.place_name,
    address: p.road_address_name || p.address_name,
    category: p.category_name?.split(">").pop()?.trim(),
    lat: Number(p.y),
    lng: Number(p.x),
    distanceM: Number(p.distance) || null,
  }));

  const fromAddresses: PlaceSuggestion[] = addresses.map((a, i) => {
    const roadAddress = a.road_address?.address_name as string | undefined;
    return {
      id: `addr-${i}-${a.x}-${a.y}`,
      name: roadAddress || a.address_name,
      address: a.address_name,
      lat: Number(a.y),
      lng: Number(a.x),
      distanceM: null,
    };
  });

  const seenCoords = new Set<string>();
  return [...fromPlaces, ...fromAddresses]
    .filter((s) => s.address.startsWith("대구") && Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .filter((s) => {
      const key = `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;
      if (seenCoords.has(key)) return false;
      seenCoords.add(key);
      return true;
    })
    .slice(0, 15);
}

// 좌표 → 대략적인 지역명(예: "대구 중구 동성로2가")으로 역지오코딩한다. 검색창 아래
// "현재 위치" 칩에 쓰인다. 건물 주소 DB가 없는 좌표도 있어 coord2Address 대신 항상
// 행정/법정동 계층을 내려주는 coord2RegionCode를 쓴다.
export function reverseGeocode(coords: LatLng): Promise<string | null> {
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
      const label = [sido, region.region_2depth_name, region.region_3depth_name]
        .filter(Boolean)
        .join(" ");
      resolve(label || null);
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
