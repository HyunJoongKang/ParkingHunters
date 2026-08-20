"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import KakaoMap, { type KakaoMapMarker } from "./components/KakaoMap";
import MapLegend from "./components/MapLegend";
import ParkingCard from "./components/ParkingCard";
import ParkingCardSkeleton from "./components/ParkingCardSkeleton";
import ParkingDetailSheet from "./components/ParkingDetailSheet";
import ParkingSummaryCard from "./components/ParkingSummaryCard";
import SettingsModal from "./components/SettingsModal";
import type { LatLng, RegionLabel } from "./lib/geo";
import {
  loadKakaoMapsSdk,
  resolveDaegyeongSearch,
  reverseGeocode,
  searchDaeguPlaces,
  type PlaceSuggestion,
} from "./lib/kakao";
import type { Dictionary } from "./lib/i18n";
import { formatMarkerLabel, formatRegionLabel, getLocalizedParkingName, statusColor } from "./lib/format";
import { useFavorites } from "./lib/favorites";
import { CATEGORY_FILTER_KEYS, matchesCategoryFilter, type CategoryFilterKey } from "./lib/parkingFilters";
import { useSettings } from "./lib/settings";
import type { ParkingLot } from "./lib/types";
import { useVoiceSearch, type VoiceLang, type VoiceSearchErrorCode } from "./lib/voiceSearch";

type ViewMode = "map" | "list";

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

