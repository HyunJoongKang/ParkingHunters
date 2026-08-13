export interface LatLng {
  lat: number;
  lng: number;
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

export const GEOLOCATION_ERROR_MESSAGES: Record<number, string> = {
  1: "위치 정보 접근 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해 주세요.",
  2: "현재 위치를 확인할 수 없습니다.",
  3: "위치 확인 시간이 초과되었습니다. 다시 시도해 주세요.",
};
