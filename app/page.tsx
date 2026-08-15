"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import MapLegend from "./components/MapLegend";
import ParkingCard from "./components/ParkingCard";
import ParkingDetailSheet from "./components/ParkingDetailSheet";
import SettingsModal from "./components/SettingsModal";
import type { LatLng } from "./lib/geo";
import {
  loadKakaoMapsSdk,
  resolveDaegyeongSearch,
  reverseGeocode,
  searchDaeguPlaces,
  type PlaceSuggestion,
} from "./lib/kakao";
import type { Dictionary } from "./lib/i18n";
import { useFavorites } from "./lib/favorites";
import { useSettings } from "./lib/settings";
import type { ParkingLot } from "./lib/types";

// GeolocationPositionError 코드(1=권한 거부, 2=위치 확인 불가, 3=타임아웃)를 현재
// 언어에 맞는 안내 문구로 바꾼다.
function geoErrorMessage(code: number, t: Dictionary): string {
  switch (code) {
    case 1:
      return t.geoDenied;
    case 2:
      return t.geoUnavailable;
    case 3:
      return t.geoTimeout;
    default:
      return t.geoUnknown;
  }
}

// 서비스 지역이 대경권(대구 + 경상북도)이므로 그 바깥의 동명 결과(예: 부산 동성로)가
// 섞여 나오지 않게 한다. 다만 대구시청 기준 반경(예: 20km)으로 자르면 군위군·
// 달성군 외곽처럼 시청에서 멀리 떨어진 지역(시청에서 40km 이상)이 아예 검색되지
// 않는 문제가 있었다. 그래서 위치를 좁히는 용도로는 대경권 전역을 넉넉히 감싸는
// 사각 영역(rect)만 쓰고, 실제 "대경권 안인지"는 주소 문자열이 "대구" 또는
// "경북"/"경상북도"로 시작하는지로 판단한다(app/lib/kakao.ts의 isDaegyeongAddress).
const DAEGU_CENTER = { lat: 35.8714, lng: 128.6014 };
// 좌하단(lng,lat), 우상단(lng,lat) — 남쪽 가창면부터 북쪽 군위군, 서쪽 달성군
// 외곽부터 동쪽 팔공산 자락까지 여유 있게 포함한다.
const DAEGU_SEARCH_RECT = "128.25,35.60,128.85,36.35";
const NEAREST_COUNT = 5; // 앱 진입 즉시 보여줄 카드 수(4~5곳 권장 범위)

// 입력값과 이름이 정확히 같은 결과만 "그 장소"로 확정한다. "해운대"처럼 부분
// 일치("해운대물총칼국수" 등)만 있는 경우는 관련도가 아무리 높아도 자동으로
// 이동하지 않는다 — 사용자가 목록에서 직접 고른 곳만 선택되어야 한다.
function findExactMatch(items: PlaceSuggestion[], keyword: string): PlaceSuggestion | undefined {
  return items.find((s) => s.name.trim() === keyword);
}

