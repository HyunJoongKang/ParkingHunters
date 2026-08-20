import type { CategoryFilterKey } from "./parkingFilters";
import type { Congestion } from "./types";

export type Locale = "ko" | "en";

export interface Dictionary {
  searchPlaceholder: string;
  voiceSearchAria: string;
  voiceSearchStopAria: string;
  voiceErrorUnsupported: string;
  voiceErrorInsecure: string;
  voiceErrorNotAllowed: string;
  voiceErrorNoSpeech: string;
  voiceErrorNetwork: string;
  voiceErrorGeneric: string;
  settingsAria: string;
  refreshLocationAria: string;
  settingsTitle: string;
  languageLabel: string;
  themeLabel: string;
  themeLight: string;
  themeDark: string;
  langKorean: string;
  langEnglish: string;
  closeAria: string;
  navigateButton: string;
  navigateButtonShort: string;
  listViewLabel: string;
  mapViewLabel: string;
  resetToCurrentLocation: string;
  emptyResults: string;
  resultsLoadFailed: string;
  feeSectionTitle: string;
  feeBaseLabel: string;
  feeAddLabel: string;
  feeBasePrefix: string;
  hoursLabel: string;
  specialZonesLabel: string;
  basicInfoOnly: string;
  syncedJustNow: string;
  syncedUnsupported: string;
  statusUnknown: string;
  congestionLabel: Record<Congestion, string>;
  geoUnsupported: string;
  geoDenied: string;
  geoUnavailable: string;
  geoTimeout: string;
  geoUnknown: string;
  locationChecking: string;
  locationResolvingLabel: string;
  locationLabelUnresolved: string;
  mapLoading: string;
  mapLoadFailed: string;
  mapMissingKey: string;
  spotsUnit: string;
  spotsAvailableSuffix: string;
  searchRadiusLabel: string;
  radius500Label: string;
  radius1kmLabel: string;
  favoritesOnlyLabel: string;
  favoritesEmptyText: string;
  favoriteAddAria: string;
  favoriteRemoveAria: string;
  categoryFilterLabel: Record<CategoryFilterKey, string>;
  filterEmptyText: string;
  badgePublic: string;
  badgePrivate: string;
  badgeFree: string;
  badgePaid: string;
  locationLabel(label: string): string;
  locationRetryHint(message: string): string;
  nearbyContext(label: string): string;
  searchNotFound(keyword: string): string;
  searchOutOfRegion(keyword: string): string;
  specialZones(ev: number, disabled: number): string;
  syncedMinutesAgo(minutes: number): string;
}

const ko: Dictionary = {
  searchPlaceholder: "목적지 검색 (예: 동성로, 동대구역)",
  voiceSearchAria: "음성으로 검색",
  voiceSearchStopAria: "음성 인식 중지",
  voiceErrorUnsupported: "이 브라우저는 음성 인식을 지원하지 않습니다.",
  voiceErrorInsecure: "음성 인식은 보안 연결(HTTPS)에서만 사용할 수 있습니다.",
  voiceErrorNotAllowed:
    "마이크 권한이 차단되어 있습니다. 브라우저 주소창 왼쪽 설정(자물쇠/마이크 아이콘)에서 마이크 허용으로 변경해 주세요.",
  voiceErrorNoSpeech: "음성이 감지되지 않았습니다. 다시 시도해 주세요.",
  voiceErrorNetwork: "네트워크 오류로 음성 인식에 실패했습니다.",
  voiceErrorGeneric: "음성 인식 중 오류가 발생했습니다.",
  settingsAria: "설정",
  refreshLocationAria: "현재 위치 새로고침",
  settingsTitle: "설정",
  languageLabel: "언어",
  themeLabel: "테마",
  themeLight: "라이트",
  themeDark: "다크",
  langKorean: "한국어",
  langEnglish: "English",
  closeAria: "닫기",
  navigateButton: "🧭 길찾기",
  navigateButtonShort: "길찾기",
  listViewLabel: "리스트 보기",
  mapViewLabel: "지도 보기",
  resetToCurrentLocation: "현재 위치로",
  emptyResults: "주변 주차장을 찾지 못했어요.",
  resultsLoadFailed: "주차장 정보를 불러오지 못했습니다.",
  feeSectionTitle: "요금",
  feeBaseLabel: "기본 요금",
  feeAddLabel: "추가 요금",
  feeBasePrefix: "기본",
  hoursLabel: "운영시간",
  specialZonesLabel: "전용 구역",
  basicInfoOnly: "기본 정보만 제공",
  syncedJustNow: "방금 갱신",
  syncedUnsupported: "실시간 정보 미지원",
  statusUnknown: "정보없음",
  congestionLabel: { available: "여유", moderate: "보통", busy: "혼잡", full: "만차" },
  geoUnsupported: "이 브라우저는 위치 정보 기능을 지원하지 않습니다.",
  geoDenied: "위치 정보 접근 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해 주세요.",
  geoUnavailable: "현재 위치를 확인할 수 없습니다.",
  geoTimeout: "위치 확인 시간이 초과되었습니다. 다시 시도해 주세요.",
  geoUnknown: "위치 정보를 가져오지 못했습니다.",
  locationChecking: "위치 확인 중...",
  locationResolvingLabel: "확인 중...",
  locationLabelUnresolved: "위치 이름을 확인할 수 없어요",
  mapLoading: "지도를 불러오는 중...",
  mapLoadFailed: "지도를 불러오지 못했습니다.",
  mapMissingKey: "지도 설정이 올바르지 않습니다.",
  spotsUnit: "면",
  spotsAvailableSuffix: "면 여유",
  searchRadiusLabel: "검색 반경",
  radius500Label: "500m",
  radius1kmLabel: "1km",
  favoritesOnlyLabel: "즐겨찾기만 보기",
  favoritesEmptyText: "즐겨찾기한 주차장이 없습니다",
  favoriteAddAria: "즐겨찾기에 추가",
  favoriteRemoveAria: "즐겨찾기에서 해제",
  categoryFilterLabel: {
    all: "전체",
    free: "무료 주차",
    ev: "전기차 충전",
    disabled: "장애인 전용",
    public: "공영만",
  },
  filterEmptyText: "조건에 맞는 주차장이 없습니다",
  badgePublic: "공영",
  badgePrivate: "민영",
  badgeFree: "무료",
  badgePaid: "유료",
  locationLabel: (label) => `현재 위치: ${label}`,
  locationRetryHint: (message) => `${message} (탭하여 다시 시도)`,
  nearbyContext: (label) => `${label} 근처 · 실거리순`,
  searchNotFound: (keyword) => `"${keyword}"의 정확한 위치를 찾지 못해 대구 중심 기준으로 보여드려요.`,
  searchOutOfRegion: (keyword) => `"${keyword}"은(는) 대경권(대구·경북) 지역이 아닙니다.`,
  specialZones: (ev, disabled) => `전기차 ${ev}면 · 장애인 ${disabled}면`,
  syncedMinutesAgo: (minutes) => `${minutes}분 전 갱신`,
};

