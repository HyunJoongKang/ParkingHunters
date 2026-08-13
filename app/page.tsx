"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import MapLegend from "./components/MapLegend";
import ParkingCard from "./components/ParkingCard";
import ParkingDetailSheet from "./components/ParkingDetailSheet";
import SettingsModal from "./components/SettingsModal";
import type { LatLng } from "./lib/geo";
import { loadKakaoMapsSdk, reverseGeocode, searchDaeguPlaces, type PlaceSuggestion } from "./lib/kakao";
import type { Dictionary } from "./lib/i18n";
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

// PRD상 1차 서비스 지역이 대구이므로 대구 바깥의 동명 결과(예: 부산 동성로)가
// 섞여 나오지 않게 한다. 다만 대구시청 기준 반경(예: 20km)으로 자르면 군위군·
// 달성군 외곽처럼 시청에서 멀리 떨어진 대구 내 지역(시청에서 40km 이상)이 아예
// 검색되지 않는 문제가 있었다. 그래서 위치를 좁히는 용도로는 대구 전역(군위군
// 포함)을 넉넉히 감싸는 사각 영역(rect)만 쓰고, 실제 "대구 안인지"는 주소 문자열이
// "대구"로 시작하는지로 판단한다(app/lib/kakao.ts의 searchDaeguPlaces).
const DAEGU_CENTER = { lat: 35.8714, lng: 128.6014 };
// 좌하단(lng,lat), 우상단(lng,lat) — 남쪽 가창면부터 북쪽 군위군, 서쪽 달성군
// 외곽부터 동쪽 팔공산 자락까지 여유 있게 포함한다.
const DAEGU_SEARCH_RECT = "128.25,35.60,128.85,36.35";
const NEAREST_COUNT = 5; // 앱 진입 즉시 보여줄 카드 수(4~5곳 권장 범위)

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

  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selectedLot = nearestLots.find((l) => l.id === selectedLotId) ?? null;

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
        .then((results) => {
          if (!cancelled) setSuggestions(results);
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
    setSuggestionsOpen(false);

    // 목록에서 이미 골라둔 연관 검색어가 있으면 그 좌표를 그대로 쓴다.
    if (suggestions.length > 0) {
      const best = suggestions[0];
      setSuggestions([]);
      setSearchLabel(best.name);
      setSearchCoords({ lat: best.lat, lng: best.lng });
      loadNearestLots({ lat: best.lat, lng: best.lng });
      return;
    }

    // 목록이 비어있는 상태(예: 포커스를 벗어나 닫힌 경우)로 바로 검색을 눌렀다면
    // 한 번 더 직접 검색해서 실좌표를 찾는다. 그래도 못 찾을 때만 대구 중심 좌표로 대신한다.
    setIsLoadingLots(true);
    try {
      const results = await searchDaeguPlaces(keyword, DAEGU_SEARCH_RECT);
      if (results.length > 0) {
        setSearchLabel(results[0].name);
        setSearchCoords({ lat: results[0].lat, lng: results[0].lng });
        await loadNearestLots({ lat: results[0].lat, lng: results[0].lng });
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

          <button
            type="button"
            style={styles.locationChip}
            onClick={requestCurrentLocation}
            translate="no"
            className="notranslate"
          >
            📍 {locationChipText}
          </button>

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
            {nearestLots.map((lot, index) => (
              <ParkingCard key={`${lot.id}-${index}`} lot={lot} onSelect={openDetail} />
            ))}
            {!isLoadingLots && nearestLots.length === 0 && !resultsError && (
              <p style={styles.emptyText}>{t.emptyResults}</p>
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
  spinner: {
    width: 14,
    height: 14,
    borderRadius: "50%",
    border: "2px solid var(--border)",
    borderTopColor: "var(--accent)",
    animation: "spin 0.7s linear infinite",
  },
};
