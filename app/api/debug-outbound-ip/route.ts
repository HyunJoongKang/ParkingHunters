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

interface DaeguProbeResult {
  status: number | null;
  bodySnippet: string | null;
  error: string | null;
}

// 실제 대구시 API를 direct/proxied 경로로 호출해 지금 이 순간 어느 경로가 통과하는지
// 그대로 보여준다. 키 값 자체는 응답에 절대 포함하지 않는다(상태 코드/본문 일부만).
async function probeDaegu(
  endpoint: string | undefined,
  key: string | undefined,
  agent?: HttpsProxyAgent<string>
): Promise<DaeguProbeResult> {
  if (!endpoint || !key) {
    return { status: null, bodySnippet: null, error: "엔드포인트 또는 키 미설정" };
  }
  try {
    const res = await nodeFetch(endpoint, {
      headers: { accept: "application/json;charset=UTF-8", Authentication: key },
      agent,
    });
    const text = await res.text();
    return { status: res.status, bodySnippet: text.slice(0, 200), error: null };
  } catch (err) {
    return { status: null, bodySnippet: null, error: err instanceof Error ? err.message : "요청 실패" };
  }
}

export async function GET() {
  const result: {
    directIp?: string | null;
    proxiedIp?: string | null;
    proxyConfigured: boolean;
    error?: string;
    daegu?: {
      info: { direct: DaeguProbeResult; proxied: DaeguProbeResult | null };
      congestion: { direct: DaeguProbeResult; proxied: DaeguProbeResult | null };
    };
  } = {
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

  // 지금 이 순간 direct(현재 Cloudtype 컨테이너 IP)와 proxied(Fixie IP) 중 어느 경로로
  // 대구시 API를 실제로 호출했을 때 통과하는지 함께 확인한다 — "마지막 신청 IP 1개만
  // 남고 이전 등록은 덮어써지는 것 아니냐"는 가설을 검증하기 위해, 두 경로 모두의
  // 실제 HTTP 상태를 그대로 보여준다.
  const infoEndpoint = process.env.DAEGU_PARKING_INFO_ENDPOINT || "https://pis.daegu.go.kr/api/serviceApply/prkInfo";
  const congestionEndpoint =
    process.env.DAEGU_PARKING_CONGESTION_ENDPOINT || "https://pis.daegu.go.kr/api/serviceApply/rltmPrkInfo";

  result.daegu = {
    info: {
      direct: await probeDaegu(infoEndpoint, process.env.DAEGU_PARKING_INFO_KEY),
      proxied: daeguProxyAgent
        ? await probeDaegu(infoEndpoint, process.env.DAEGU_PARKING_INFO_KEY, daeguProxyAgent)
        : null,
    },
    congestion: {
      direct: await probeDaegu(congestionEndpoint, process.env.DAEGU_PARKING_CONGESTION_KEY),
      proxied: daeguProxyAgent
        ? await probeDaegu(congestionEndpoint, process.env.DAEGU_PARKING_CONGESTION_KEY, daeguProxyAgent)
        : null,
    },
  };

  return NextResponse.json(result, { status: result.error ? 502 : 200 });
}
