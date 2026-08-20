/** @type {import('next').NextConfig} */

// 클라이언트에서 실제로 로드하는 외부 호스트만 허용한다(app/lib/kakao.ts의 dapi.kakao.com
// SDK, app/lib/navi.ts의 map.kakao.com 길찾기 링크). *.daumcdn.net / *.kakaocdn.net은
// 카카오맵 SDK가 내부적으로 불러오는 타일 이미지/리소스 도메인이다 — 정확한 서브도메인은
// 브라우저로 직접 확인해야 하므로, 알려진 카카오 인프라 도메인 계열로 허용해 뒀다.
// 지도가 깨지거나 콘솔에 CSP 위반이 찍히면 이 목록을 넓혀야 한다.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://dapi.kakao.com https://*.daumcdn.net https://*.kakaocdn.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.daumcdn.net https://*.kakaocdn.net https://*.kakao.com",
  "font-src 'self' data:",
  "connect-src 'self' https://dapi.kakao.com https://*.daumcdn.net https://*.kakaocdn.net",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
];

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Content-Security-Policy",
    value: CSP_DIRECTIVES.join("; "),
  },
];

const nextConfig = {
  // Cloudtype 등 컨테이너 배포 시 이미지 크기를 줄이고 `node server.js`만으로 구동할 수
  // 있도록 standalone 산출물을 생성한다(Dockerfile이 .next/standalone을 그대로 복사).
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
