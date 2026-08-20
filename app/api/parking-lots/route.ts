import { NextRequest, NextResponse } from "next/server";
import { getNearestParkingLots } from "@/app/lib/parkingApi";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 6;
  const radiusParam = Number(searchParams.get("radius"));
  const radiusM = Number.isFinite(radiusParam) && radiusParam > 0 ? radiusParam : undefined;

  const origin = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

  try {
    const lots = await getNearestParkingLots(origin, limit, radiusM);
    return NextResponse.json({ lots });
  } catch (err) {
    // getNearestParkingLots(→getCachedLots)가 내부적으로 이미 실패를 더미 목록으로
    // 흡수하므로 이 catch는 사실상 예기치 못한 버그에 대한 마지막 안전망이다. 그런
    // 경우에도 502 등 에러 상태로 응답하지 않는다 — 배포 플랫폼에 따라 비정상 상태
    // 코드 응답이 자체 HTML 에러 페이지로 치환될 수 있어, 클라이언트의 JSON 파싱이
    // 깨지는 것보다 빈 목록으로 조용히 내려주는 쪽이 안전하다.
    console.error(
      "[parking-lots] 예기치 못한 오류 — 빈 목록으로 응답합니다:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ lots: [], error: err instanceof Error ? err.message : "주차장 정보를 불러오지 못했습니다." });
  }
}
