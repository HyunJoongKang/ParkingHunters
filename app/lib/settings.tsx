"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DICTIONARIES, type Dictionary, type Locale } from "./i18n";

export type ThemeMode = "light" | "dark";
export type RadiusM = 500 | 1000;

export const LOCALE_STORAGE_KEY = "daegu-parking:locale";
export const THEME_STORAGE_KEY = "daegu-parking:theme";
export const RADIUS_STORAGE_KEY = "daegu-parking:radius";

interface SettingsContextValue {
  locale: Locale;
  theme: ThemeMode;
  radiusM: RadiusM;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: ThemeMode) => void;
  setRadiusM: (radius: RadiusM) => void;
  t: Dictionary;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  // 서버 렌더링/최초 하이드레이션 시점엔 항상 기본값으로 시작해 마크업이 서버와
  // 정확히 일치하게 하고, localStorage에 저장된 값은 마운트 후 useEffect에서
  // 반영한다. (테마는 layout.tsx의 인라인 스크립트가 <html>에 먼저 적용해 두어
  // 배경색 깜빡임은 없고, 언어는 텍스트라 전환 시 잠깐 바뀌는 건 자연스럽게 둔다.)
  const [locale, setLocaleState] = useState<Locale>("ko");
  const [theme, setThemeState] = useState<ThemeMode>("light");
  const [radiusM, setRadiusMState] = useState<RadiusM>(1000);

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (storedLocale === "en" || storedLocale === "ko") setLocaleState(storedLocale);

    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "dark" || storedTheme === "light") setThemeState(storedTheme);

    const storedRadius = window.localStorage.getItem(RADIUS_STORAGE_KEY);
    if (storedRadius === "500" || storedRadius === "1000") setRadiusMState(Number(storedRadius) as RadiusM);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", locale);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    window.localStorage.setItem(RADIUS_STORAGE_KEY, String(radiusM));
  }, [radiusM]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      locale,
      theme,
      radiusM,
      setLocale: setLocaleState,
      setTheme: setThemeState,
      setRadiusM: setRadiusMState,
      t: DICTIONARIES[locale],
    }),
    [locale, theme, radiusM]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
