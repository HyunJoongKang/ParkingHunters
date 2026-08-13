import type { Metadata } from "next";
import { Gowun_Dodum, Noto_Sans_KR } from "next/font/google";
import KakaoMapsLoader from "./components/KakaoMapsLoader";
import "./globals.css";

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
    <html lang="ko" suppressHydrationWarning>
      <body className={`${display.variable} ${body.variable}`}>
        <KakaoMapsLoader />
        {children}
      </body>
    </html>
  );
}
