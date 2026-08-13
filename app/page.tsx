"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import KakaoMap from "./components/KakaoMap";
import MapLegend from "./components/MapLegend";
import ParkingCard from "./components/ParkingCard";
import StatusChip from "./components/StatusChip";
import { formatFee, formatSyncedAgo, statusColor } from "./lib/format";
import { GEOLOCATION_ERROR_MESSAGES, type LatLng } from "./lib/geo";
import { searchDaeguPlaces, type PlaceSuggestion } from "./lib/kakao";
import type { ParkingLot, SearchContext } from "./lib/types";

type Screen = "home" | "results" | "detail";

// PRD상 1차 서비스 지역이 대구이므로 대구 바깥의 동명 결과(예: 부산 동성로)가
// 섞여 나오지 않게 한다. 다만 대구시청 기준 반경(예: 20km)으로 자르면 군위군·
// 달성군 외곽처럼 시청에서 멀리 떨어진 대구 내 지역(시청에서 40km 이상)이 아예
// 검색되지 않는 문제가 있었다. 그래서 위치를 좁히는 용도로는 대구 전역(군위군
// 포함)을 넉넉히 감싸는 사각 영역(rect)만 쓰고, 실제 "대구 안인지"는 주소 문자열이
// "대구"로 시작하는지로 판단한다(아래 selectPlace 쪽 필터).
const DAEGU_CENTER = { lat: 35.8714, lng: 128.6014 };
// 좌하단(lng,lat), 우상단(lng,lat) — 남쪽 가창면부터 북쪽 군위군, 서쪽 달성군
// 외곽부터 동쪽 팔공산 자락까지 여유 있게 포함한다.
const DAEGU_SEARCH_RECT = "128.25,35.60,128.85,36.35";
const NEAREST_COUNT = 6; // 결과 화면에 보여줄 최대 주차장 수(5~7곳 권장 범위의 중간값)

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
  const [screen, setScreen] = useState<Screen>("home");
  const [locationPromptOpen, setLocationPromptOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchContext, setSearchContext] = useState<SearchContext | null>(null);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [navNote, setNavNote] = useState(false);

  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  // 현재 위치 GPS 좌표 또는 선택한 목적지 좌표. 결과 화면에서 실거리 정렬의 기준점으로
  // 쓰이고, 지도가 실제 kakao.maps.Map으로 교체되면 map.setCenter(...)에도 그대로 쓸 수 있다.
  const [searchCoords, setSearchCoords] = useState<LatLng | null>(null);
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
  const [locationError, setLocationError] = useState("");
  const [nearestLots, setNearestLots] = useState<ParkingLot[]>([]);
  const [resultsError, setResultsError] = useState("");
  const suggestionSelectedRef = useRef(false);

  const selectedLot = nearestLots.find((l) => l.id === selectedLotId) ?? null;

  // 대경권 공영주차장 전체(공공데이터포털) 중 기준 좌표에서 가장 가까운 곳들을 서버 API로 조회한다.
  async function goToResults(ctx: SearchContext, coords: LatLng | null) {
    setIsSearching(true);
    setResultsError("");
    setSearchCoords(coords);
    try {
      const params = new URLSearchParams({ limit: String(NEAREST_COUNT) });
      if (coords) {
        params.set("lat", String(coords.lat));
        params.set("lng", String(coords.lng));
      }
      const res = await fetch(`/api/parking-lots?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "주차장 정보를 불러오지 못했습니다.");
      setNearestLots(dedupeById(data.lots ?? []));
      setSearchContext(ctx);
      setScreen("results");
    } catch (err) {
      setResultsError(err instanceof Error ? err.message : "주차장 정보를 불러오지 못했습니다.");
    } finally {
      setIsSearching(false);
    }
  }

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
      console.warn(
        "[KakaoPlaces] SDK가 아직 준비되지 않았습니다. window.kakao:",
        Boolean(window.kakao),
        "services:",
        Boolean(window.kakao?.maps?.services)
      );
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchDaeguPlaces(keyword, DAEGU_SEARCH_RECT)
        .then((results) => {
          console.log("[KakaoSearch] 검색 결과:", { keyword, count: results.length });
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
    goToResults({ mode: "destination", label: place.name }, { lat: place.lat, lng: place.lng });
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
      goToResults({ mode: "destination", label: best.name }, { lat: best.lat, lng: best.lng });
      return;
    }

    // 목록이 비어있는 상태(예: 포커스를 벗어나 닫힌 경우)로 바로 검색을 눌렀다면
    // 한 번 더 직접 검색해서 실좌표를 찾는다. 그래도 못 찾을 때만 대구 중심 좌표로 대신한다.
    setIsSearching(true);
    try {
      const results = await searchDaeguPlaces(keyword, DAEGU_SEARCH_RECT);
      if (results.length > 0) {
        goToResults({ mode: "destination", label: results[0].name }, { lat: results[0].lat, lng: results[0].lng });
      } else {
        setResultsError(`"${keyword}"의 정확한 위치를 찾지 못해 대구 중심 기준으로 보여드려요.`);
        goToResults({ mode: "destination", label: keyword }, DAEGU_CENTER);
      }
    } finally {
      setIsSearching(false);
    }
  }

  function handleUseCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setLocationError("이 브라우저는 위치 정보 기능을 지원하지 않습니다.");
      return;
    }
    setLocationError("");
    setLocationPromptOpen(false);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setMyLocation(coords);
        goToResults({ mode: "current", label: "현재 위치" }, coords);
      },
      (err) => {
        setLocationError(GEOLOCATION_ERROR_MESSAGES[err.code] ?? "위치 정보를 가져오지 못했습니다.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function openDetail(id: string) {
    setSelectedLotId(id);
    setNavNote(false);
    setScreen("detail");
  }

  function backToResults() {
    setScreen("results");
  }

  function backToHome() {
    setScreen("home");
    setSearchContext(null);
    setQuery("");
    setSuggestions([]);
    setSuggestionsOpen(false);
    setSearchCoords(null);
    setResultsError("");
  }

  return (
    <main style={styles.shell}>
      <div style={styles.appFrame}>
        <header style={styles.appBar}>
          {screen !== "home" ? (
            <button
              type="button"
              style={styles.backButton}
              onClick={screen === "detail" ? backToResults : backToHome}
              aria-label="뒤로가기"
            >
              ←
            </button>
          ) : (
            <span style={styles.brandMark}>P</span>
          )}
          <div style={styles.appBarTitle}>
            {screen === "home" && "대구 주차"}
            {screen === "results" &&
              (searchContext?.mode === "current" ? "현재 위치 주변" : `${searchContext?.label} 주변`)}
            {screen === "detail" && selectedLot?.name}
          </div>
          <span style={{ width: 30 }} />
        </header>

        <section style={styles.screenBody}>
          {screen === "home" && (
            <div style={styles.homeStack}>
              <div style={styles.heroText}>
                <p style={styles.heroEyebrow}>목적지 도착 전, 미리 확인하세요</p>
                <h1 style={styles.heroTitle}>지금 이 근처, 세울 자리 있을까요?</h1>
              </div>

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
                    placeholder="목적지 검색 (예: 동성로, 동대구역)"
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
                            <div style={styles.suggestionTopRow}>
                              <span style={styles.suggestionName}>{place.name}</span>
                              {distanceM != null && distanceM > 0 && (
                                <span style={styles.suggestionDistance}>
                                  {distanceM < 1000
                                    ? `${distanceM}m`
                                    : `${(distanceM / 1000).toFixed(1)}km`}
                                </span>
                              )}
                            </div>
                            <span style={styles.suggestionAddress}>{place.address}</span>
                            {place.category && (
                              <span style={styles.suggestionCategory}>{place.category}</span>
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
                style={styles.currentLocationButton}
                onClick={handleUseCurrentLocation}
              >
                📍 현재 위치로 찾기
              </button>
              {locationError && <p style={styles.locationErrorText}>{locationError}</p>}
              {resultsError && <p style={styles.locationErrorText}>{resultsError}</p>}

              <div style={styles.mapWrap}>
                <KakaoMap
                  center={myLocation ?? DAEGU_CENTER}
                  currentLocation={myLocation}
                  level={myLocation ? 5 : 8}
                  height={230}
                />
                {!myLocation && (
                  <div style={styles.mapHint}>
                    위치 권한을 허용하면 내 주변 지도가 표시돼요
                  </div>
                )}
              </div>
            </div>
          )}

          {screen === "results" && (
            <div style={styles.resultsStack}>
              <KakaoMap
                center={searchCoords ?? DAEGU_CENTER}
                level={6}
                currentLocation={myLocation}
                destination={searchContext?.mode === "destination" ? searchCoords : null}
                markers={nearestLots.map((lot) => ({
                  id: lot.id,
                  lat: lot.lat,
                  lng: lot.lng,
                  color: statusColor(lot.realtimeSupported, lot.congestion),
                  label: lot.name,
                  selected: lot.id === selectedLotId,
                }))}
                onMarkerClick={openDetail}
                height={200}
              />
              <MapLegend />
              <p style={styles.resultsCount}>
                실거리순 · 대경권 공영주차장 중 가장 가까운 <b>{nearestLots.length}</b>곳
              </p>
              <div style={styles.list}>
                {nearestLots.map((lot, index) => (
                  <ParkingCard key={`${lot.id}-${index}`} lot={lot} onSelect={openDetail} />
                ))}
              </div>
            </div>
          )}

          {screen === "detail" && selectedLot && (
            <div style={styles.detailStack}>
              <KakaoMap
                center={{ lat: selectedLot.lat, lng: selectedLot.lng }}
                level={4}
                markers={[
                  {
                    id: selectedLot.id,
                    lat: selectedLot.lat,
                    lng: selectedLot.lng,
                    color: statusColor(selectedLot.realtimeSupported, selectedLot.congestion),
                    label: selectedLot.name,
                    selected: true,
                  },
                ]}
                height={150}
              />

              <div style={styles.detailCard}>
                <div style={styles.detailStatusRow}>
                  <StatusChip
                    realtimeSupported={selectedLot.realtimeSupported}
                    congestion={selectedLot.congestion}
                  />
                  <span style={styles.detailSynced}>
                    {formatSyncedAgo(selectedLot.lastSyncedMinutesAgo)}
                  </span>
                </div>

                {selectedLot.realtimeSupported ? (
                  <div style={styles.detailSpots}>
                    <span style={styles.detailSpotsNum}>{selectedLot.availableSpots}</span>
                    <span style={styles.detailSpotsTotal}>/ {selectedLot.totalSpots}면 여유</span>
                  </div>
                ) : (
                  <p style={styles.detailNoRealtime}>
                    이 주차장은 실시간 여유 정보를 제공하지 않아요. 기본 정보만 확인할 수 있어요.
                  </p>
                )}

                <p style={styles.detailAddress}>{selectedLot.address}</p>
              </div>

              <div style={styles.infoGrid}>
                <InfoRow label="운영시간" value={selectedLot.hours} />
                <InfoRow label="요금" value={formatFee(selectedLot.fee)} />
                <InfoRow
                  label="전용 구역"
                  value={`전기차 ${selectedLot.evSpots}면 · 장애인 ${selectedLot.disabledSpots}면`}
                />
              </div>

              <button
                type="button"
                style={styles.navButton}
                onClick={() => setNavNote(true)}
              >
                🧭 길찾기로 이동
              </button>
              {navNote && (
                <p style={styles.navNote}>
                  외부 내비게이션 연동은 다음 버전에서 지원될 예정이에요.
                </p>
              )}
            </div>
          )}
        </section>

        {locationPromptOpen && screen === "home" && (
          <div style={styles.overlay}>
            <div style={styles.permissionCard}>
              <span style={styles.permissionIcon}>📍</span>
              <h2 style={styles.permissionTitle}>현재 위치 접근 허용</h2>
              <p style={styles.permissionBody}>
                내 주변 실시간 주차 정보를 보여드리려면 위치 정보 접근을 허용해 주세요.
              </p>
              <div style={styles.permissionButtons}>
                <button
                  type="button"
                  style={styles.permissionSecondary}
                  onClick={() => setLocationPromptOpen(false)}
                >
                  나중에
                </button>
                <button
                  type="button"
                  style={styles.permissionPrimary}
                  onClick={() => {
                    setLocationPromptOpen(false);
                    if (!("geolocation" in navigator)) return;
                    navigator.geolocation.getCurrentPosition(
                      (position) => {
                        setMyLocation({
                          lat: position.coords.latitude,
                          lng: position.coords.longitude,
                        });
                      },
                      () => {
                        // 최초 진입 시의 가벼운 요청이라 실패해도 조용히 넘어간다.
                        // 필요하면 "현재 위치로 찾기" 버튼에서 다시 시도하며 에러를 보여준다.
                      }
                    );
                  }}
                >
                  허용
                </button>
              </div>
            </div>
          </div>
        )}

        {isSearching && (
          <div style={styles.overlay}>
            <div style={styles.loadingCard}>
              <span style={styles.spinner} />
              <span>주변 주차장을 찾는 중...</span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoLabel}>{label}</span>
      <span style={styles.infoValue}>{value}</span>
    </div>
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
  backButton: {
    width: 30,
    height: 30,
    border: "none",
    background: "transparent",
    fontSize: 18,
    color: "var(--text)",
    cursor: "pointer",
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
  screenBody: {
    flex: 1,
    padding: "18px 18px 32px",
    display: "flex",
    flexDirection: "column",
  },
  homeStack: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  heroText: {
    marginBottom: 2,
  },
  heroEyebrow: {
    margin: 0,
    fontSize: 12.5,
    fontWeight: 700,
    color: "var(--accent-strong)",
    letterSpacing: "0.02em",
  },
  heroTitle: {
    margin: "6px 0 0",
    fontFamily: "var(--font-display)",
    fontSize: 22,
    lineHeight: 1.35,
    color: "var(--text)",
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
  currentLocationButton: {
    alignSelf: "flex-start",
    padding: "9px 14px",
    borderRadius: 999,
    border: "1px solid var(--accent-line)",
    background: "var(--accent-soft)",
    color: "var(--accent-strong)",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  locationErrorText: {
    margin: 0,
    fontSize: 12.5,
    color: "var(--danger)",
    fontWeight: 600,
  },
  mapWrap: {
    position: "relative",
    marginTop: 4,
  },
  mapHint: {
    position: "absolute",
    left: 12,
    bottom: 12,
    right: 12,
    background: "rgba(12, 26, 23, 0.72)",
    color: "#fff",
    fontSize: 12,
    padding: "8px 12px",
    borderRadius: "var(--radius-sm)",
    textAlign: "center",
  },
  resultsStack: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  resultsCount: {
    margin: "4px 0 10px",
    fontSize: 13,
    color: "var(--text-dim)",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  detailStack: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  detailCard: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  detailStatusRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailSynced: {
    fontSize: 12,
    color: "var(--text-faint)",
    fontWeight: 600,
  },
  detailSpots: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  },
  detailSpotsNum: {
    fontFamily: "var(--font-display)",
    fontSize: 40,
    color: "var(--accent-strong)",
    lineHeight: 1,
  },
  detailSpotsTotal: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-dim)",
  },
  detailNoRealtime: {
    margin: 0,
    fontSize: 13.5,
    color: "var(--text-dim)",
    background: "var(--surface-alt)",
    borderRadius: "var(--radius-sm)",
    padding: "10px 12px",
  },
  detailAddress: {
    margin: 0,
    fontSize: 13.5,
    color: "var(--text-dim)",
  },
  infoGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    overflow: "hidden",
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    borderBottom: "1px solid var(--border-soft)",
    fontSize: 13.5,
  },
  infoLabel: {
    color: "var(--text-faint)",
    fontWeight: 600,
    flexShrink: 0,
  },
  infoValue: {
    color: "var(--text)",
    fontWeight: 600,
    textAlign: "right",
  },
  navButton: {
    padding: "14px 16px",
    borderRadius: "var(--radius-md)",
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
  },
  navNote: {
    margin: "-6px 0 0",
    fontSize: 12.5,
    color: "var(--text-faint)",
    textAlign: "center",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(12, 26, 23, 0.4)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    padding: 18,
  },
  permissionCard: {
    width: "100%",
    background: "var(--surface)",
    borderRadius: "var(--radius-lg)",
    padding: "26px 22px 22px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 6,
    animation: "fade-in-up 0.2s ease both",
  },
  permissionIcon: {
    fontSize: 30,
    marginBottom: 4,
  },
  permissionTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 800,
    color: "var(--text)",
  },
  permissionBody: {
    margin: "4px 0 16px",
    fontSize: 13.5,
    color: "var(--text-dim)",
    lineHeight: 1.6,
  },
  permissionButtons: {
    display: "flex",
    gap: 10,
    width: "100%",
  },
  permissionSecondary: {
    flex: 1,
    padding: "12px 0",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text-dim)",
    fontWeight: 700,
    cursor: "pointer",
  },
  permissionPrimary: {
    flex: 1,
    padding: "12px 0",
    borderRadius: "var(--radius-sm)",
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  loadingCard: {
    margin: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "var(--surface)",
    borderRadius: 999,
    padding: "12px 20px",
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-dim)",
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
