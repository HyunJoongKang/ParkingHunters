import type { Congestion, ParkingFee } from "./types";

export const CONGESTION_LABEL: Record<Congestion, string> = {
  available: "여유",
  moderate: "보통",
  busy: "혼잡",
  full: "만차",
};

export const CONGESTION_COLOR: Record<Congestion, string> = {
  available: "#1fa971",
  moderate: "#d4a017",
  busy: "#e07a2c",
  full: "#e0473d",
};

export const UNKNOWN_COLOR = "#94a3ac";

export function statusColor(realtimeSupported: boolean, congestion: Congestion): string {
  return realtimeSupported ? CONGESTION_COLOR[congestion] : UNKNOWN_COLOR;
}

export function statusLabel(realtimeSupported: boolean, congestion: Congestion): string {
  return realtimeSupported ? CONGESTION_LABEL[congestion] : "정보없음";
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

export function formatFee(fee: ParkingFee): string {
  const base =
    fee.baseFee === 0
      ? `기본 ${fee.baseMin}분 무료`
      : `기본 ${fee.baseMin}분 ${fee.baseFee.toLocaleString()}원`;
  const add = `이후 ${fee.addMin}분당 ${fee.addFee.toLocaleString()}원`;
  return `${base} · ${add}`;
}

export function formatSyncedAgo(minutes: number | null): string {
  if (minutes === null) return "실시간 정보 미지원";
  if (minutes === 0) return "방금 갱신";
  return `${minutes}분 전 갱신`;
}
