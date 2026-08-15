import type { Metadata } from "next";
import { Gowun_Dodum, Noto_Sans_KR } from "next/font/google";
import KakaoMapsLoader from "./components/KakaoMapsLoader";
import { FavoritesProvider } from "./lib/favorites";
import { SettingsProvider } from "./lib/settings";
import "./globals.css";

// 새로고침 시 라이트 테마로 잠깐 번쩍였다가 다크로 바뀌는 걸 막기 위해, React가
// 하이드레이션되기 전에 저장된 테마를 <html>에 바로 적용한다. SettingsProvider는
// 항상 기본값(light)으로 시작해 서버 마크업과 일치시키므로, 실제 색상은 이 스크립트가
// 먼저 결정하고 이후 React 상태가 조용히 따라붙는다.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('daegu-parking:theme');
    if (stored === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {}
})();
`;

const display = Gowun_Dodum({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Noto_Sans_KR({
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "대구 주차 — 목적지 주변 주차공간 찾기",
  description: "목적지 근처 실시간 주차 여유 공간을 한눈에 확인하는 대구 지역 주차 정보 앱",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // 크롬 등 브라우저의 자동 번역 확장은 React가 관리하는 DOM 노드를 직접
    // 바꿔치기해서 "Failed to execute 'removeChild' on 'Node'" 같은 충돌과
    // 텍스트 깨짐을 일으킨다. translate="no" + notranslate 클래스 + 구글
    // 전용 메타 태그로 페이지 전체에 번역 시도 자체를 막는다.
    <html lang="ko" translate="no" className="notranslate" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${display.variable} ${body.variable}`}>
        <SettingsProvider>
          <FavoritesProvider>
            <KakaoMapsLoader />
            {children}
          </FavoritesProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
