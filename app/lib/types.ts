export type Congestion = "available" | "moderate" | "busy" | "full";

export interface ParkingFee {
  baseMin: number;
  baseFee: number;
  addMin: number;
  addFee: number;
  freeMin?: number;
}

export interface ParkingLot {
  id: string;
  name: string;
  address: string;
  /** 실제 위경도. 현재 위치/선택한 목적지 기준 실거리 계산에 사용. */
  lat: number;
  lng: number;
  distanceM: number;
  totalSpots: number;
  availableSpots: number | null;
  congestion: Congestion;
  fee: ParkingFee;
  hours: string;
  evSpots: number;
  disabledSpots: number;
  realtimeSupported: boolean;
  lastSyncedMinutesAgo: number | null;
}
