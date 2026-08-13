import { NextRequest, NextResponse } from "next/server";
import { getNearestPublicParkingLots } from "@/app/lib/parkingApi";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 6;

  const origin = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

  try {
    const lots = await getNearestPublicParkingLots(origin, limit);
    return NextResponse.json({ lots });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "주차장 정보를 불러오지 못했습니다." },
      { status: 502 }
    );
  }
}