function voiceErrorMessage(code: VoiceSearchErrorCode, t: Dictionary): string {
  switch (code) {
    case "unsupported":
      return t.voiceErrorUnsupported;
    case "insecure":
      return t.voiceErrorInsecure;
    case "not-allowed":
      return t.voiceErrorNotAllowed;
    case "no-speech":
      return t.voiceErrorNoSpeech;
    case "network":
      return t.voiceErrorNetwork;
    default:
      return t.voiceErrorGeneric;
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
const NEAREST_COUNT = 5; // 앱 진입 즉시 보여줄 카드/마커 수(4~5곳 권장 범위)

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
  const { t, locale, radiusM } = useSettings();
  const { isFavorite } = useFavorites();
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [activeFilter, setActiveFilter] = useState<CategoryFilterKey>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const suggestionSelectedRef = useRef(false);

  // 음성 검색 인식 언어는 화면 언어(locale)와 별개로 토글로 직접 고른다 — 처음
  // 진입 시에만 화면 언어에 맞춰 기본값을 잡아 준다.
  const [voiceLang, setVoiceLang] = useState<VoiceLang>(locale === "en" ? "en-US" : "ko-KR");
  const {
    isListening: isVoiceListening,
    isSupported: isVoiceSupported,
    toggle: toggleVoiceListening,
  } = useVoiceSearch({
    lang: voiceLang,
    onResult: (transcript) => {
      setQuery(transcript);
      suggestionSelectedRef.current = true; // 인식 결과는 연관 검색어 재조회 없이 바로 검색으로 넘어간다.
      setSuggestionsOpen(false);
      performSearch(transcript);
    },
    onError: (code) => {
      if (code === "aborted") return; // 사용자가 직접 멈춘 경우는 에러로 안내하지 않는다.
      showRegionToast(voiceErrorMessage(code, t));
    },
  });

  function handleVoiceButtonClick() {
    if (!isVoiceSupported) {
      showRegionToast(t.voiceErrorUnsupported);
      return;
    }
    toggleVoiceListening();
  }

  function toggleVoiceLang() {
    setVoiceLang((prev) => (prev === "ko-KR" ? "en-US" : "ko-KR"));
  }

  const [kakaoReady, setKakaoReady] = useState(false);
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
  // 역지오코딩으로 얻은 원본 행정구역 계층(시/도·구·동). 화면 표시 시 locale이
  // 'en'이면 formatRegionLabel로 영문 변환해 보여준다(원본은 그대로 유지해
  // 재지오코딩 없이 언어 전환에 즉시 반응하게 한다).
  const [myLocationRegion, setMyLocationRegion] = useState<RegionLabel | null>(null);
  const [myLocationRegionFailed, setMyLocationRegionFailed] = useState(false);
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
  // 즐겨찾기만 보기 + 조건 필터는 검색으로 이미 좁혀진 nearestLots 위에 AND로 겹쳐 적용된다.
  // 지도 마커와 리스트 카드가 항상 같은 결과를 보여주도록 이 필터링된 목록을 함께 쓴다.
  const displayedLots = nearestLots
    .filter((lot) => !showFavoritesOnly || isFavorite(lot.id))
    .filter((lot) => matchesCategoryFilter(lot, activeFilter));

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
      if (requestIdRef.current !== requestId) return; // 이후 요청이 이미 새로 시작됐으면 무시

      // 배포 플랫폼이 502/504 등으로 앱 대신 자체 HTML 에러 페이지를 내려보낼 수 있어,
      // res.json()을 바로 부르면 "Unexpected token '<'..." 파싱 에러가 난다. 먼저 텍스트로
      // 받아 JSON 파싱을 직접 시도하고, 실패하면 서버 응답이 아니라는 뜻이므로 그 자체를
      // 실패로 취급한다.
      const rawText = await res.text();
      let data: { lots?: ParkingLot[]; error?: string } | null = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = null;
      }

      if (!res.ok || !data) {
        throw new Error(data?.error ?? t.resultsLoadFailed);
      }
      const deduped = dedupeById<ParkingLot>(data.lots ?? []);
      setNearestLots(deduped);
      // 지도 첫 진입/재검색 시 가장 가까운 곳을 자동 선택해 하단 요약 카드를 바로 보여준다.
      // 기존 선택이 새 목록에도 있으면(반경만 바뀐 재조회 등) 그대로 유지한다.
      setSelectedLotId((prev) => (prev && deduped.some((l) => l.id === prev) ? prev : (deduped[0]?.id ?? null)));
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
        setMyLocationRegion(null);
        setMyLocationRegionFailed(false);
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
      if (cancelled) return;
      setMyLocationRegion(label);
      setMyLocationRegionFailed(!label);
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
    await performSearch(query.trim());
  }

  // handleSearchSubmit 본문에서 키워드를 받는 부분만 떼어냈다 — 음성 검색은 인식된
  // 텍스트를 setQuery로 반영하는 것과 별개로, state 업데이트를 기다리지 않고 그
  // 텍스트로 바로 검색을 실행해야 해서(리스너의 onResult 콜백에서 곧바로 호출) 이
  // 함수가 필요하다.
  async function performSearch(keyword: string) {
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

  // 영문 모드에서는 역지오코딩 원본(구조화된 시/도·구·동)을 매번 formatRegionLabel로
  // 변환해 보여준다 — 재지오코딩 없이 언어 전환에 즉시 반응한다.
  const myLocationLabel = myLocationRegion
    ? formatRegionLabel(myLocationRegion, locale)
    : myLocationRegionFailed
      ? t.locationLabelUnresolved
      : null;

  const locationChipText = locationError
    ? t.locationRetryHint(locationError)
    : !myLocation
      ? t.locationChecking
      : t.locationLabel(myLocationLabel ?? t.locationResolvingLabel);

  const mapCenter = searchCoords ?? DAEGU_CENTER;
  const markers: KakaoMapMarker[] = displayedLots.map((lot) => ({
    id: lot.id,
    lat: lot.lat,
    lng: lot.lng,
    color: statusColor(lot.realtimeSupported, lot.congestion),
    content: formatMarkerLabel(lot, locale),
    label: getLocalizedParkingName(lot.name, locale),
    selected: lot.id === selectedLotId,
  }));

  // 검색/필터/즐겨찾기 등 위쪽 컨트롤 묶음 — 지도 모드에서는 글래스 오버레이로,
  // 리스트 모드에서는 일반 헤더로 감싸 쓰기 때문에 렌더링 자체를 함수로 공유한다.
  function renderControls(): ReactNode {
    return (
      <>
        <div style={styles.appBarRow}>
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
              placeholder={t.searchPlaceholder}
              style={styles.searchInput}
              autoComplete="off"
            />
            <button
              type="button"
              style={styles.voiceLangToggle}
              onClick={toggleVoiceLang}
              aria-label={t.voiceLangToggleAria(voiceLang === "ko-KR" ? t.langKorean : t.langEnglish)}
            >
              {voiceLang === "ko-KR" ? "KO" : "EN"}
            </button>
            <button
              type="button"
              className={isVoiceListening ? "voice-btn voice-btn-listening" : "voice-btn"}
              style={styles.voiceButton}
              onClick={handleVoiceButtonClick}
              aria-pressed={isVoiceListening}
              aria-label={isVoiceListening ? t.voiceSearchStopAria : t.voiceSearchAria}
            >
              🎤
            </button>
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

        <div style={styles.filterChipRow}>
          {CATEGORY_FILTER_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              style={{
                ...styles.filterChip,
                ...(activeFilter === key ? styles.filterChipActive : null),
              }}
              onClick={() => setActiveFilter(key)}
              aria-pressed={activeFilter === key}
            >
              {t.categoryFilterLabel[key]}
            </button>
          ))}
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
      </>
    );
  }

  const fabBottom = viewMode === "map" && selectedLot ? 152 : 20;

  return (
    <main style={styles.shell}>
      <div style={styles.appFrame}>
        <div style={styles.mapLayer}>
          <KakaoMap
            center={mapCenter}
            level={radiusM <= 500 ? 4 : 5}
            fill
            markers={markers}
            onMarkerClick={setSelectedLotId}
            currentLocation={myLocation}
            destination={searchLabel ? searchCoords : null}
          />
        </div>

        {viewMode === "map" ? (
          <>
            <div style={styles.overlayControls}>{renderControls()}</div>
            {selectedLot && (
              <ParkingSummaryCard
                lot={selectedLot}
                onOpenDetail={() => setDetailOpen(true)}
                onClose={() => setSelectedLotId(null)}
              />
            )}
          </>
        ) : (
          <div style={styles.listPanel}>
            <div style={styles.listPanelHeader}>{renderControls()}</div>
            <div style={styles.listScroll}>
              {isLoadingLots ? (
                Array.from({ length: NEAREST_COUNT }).map((_, index) => <ParkingCardSkeleton key={index} />)
              ) : (
                <>
                  {displayedLots.map((lot, index) => (
                    <ParkingCard key={`${lot.id}-${index}`} lot={lot} onSelect={openDetail} />
                  ))}
                  {displayedLots.length === 0 && !resultsError && (
                    <p style={styles.emptyText}>
                      {showFavoritesOnly
                        ? t.favoritesEmptyText
                        : activeFilter !== "all"
                          ? t.filterEmptyText
                          : t.emptyResults}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          style={{ ...styles.fab, bottom: fabBottom }}
          onClick={() => setViewMode((v) => (v === "map" ? "list" : "map"))}
        >
          {viewMode === "map" ? `☰ ${t.listViewLabel}` : `🗺️ ${t.mapViewLabel}`}
        </button>

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
    position: "fixed",
    inset: 0,
    display: "flex",
    justifyContent: "center",
  },
  appFrame: {
    position: "relative",
    width: "100%",
    maxWidth: 460,
    height: "100%",
    background: "var(--surface)",
    overflow: "hidden",
    boxShadow: "0 0 40px rgba(0, 0, 0, 0.06)",
  },
  mapLayer: {
    position: "absolute",
    inset: 0,
  },
  overlayControls: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 6,
    background: "var(--glass-bg)",
    backdropFilter: "blur(18px) saturate(180%)",
    WebkitBackdropFilter: "blur(18px) saturate(180%)",
    borderBottom: "1px solid var(--glass-border)",
    padding: "16px 18px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  listPanel: {
    position: "absolute",
    inset: 0,
    zIndex: 4,
    background: "var(--surface)",
    display: "flex",
    flexDirection: "column",
  },
  listPanelHeader: {
    flexShrink: 0,
    padding: "16px 18px 12px",
    borderBottom: "1px solid var(--border-soft)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  listScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "14px 18px 90px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  appBarRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
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
    boxShadow: "0 12px 28px rgba(0, 0, 0, 0.14)",
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
  voiceLangToggle: {
    flexShrink: 0,
    padding: "3px 7px",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.3,
    color: "var(--text-dim)",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 999,
    cursor: "pointer",
  },
  voiceButton: {
    flexShrink: 0,
    width: 30,
    height: 30,
    borderRadius: "50%",
    border: "none",
    background: "transparent",
    fontSize: 15,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "var(--text-dim)",
  },
  filterChipRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 2,
  },
  filterChip: {
    flexShrink: 0,
    padding: "7px 14px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--surface-alt)",
    color: "var(--filter-chip-text)",
    fontWeight: 600,
    fontSize: 12.5,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease",
  },
  filterChipActive: {
    border: "1px solid var(--accent)",
    background: "var(--accent)",
    color: "#fff",
    transform: "scale(1.04)",
    boxShadow: "0 6px 16px rgba(var(--accent-rgb), 0.35)",
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
    transition: "background 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.15s ease",
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
  emptyText: {
    margin: "8px 0",
    fontSize: 13,
    color: "var(--text-faint)",
    textAlign: "center",
  },
  fab: {
    position: "absolute",
    right: 18,
    zIndex: 8,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "12px 18px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    fontWeight: 800,
    fontSize: 13.5,
    cursor: "pointer",
    boxShadow: "var(--shadow-lg)",
    transition: "bottom 0.2s ease",
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
    boxShadow: "0 12px 28px rgba(0, 0, 0, 0.18)",
    transition: "opacity 0.25s ease, transform 0.25s ease",
  },
};
