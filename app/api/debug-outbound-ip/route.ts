import { HttpsProxyAgent } from "https-proxy-agent";
import nodeFetch from "node-fetch";
import { NextResponse } from "next/server";

// 대구시 API처럼 IP 화이트리스트를 쓰는 외부 서비스에 등록할 아웃바운드 IP를 확인하기
// 위한 임시 진단용 라우트. 외부 IP echo 서비스에 서버가 직접 요청을 날려, 그 서비스가
// 본 발신 IP(=이 배포 환경의 실제 아웃바운드 IP)를 그대로 돌려준다. 확인이 끝나면
// 지워도 되는 일회성 도구다.
//
// direct(plain fetch)는 Cloudtype 컨테이너 자체의 IP만 보여줄 뿐, 실제 대구시 API
// 호출이 나가는 경로(parkingApi.ts의 daeguProxyAgent, FIXIE_URL 설정 시 Fixie 경유)와
// 다르다 — 그래서 이 라우트가 direct IP만 보여주면 Fixie 쪽 IP가 대구시에 제대로
// 등록됐는지 착각하기 쉽다(실제로 2026-08-22에 이 차이 때문에 헷갈린 적 있음). proxied는
// parkingApi.ts와 동일한 daeguProxyAgent를 통해 나가는 IP를 보여줘 실제 대구시 API가
// 보는 IP와 일치시킨다.
const daeguProxyAgent = process.env.FIXIE_URL ? new HttpsProxyAgent(process.env.FIXIE_URL) : undefined;

async function fetchOutboundIp(agent?: HttpsProxyAgent<string>): Promise<string | null> {
  const res = await nodeFetch("https://api.ipify.org?format=json", { agent });
  if (!res.ok) {
    throw new Error(`ipify 요청 실패 (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { ip?: string };
  return data.ip ?? null;
}

export async function GET() {
  const result: { directIp?: string | null; proxiedIp?: string | null; proxyConfigured: boolean; error?: string } = {
    proxyConfigured: Boolean(daeguProxyAgent),
  };

  try {
    result.directIp = await fetchOutboundIp();
  } catch (err) {
    result.error = `direct: ${err instanceof Error ? err.message : "확인 실패"}`;
  }

  if (daeguProxyAgent) {
    try {
      result.proxiedIp = await fetchOutboundIp(daeguProxyAgent);
    } catch (err) {
      const message = `proxied: ${err instanceof Error ? err.message : "확인 실패"}`;
      result.error = result.error ? `${result.error}; ${message}` : message;
    }
  }

  return NextResponse.json(result, { status: result.error ? 502 : 200 });
}
