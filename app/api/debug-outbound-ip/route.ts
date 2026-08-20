import { NextResponse } from "next/server";

// 대구시 API처럼 IP 화이트리스트를 쓰는 외부 서비스에 등록할 아웃바운드 IP를 확인하기
// 위한 임시 진단용 라우트. 외부 IP echo 서비스에 서버가 직접 요청을 날려, 그 서비스가
// 본 발신 IP(=이 배포 환경의 실제 아웃바운드 IP)를 그대로 돌려준다. 확인이 끝나면
// 지워도 되는 일회성 도구다.
export async function GET() {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    if (!res.ok) {
      return NextResponse.json({ error: `ipify 요청 실패 (HTTP ${res.status})` }, { status: 502 });
    }
    const data = (await res.json()) as { ip?: string };
    return NextResponse.json({ outboundIp: data.ip ?? null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "아웃바운드 IP 확인 실패" },
      { status: 502 }
    );
  }
}
