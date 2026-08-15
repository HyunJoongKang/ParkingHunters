"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { loadKakaoMapsSdk } from "../lib/kakao";
import { useSettings } from "../lib/settings";
import type { LatLng } from "../lib/geo";

export interface KakaoMapMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;
  label?: string;
  /** 있으면 원형 핀 대신 이 텍스트를 담은 알약 배지로 그린다(예: "여유 46면", "1,000원"). */
  content?: string;
  selected?: boolean;
}

interface KakaoMapProps {
  center: LatLng;
  level?: number;
  height?: number;
  /** 지정하면 height를 무시하고 부모 요소 전체를 꽉 채운다(메인 화면의 지도 배경용). */
  fill?: boolean;
  markers?: KakaoMapMarker[];
  onMarkerClick?: (id: string) => void;
  currentLocation?: LatLng | null;
  destination?: LatLng | null;
}

type Status = "loading" | "ready" | "error";

export default function KakaoMap({
  center,
  level = 6,
  height = 220,
  fill = false,
  markers = [],
  onMarkerClick,
  currentLocation = null,
  destination = null,
}: KakaoMapProps) {
  const { t, theme } = useSettings();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  // 지도 인스턴스는 마운트 시 한 번만 생성한다.
  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!appKey) {
      setStatus("error");
      setErrorMessage(t.mapMissingKey);
      return;
    }

    let cancelled = false;
    loadKakaoMapsSdk(appKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const kakao = window.kakao;
        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(center.lat, center.lng),
          level,
        });
        mapRef.current = map;

        window.setTimeout(() => {
          if (cancelled) return;
          map.relayout();
          map.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
        }, 0);

        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : t.mapLoadFailed);
      });

    return () => {
      cancelled = true;
      overlaysRef.current.forEach((ov) => ov.setMap(null));
      overlaysRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fill 모드(메인 화면 전체 배경 지도)는 부모 컨테이너 크기가 뷰포트 회전/리사이즈에
  // 따라 바뀔 수 있어, 캔버스가 컨테이너 크기를 다시 인식하도록 relayout을 걸어준다.
  useEffect(() => {
    function handleResize() {
      mapRef.current?.relayout();
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // center가 바뀌면(목적지 재검색 등) 지도 중심을 이동한다.
  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    mapRef.current.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
  }, [status, center.lat, center.lng]);

  // 현재 위치 점 / 목적지 핀 / 주차장 마커를 다시 그린다.
  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    const kakao = window.kakao;
    const map = mapRef.current;

    overlaysRef.current.forEach((ov) => ov.setMap(null));
    overlaysRef.current = [];

    if (currentLocation) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:16px;height:16px;border-radius:50%;background:#2f7cf6;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35);";
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(currentLocation.lat, currentLocation.lng),
        content: el,
        yAnchor: 0.5,
        zIndex: 5,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    }

    if (destination) {
      const el = document.createElement("div");
      el.style.cssText = "font-size:26px;filter:drop-shadow(0 3px 3px rgba(0,0,0,0.35));";
      el.textContent = "🎯";
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(destination.lat, destination.lng),
        content: el,
        yAnchor: 0.5,
        zIndex: 4,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    }

    markers.forEach((m) => {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", m.label ?? m.id);
      const glow = m.selected
        ? `0 0 0 4px ${m.color}33, 0 6px 14px rgba(0,0,0,0.28)`
        : "0 3px 8px rgba(0,0,0,0.22)";
      if (m.content) {
        // 요금/잔여 면수를 담은 알약 배지 — 핀만 있는 지도보다 한눈에 정보가 들어온다.
        el.textContent = m.content;
        el.style.cssText = `padding:${m.selected ? "6px 11px" : "5px 9px"};border-radius:999px;border:2px solid #fff;background:${m.color};color:#fff;font-size:${m.selected ? 11.5 : 10.5}px;font-weight:800;white-space:nowrap;display:flex;align-items:center;justify-content:center;cursor:pointer;line-height:1;box-shadow:${glow};`;
      } else {
        const size = m.selected ? 30 : 26;
        el.textContent = "P";
        el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;border:2px solid #fff;background:${m.color};color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;line-height:1;box-shadow:${glow};`;
      }
      if (onMarkerClick) {
        el.addEventListener("click", () => onMarkerClick(m.id));
      }
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(m.lat, m.lng),
        content: el,
        yAnchor: 0.5,
        zIndex: m.selected ? 3 : 2,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    status,
    JSON.stringify(markers),
    currentLocation?.lat,
    currentLocation?.lng,
    destination?.lat,
    destination?.lng,
  ]);

  return (
    <div style={fill ? styles.wrapFill : { ...styles.wrap, height }}>
      <div
        ref={containerRef}
        style={{
          ...styles.canvas,
          // Kakao Maps JS SDK는 Google Maps 같은 공식 다크 타일 스타일(JSON 스킨)을
          // 제공하지 않아, 다크 모드에서는 타일 자체를 CSS 필터로 어둡게/대비를 높여
          // 눈부심을 줄이고 다크 테마와 자연스럽게 어울리도록 보정한다.
          filter: theme === "dark" ? "brightness(0.85) contrast(1.1)" : undefined,
        }}
      />
      {status === "loading" && <div style={styles.overlayMsg}>{t.mapLoading}</div>}
      {status === "error" && <div style={styles.overlayMsg}>⚠️ {errorMessage}</div>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    position: "relative",
    width: "100%",
    borderRadius: "var(--radius-md)",
    overflow: "hidden",
    border: "1px solid var(--border)",
    background: "var(--surface-alt)",
  },
  wrapFill: {
    position: "absolute",
    inset: 0,
    background: "var(--surface-alt)",
  },
  canvas: {
    width: "100%",
    height: "100%",
    transition: "filter 0.2s ease",
  },
  overlayMsg: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: 16,
    fontSize: 13,
    color: "var(--text-dim)",
    background: "var(--surface-alt)",
    pointerEvents: "none",
  },
};