const en: Dictionary = {
  searchPlaceholder: "Search location",
  voiceSearchAria: "Search by voice",
  voiceSearchStopAria: "Stop voice search",
  voiceErrorUnsupported: "This browser doesn't support voice recognition.",
  voiceErrorInsecure: "Voice recognition requires a secure (HTTPS) connection.",
  voiceErrorNotAllowed:
    "Microphone access is blocked. Click the lock/mic icon on the left of your browser's address bar and allow microphone access.",
  voiceErrorNoSpeech: "No speech was detected. Please try again.",
  voiceErrorNetwork: "Voice recognition failed due to a network error.",
  voiceErrorGeneric: "Something went wrong during voice recognition.",
  settingsAria: "Settings",
  refreshLocationAria: "Refresh current location",
  settingsTitle: "Settings",
  languageLabel: "Language",
  themeLabel: "Theme",
  themeLight: "Light",
  themeDark: "Dark",
  langKorean: "Korean",
  langEnglish: "English",
  closeAria: "Close",
  navigateButton: "🧭 Directions",
  navigateButtonShort: "Go",
  listViewLabel: "List view",
  mapViewLabel: "Map view",
  resetToCurrentLocation: "Use Current Location",
  emptyResults: "No nearby parking lots found.",
  resultsLoadFailed: "Couldn't load parking lot information.",
  feeSectionTitle: "Fees",
  feeBaseLabel: "Base fee",
  feeAddLabel: "Additional fee",
  feeBasePrefix: "Basic",
  hoursLabel: "Hours",
  specialZonesLabel: "Reserved spots",
  basicInfoOnly: "Basic info only",
  syncedJustNow: "Just updated",
  syncedUnsupported: "Real-time data unavailable",
  statusUnknown: "No Info",
  congestionLabel: { available: "Available", moderate: "Normal", busy: "Crowded", full: "Full" },
  geoUnsupported: "This browser doesn't support location services.",
  geoDenied: "Location access was denied. Please allow location permission in your browser settings.",
  geoUnavailable: "Couldn't determine your current location.",
  geoTimeout: "Location request timed out. Please try again.",
  geoUnknown: "Couldn't get your location.",
  locationChecking: "Locating...",
  locationResolvingLabel: "Resolving...",
  locationLabelUnresolved: "Couldn't resolve location name",
  mapLoading: "Loading map...",
  mapLoadFailed: "Couldn't load the map.",
  mapMissingKey: "Map configuration is invalid.",
  spotsUnit: " spots",
  spotsAvailableSuffix: " spots available",
  searchRadiusLabel: "Search radius",
  radius500Label: "500m",
  radius1kmLabel: "1km",
  favoritesOnlyLabel: "Favorites only",
  favoritesEmptyText: "No favorite parking lots yet.",
  favoriteAddAria: "Add to favorites",
  favoriteRemoveAria: "Remove from favorites",
  categoryFilterLabel: {
    all: "All",
    free: "Free parking",
    ev: "EV charging",
    disabled: "Accessible only",
    public: "Public only",
  },
  filterEmptyText: "No parking lots match the selected filter.",
  badgePublic: "Public",
  badgePrivate: "Private",
  badgeFree: "Free",
  badgePaid: "Paid",
  locationLabel: (label) => `Current location: ${label}`,
  locationRetryHint: (message) => `${message} (tap to retry)`,
  nearbyContext: (label) => `Near ${label} · Sorted by distance`,
  searchNotFound: (keyword) =>
    `Couldn't find an exact location for "${keyword}" — showing results near central Daegu instead.`,
  searchOutOfRegion: (keyword) =>
    `"${keyword}" is outside the Daegu·Gyeongbuk service area.`,
  specialZones: (ev, disabled) => `EV ${ev} · Accessible ${disabled}`,
  syncedMinutesAgo: (minutes) => `Updated ${minutes} ${minutes === 1 ? "min" : "mins"} ago`,
};

export const DICTIONARIES: Record<Locale, Dictionary> = { ko, en };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}