// 공공데이터 페이지 조회 도중 데이터가 밀리는 등의 이유로 같은 lot.id가 두 번 내려오는
// 경우가 있어, 화면에 반영하기 전에 한 번 걸러낸다.
function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export default function Home() {
  const { t, radiusM } = useSettings();
  const { isFavorite } = useFavorites();
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const suggestionSelectedRef = useRef(false);

  const [kakaoReady, setKakaoReady] = useState(false);
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
  const [myLocationLabel, setMyLocationLabel] = useState<string | null>(null);
  const [locationError, setLocationError] = useState("");
  const hasLoadedOnceRef = useRef(false);

  // 현재 카드 목록을 정렬하는 기준 좌표. 기본은 내 현재 위치, 목적지를 검색하면
  // 그 좌표로 바뀐다. searchLabel이 null이면 "현재 위치 기준"이라는 뜻이다.
  const [searchCoords, setSearchCoords] = useState<LatLng | null>(null);
  const [searchLabel, setSearchLabel] = useState<string | null>(null);
  const [nearestLots, setNearestLots] = useState<ParkingLot[]>([]);
  const [isLoadingLots, setIsLoadingLots] = useState(false);
  const [resultsError, setResultsError] = useState("");
  const requestIdRef = useRef(0);

  // 대경권(대구·경북) 밖 검색어를 알려주는 토스트. 목록/좌표는 그대로 두고 잠깐
  // 떴다 사라지는 안내만 보여준다.
  const [regionToast, setRegionToast] = useState<{ message: string; visible: boolean } | null>(null);
  const regionToastHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regionToastClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showRegionToast(message: string) {
    if (regionToastHideTimerRef.current) clearTimeout(regionToastHideTimerRef.current);
    if (regionToastClearTimerRef.current) clearTimeout(regionToastClearTimerRef.current);
    setRegionToast({ message, visible: true });
    regionToastHideTimerRef.current = setTimeout(() => {
      setRegionToast((prev) => (prev ? { ...prev, visible: false } : prev));
      regionToastClearTimerRef.current = setTimeout(() => setRegionToast(null), 250);
    }, 2500);
  }

  useEffect(() => {
    return () => {
      if (regionToastHideTimerRef.current) clearTimeout(regionToastHideTimerRef.current);
      if (regionToastClearTimerRef.current) clearTimeout(regionToastClearTimerRef.current);
    };
  }, []);

  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selectedLot = nearestLots.find((l) => l.id === selectedLotId) ?? null;
  const displayedLots = showFavoritesOnly ? nearestLots.filter((lot) => isFavorite(lot.id)) : nearestLots;

  // 대경권 공영주차장 전체(공공데이터포털) 중 기준 좌표에서 가장 가까운 곳들을 서버 API로 조회한다.
  async function loadNearestLots(coords: LatLng | null) {
    hasLoadedOnceRef.current = true;
    const requestId = ++requestIdRef.current;
    setIsLoadingLots(true);
    setResultsError("");
    try {
      const params = new URLSearchParams({ limit: String(NEAREST_COUNT), radius: String(radiusM) });
      if (coords) {
        params.set("lat", String(coords.lat));
        params.set("lng", String(coords.lng));
      }
      const res = await fetch(`/api/parking-lots?${params.toString()}`);
      const data = await res.json();
      if (requestIdRef.current !== requestId) return; // 이후 요청이 이미 새로 시작됐으면 무시
      if (!res.ok) throw new Error(data?.error ?? t.resultsLoadFailed);
      setNearestLots(dedupeById(data.lots ?? []));
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setResultsError(err instanceof Error ? err.message : t.resultsLoadFailed);
    } finally {
      if (requestIdRef.current === requestId) setIsLoadingLots(false);
    }
  }

  function requestCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setLocationError(t.geoUnsupported);
      return;
    }
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setMyLocation(coords);
        setMyLocationLabel(null);
        setSearchLabel(null);
        setSearchCoords(coords);
        loadNearestLots(coords);
      },
      (err) => {
        setLocationError(geoErrorMessage(err.code, t));
        // 이번이 첫 시도였다면(=아직 아무 기준 좌표도 없었다면) 대구 중심 기준으로라도 바로 보여준다.
        if (!hasLoadedOnceRef.current) {
          setSearchCoords(DAEGU_CENTER);
          loadNearestLots(DAEGU_CENTER);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function resetToCurrentLocation() {
    setQuery("");
    setSearchLabel(null);
    if (myLocation) {
      setSearchCoords(myLocation);
      loadNearestLots(myLocation);
    } else {
      requestCurrentLocation();
    }
  }

  // 앱 진입 즉시 현재 위치를 요청해 근처 주차장을 바로 보여준다.
  useEffect(() => {
    requestCurrentLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 설정에서 검색 반경을 바꾸면, 지금 보고 있는 기준 좌표로 즉시 다시 불러온다.
  // 최초 마운트 시(아직 기준 좌표가 없을 때)는 건너뛴다 — 위 effect가 이미 처리한다.
  const radiusInitializedRef = useRef(false);
  useEffect(() => {
    if (!radiusInitializedRef.current) {
      radiusInitializedRef.current = true;
      return;
    }
    if (searchCoords) loadNearestLots(searchCoords);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusM]);

  // 검색 자동완성 + 역지오코딩(현재 위치 칩)에 쓸 Kakao Maps SDK를 미리 로드해 둔다.
  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!appKey) return;
    let cancelled = false;
    loadKakaoMapsSdk(appKey)
      .then(() => {
        if (!cancelled) setKakaoReady(true);
      })
      .catch((err) => console.warn("[Kakao SDK] 로드 실패:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  // 좌표 → "대구 중구 동성로" 같은 짧은 지역명으로 역지오코딩해 위치 칩에 표시한다.
  useEffect(() => {
    if (!kakaoReady || !myLocation) return;
    let cancelled = false;
    reverseGeocode(myLocation).then((label) => {
      if (!cancelled) setMyLocationLabel(label ?? t.locationLabelUnresolved);
    });
    return () => {
      cancelled = true;
    };
  }, [kakaoReady, myLocation]);

  // 검색창에 타이핑할 때마다 Kakao Places(상호/장소명) + Geocoder(도로명/지번 주소)
  // 검색을 함께 돌려 연관 검색어를 갱신한다. Places 키워드 검색만 쓰면 "○○로 123",
  // "논공읍"처럼 순수 주소/행정구역명은 결과가 안 잡히는 경우가 많아 Geocoder를 더했다.
  useEffect(() => {
    const keyword = query.trim();
    if (suggestionSelectedRef.current) {
      // 방금 목록에서 선택해 query를 채운 경우엔 다시 검색하지 않는다.
      suggestionSelectedRef.current = false;
      return;
    }
    if (!keyword) {
      setSuggestions([]);
      return;
    }
    if (!window.kakao?.maps?.services?.Places) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchDaeguPlaces(keyword, DAEGU_SEARCH_RECT)
        .then((result) => {
          if (!cancelled) setSuggestions(result);
        })
        .catch((err) => {
          console.warn("[KakaoSearch] 검색 실패:", err);
          if (!cancelled) setSuggestions([]);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  function selectPlace(place: PlaceSuggestion) {
    suggestionSelectedRef.current = true;
    setQuery(place.name);
    setSuggestions([]);
    setSuggestionsOpen(false);
    const coords = { lat: place.lat, lng: place.lng };
    setSearchLabel(place.name);
    setSearchCoords(coords);
    loadNearestLots(coords);
  }

  async function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const keyword = query.trim();
    if (!keyword) return;

    // 지명/주소 해석(Geocoder)을 상호명 검색보다 우선한다 — "해운대"는 상호명
    // 부분일치("해운대물총칼국수")가 아니라 "부산 해운대구"라는 실제 행정구역으로
    // 먼저 판정되어야 한다. 그 지명이 대경권 밖이면 상호명 검색으로 넘어가지 않고
    // 바로 안내하고 끝낸다. resolveDaegyeongSearch가 이 우선순위를 처리한다.
    setIsLoadingLots(true);
    try {
      const outcome = await resolveDaegyeongSearch(keyword, DAEGU_SEARCH_RECT);

      if (outcome.kind === "outOfRegion") {
        showRegionToast(t.searchOutOfRegion(keyword));
        return;
      }

      if (outcome.kind === "region") {
        setSuggestions([]);
        setSuggestionsOpen(false);
        setSearchLabel(outcome.place.name);
        setSearchCoords({ lat: outcome.place.lat, lng: outcome.place.lng });
        await loadNearestLots({ lat: outcome.place.lat, lng: outcome.place.lng });
        return;
      }

      // outcome.kind === "places": 지명으로 해석되지 않아(예: "임당역") 상호명
      // 검색으로 넘어온 경우. 정확히 일치하는 이름이 있을 때만 바로 이동하고,
      // 부분일치뿐이면 목록만 보여주고 사용자가 직접 고르게 한다.
      const exact = findExactMatch(outcome.suggestions, keyword);
      if (exact) {
        setSuggestions([]);
        setSuggestionsOpen(false);
        setSearchLabel(exact.name);
        setSearchCoords({ lat: exact.lat, lng: exact.lng });
        await loadNearestLots({ lat: exact.lat, lng: exact.lng });
      } else if (outcome.suggestions.length > 0) {
        setSuggestions(outcome.suggestions);
        setSuggestionsOpen(true);
      } else {
        setResultsError(t.searchNotFound(keyword));
        setSearchLabel(keyword);
        setSearchCoords(DAEGU_CENTER);
        await loadNearestLots(DAEGU_CENTER);
      }
    } finally {
      setIsLoadingLots(false);
    }
  }

  function openDetail(id: string) {
    setSelectedLotId(id);
    setDetailOpen(true);
  }

  function closeDetail() {
    setDetailOpen(false);
  }

  const locationChipText = locationError
    ? t.locationRetryHint(locationError)
    : !myLocation
      ? t.locationChecking
      : t.locationLabel(myLocationLabel ?? t.locationResolvingLabel);

  return (
    <main style={styles.shell}>
      <div style={styles.appFrame}>
        <header style={styles.appBar}>
          <span style={styles.brandMark}>P</span>
          <div style={styles.appBarTitle} translate="no" className="notranslate">
            {searchLabel ? t.nearbyTitle(searchLabel) : t.appTitle}
          </div>
          <button
            type="button"
            style={styles.settingsButton}
            onClick={() => setSettingsOpen(true)}
            aria-label={t.settingsAria}
          >
            ⚙️
          </button>
        </header>

        <section style={styles.screenBody}>
          <div style={styles.searchWrap}>
            <form style={styles.searchBar} onSubmit={handleSearchSubmit}>
              <span style={styles.searchIcon} aria-hidden>
                🔍
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSuggestionsOpen(true)}
                onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
                placeholder={t.searchPlaceholder}
                style={styles.searchInput}
                autoComplete="off"
              />
            </form>

            {suggestionsOpen && suggestions.length > 0 && (
              <ul style={styles.suggestionList}>
                {suggestions.map((place) => {
                  const distanceM = place.distanceM;
                  return (
                    <li key={place.id}>
                      <button
                        type="button"
                        style={styles.suggestionItem}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectPlace(place)}
                      >
                        <div style={styles.suggestionTopRow} translate="no" className="notranslate">
                          <span style={styles.suggestionName}>{place.name}</span>
                          {distanceM != null && distanceM > 0 && (
                            <span style={styles.suggestionDistance}>
                              {distanceM < 1000 ? `${distanceM}m` : `${(distanceM / 1000).toFixed(1)}km`}
                            </span>
                          )}
                        </div>
                        <span style={styles.suggestionAddress} translate="no" className="notranslate">
                          {place.address}
                        </span>
                        {place.category && (
                          <span style={styles.suggestionCategory} translate="no" className="notranslate">
                            {place.category}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div style={styles.chipRow}>
            <button
              type="button"
              style={styles.locationChip}
              onClick={requestCurrentLocation}
              translate="no"
              className="notranslate"
            >
              📍 {locationChipText}
            </button>
            <button
              type="button"
              style={{
                ...styles.favoritesOnlyChip,
                ...(showFavoritesOnly ? styles.favoritesOnlyChipActive : null),
              }}
              onClick={() => setShowFavoritesOnly((prev) => !prev)}
              aria-pressed={showFavoritesOnly}
            >
              {showFavoritesOnly ? "❤️" : "🤍"} {t.favoritesOnlyLabel}
            </button>
          </div>

          {searchLabel && (
            <div style={styles.contextRow}>
              <span style={styles.contextLabel} translate="no" className="notranslate">
                {t.nearbyContext(searchLabel)}
              </span>
              <button type="button" style={styles.contextReset} onClick={resetToCurrentLocation}>
                {t.resetToCurrentLocation}
              </button>
            </div>
          )}

          <MapLegend />

          {resultsError && <p style={styles.resultsErrorText}>{resultsError}</p>}

          <div style={styles.list}>
            {displayedLots.map((lot, index) => (
              <ParkingCard key={`${lot.id}-${index}`} lot={lot} onSelect={openDetail} />
            ))}
            {!isLoadingLots && displayedLots.length === 0 && !resultsError && (
              <p style={styles.emptyText}>
                {showFavoritesOnly ? t.favoritesEmptyText : t.emptyResults}
              </p>
            )}
          </div>
        </section>

        {isLoadingLots && (
          <div style={styles.loadingWrap}>
            <div style={styles.loadingCard}>
              <span style={styles.spinner} />
              <span>{t.loadingResults}</span>
            </div>
          </div>
        )}

        {regionToast && (
          <div style={styles.regionToastWrap}>
            <div
              style={{
                ...styles.regionToastCard,
                opacity: regionToast.visible ? 1 : 0,
                transform: regionToast.visible ? "translateY(0)" : "translateY(-6px)",
              }}
            >
              {regionToast.message}
            </div>
          </div>
        )}
      </div>

      <ParkingDetailSheet lot={selectedLot} open={detailOpen} onClose={closeDetail} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    padding: "0",
  },
  appFrame: {
    position: "relative",
    width: "100%",
    maxWidth: 460,
    minHeight: "100vh",
    background: "var(--surface)",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 0 40px rgba(12, 26, 23, 0.06)",
  },
  appBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 18px",
    borderBottom: "1px solid var(--border-soft)",
    position: "sticky",
    top: 0,
    background: "var(--surface)",
    zIndex: 5,
  },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 9,
    background: "var(--accent)",
    color: "#fff",
    fontFamily: "var(--font-display)",
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  appBarTitle: {
    fontSize: 15.5,
    fontWeight: 700,
    color: "var(--text)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  settingsButton: {
    width: 30,
    height: 30,
    flexShrink: 0,
    border: "none",
    background: "transparent",
    fontSize: 17,
    lineHeight: 1,
    color: "var(--text-dim)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  screenBody: {
    flex: 1,
    padding: "14px 18px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  searchWrap: {
    position: "relative",
  },
  searchBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    padding: "13px 16px",
  },
  suggestionList: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    right: 0,
    zIndex: 8,
    margin: 0,
    padding: 6,
    listStyle: "none",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    boxShadow: "0 12px 28px rgba(12, 26, 23, 0.14)",
    maxHeight: 280,
    overflowY: "auto",
  },
  suggestionItem: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    width: "100%",
    textAlign: "left",
    padding: "9px 10px",
    border: "none",
    background: "transparent",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  suggestionTopRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  suggestionName: {
    fontSize: 13.5,
    fontWeight: 700,
    color: "var(--text)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  suggestionDistance: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--accent-strong)",
    flexShrink: 0,
  },
  suggestionAddress: {
    fontSize: 11.5,
    color: "var(--text-faint)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  suggestionCategory: {
    fontSize: 10.5,
    color: "var(--text-faint)",
    background: "var(--surface-alt)",
    borderRadius: 999,
    padding: "1px 7px",
    alignSelf: "flex-start",
    marginTop: 2,
  },
  searchIcon: {
    fontSize: 15,
    opacity: 0.7,
  },
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 14.5,
    color: "var(--text)",
  },
  chipRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  locationChip: {
    alignSelf: "flex-start",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 12px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--surface-alt)",
    color: "var(--text-dim)",
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
  },
  favoritesOnlyChip: {
    alignSelf: "flex-start",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 12px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--surface-alt)",
    color: "var(--text-dim)",
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
  },
  favoritesOnlyChipActive: {
    border: "1px solid var(--accent-line)",
    background: "var(--accent-soft)",
    color: "var(--accent-strong)",
  },
  contextRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: -2,
  },
  contextLabel: {
    fontSize: 12.5,
    color: "var(--text-dim)",
    fontWeight: 600,
  },
  contextReset: {
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid var(--accent-line)",
    background: "var(--accent-soft)",
    color: "var(--accent-strong)",
    fontWeight: 700,
    fontSize: 11.5,
    cursor: "pointer",
    flexShrink: 0,
  },
  resultsErrorText: {
    margin: 0,
    fontSize: 12.5,
    color: "var(--danger)",
    fontWeight: 600,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 2,
  },
  emptyText: {
    margin: "8px 0",
    fontSize: 13,
    color: "var(--text-faint)",
    textAlign: "center",
  },
  loadingWrap: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    zIndex: 15,
  },
  loadingCard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "var(--surface)",
    borderRadius: 999,
    padding: "12px 20px",
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-dim)",
    boxShadow: "0 12px 28px rgba(12, 26, 23, 0.18)",
  },
  regionToastWrap: {
    position: "fixed",
    top: "18%",
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none",
    zIndex: 20,
  },
  regionToastCard: {
    maxWidth: 320,
    margin: "0 20px",
    padding: "13px 18px",
    borderRadius: 14,
    background: "var(--danger-soft)",
    border: "1px solid var(--danger)",
    color: "var(--danger)",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "center",
    boxShadow: "0 12px 28px rgba(12, 26, 23, 0.18)",
    transition: "opacity 0.25s ease, transform 0.25s ease",
  },
  spinner: {
    width: 14,
    height: 14,
    borderRadius: "50%",
    border: "2px solid var(--border)",
    borderTopColor: "var(--accent)",
    animation: "spin 0.7s linear infinite",
  },
};
