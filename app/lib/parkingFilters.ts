import type { ParkingLot } from "./types";

export type CategoryFilterKey = "all" | "free" | "ev" | "disabled" | "public";

export const CATEGORY_FILTER_KEYS: CategoryFilterKey[] = ["all", "free", "ev", "disabled", "public"];

// mapItem/mapDaeguItem(parkingApi.ts)이 공영/노상 주차장 이름 뒤에는 "공영주차장"
// 또는 "노상주차장"을, 민영 주차장 뒤에는 "(민영)"을 항상 붙여 두므로, 별도의
// type 필드 없이도 이름만으로 공영 여부를 판별할 수 있다.
export function matchesCategoryFilter(lot: ParkingLot, filter: CategoryFilterKey): boolean {
  switch (filter) {
    case "all":
      return true;
    case "free":
      return lot.fee.baseFee === 0 || (lot.fee.freeMin != null && lot.fee.freeMin > 0);
    case "ev":
      return lot.evSpots > 0;
    case "disabled":
      return lot.disabledSpots > 0;
    case "public":
      return lot.name.includes("공영") || lot.name.includes("노상");
    default:
      return true;
  }
}
