export interface LatLng {
  lat: number;
  lng: number;
}

// kakao.ts의 reverseGeocode가 돌려주는 행정구역 계층(시/도, 시/군/구, 읍/면/동).
// 영문 표기는 계층별로 로마자 접미사 규칙이 달라(format.ts의 formatRegionLabel),
// 미리 합친 문자열이 아니라 이 구조 그대로 넘겨받아야 한다.
export interface RegionLabel {
  sido: string;
  gu: string | null;
  dong: string | null;
}

// 두 좌표 사이의 실제 거리를 하버사인 공식으로 계산한다(단위: m).
export function haversineDistanceM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Math.round(R * c);
}

