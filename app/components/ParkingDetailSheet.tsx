"use client";

import { useEffect, useState, type CSSProperties } from "react";
import KakaoMap from "./KakaoMap";
import StatusChip from "./StatusChip";
import {
  formatAddFee,
  formatBaseFee,
  formatSyncedAgo,
  getLocalizedAddress,
  getLocalizedParkingName,
  statusColor,
} from "../lib/format";
import { useFavorites } from "../lib/favorites";
import { startNavigation } from "../lib/navi";
import { useSettings } from "../lib/settings";
import type { ParkingLot } from "../lib/types";

interface ParkingDetailSheetProps {
  lot: ParkingLot | null;
  open: boolean;
  onClose: () => void;
}

export default function ParkingDetailSheet({ lot, open, onClose }: ParkingDetailSheetProps) {
  const { locale, t } = useSettings();
  const { isFavorite, toggleFavorite } = useFavorites();
  // 닫히는 애니메이션(슬라이드 다운) 중에도 내용이 비어 보이지 않도록, 마지막으로
  // 선택된 주차장 정보를 별도로 들고 있다가 open이 true로 바뀔 때만 최신 lot으로 갱신한다.
  const [displayLot, setDisplayLot] = useState<ParkingLot | null>(lot);

  useEffect(() => {
    if (lot) setDisplayLot(lot);
  }, [lot]);

  if (!displayLot) return null;

  // 카카오맵 길찾기(openKakaoNavigation)에는 실제 검색에 쓰이는 원래 한국어 이름을
  // 그대로 써야 하므로, 화면 표시용 이 값과 분리해 둔다.
  const localizedName = getLocalizedParkingName(displayLot.name, locale);
  const localizedAddress = getLocalizedAddress(displayLot.address, locale);
  const favorite = isFavorite(displayLot.id);

  return (
    <div
      style={{ ...styles.backdrop, opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
      onClick={onClose}
      aria-hidden={!open}
    >
      <div
        style={{ ...styles.sheet, transform: open ? "translateY(0)" : "translateY(100%)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={localizedName}
      >
        <div style={styles.grabber} />
        <button
          type="button"
          style={styles.favoriteButton}
          onClick={() => toggleFavorite(displayLot.id)}
          aria-label={favorite ? t.favoriteRemoveAria : t.favoriteAddAria}
          aria-pressed={favorite}
        >
          {favorite ? "❤️" : "🤍"}
        </button>
        <button type="button" style={styles.closeButton} onClick={onClose} aria-label={t.closeAria}>
          ✕
        </button>

        <div style={styles.scrollArea}>
          <div style={styles.header}>
            <h2 style={styles.name} translate="no" className="notranslate">
              {localizedName}
            </h2>
            <p style={styles.address} translate="no" className="notranslate">
              {localizedAddress}
            </p>
            <div style={styles.statusRow}>
              <StatusChip
                realtimeSupported={displayLot.realtimeSupported}
                congestion={displayLot.congestion}
              />
              <span style={styles.synced}>
                {formatSyncedAgo(displayLot.lastSyncedMinutesAgo, locale)}
              </span>
            </div>
          </div>

          <KakaoMap
            center={{ lat: displayLot.lat, lng: displayLot.lng }}
            level={4}
            height={140}
            markers={[
              {
                id: displayLot.id,
                lat: displayLot.lat,
                lng: displayLot.lng,
                color: statusColor(displayLot.realtimeSupported, displayLot.congestion),
                label: localizedName,
                selected: true,
              },
            ]}
          />

          {displayLot.realtimeSupported && (
            <div style={styles.spotsBox}>
              <span style={styles.spotsNum}>{displayLot.availableSpots}</span>
              <span style={styles.spotsTotal}>
                / {displayLot.totalSpots}
                {t.spotsAvailableSuffix}
              </span>
            </div>
          )}

          <div style={styles.feeBox} translate="no" className="notranslate">
            <p style={styles.feeBoxTitle}>{t.feeSectionTitle}</p>
            <div style={styles.feeBoxRow}>
              <span style={styles.feeBoxLabel}>{t.feeBaseLabel}</span>
              <span style={styles.feeBoxValue}>{formatBaseFee(displayLot.fee, locale)}</span>
            </div>
            <div style={styles.feeBoxRow}>
              <span style={styles.feeBoxLabel}>{t.feeAddLabel}</span>
              <span style={styles.feeBoxValue}>{formatAddFee(displayLot.fee, locale)}</span>
            </div>
          </div>

          <div style={styles.infoGrid} translate="no" className="notranslate">
            <InfoRow label={t.hoursLabel} value={displayLot.hours} />
            <InfoRow
              label={t.specialZonesLabel}
              value={t.specialZones(displayLot.evSpots, displayLot.disabledSpots)}
            />
          </div>
        </div>

        <div style={styles.footer}>
          <button
            type="button"
            className="primary-cta"
            style={styles.navButton}
            onClick={() =>
              startNavigation({ name: displayLot.name, lat: displayLot.lat, lng: displayLot.lng })
            }
          >
            {t.navigateButton}
          </button>
        </div>
      </div>
    </div>
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
  backdrop: {
    position: "fixed",
    inset: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-end",
    background: "rgba(0, 0, 0, 0.5)",
    backdropFilter: "blur(3px)",
    WebkitBackdropFilter: "blur(3px)",
    transition: "opacity 0.28s ease",
    zIndex: 20,
  },
  sheet: {
    position: "relative",
    width: "100%",
    maxWidth: 460,
    maxHeight: "88vh",
    display: "flex",
    flexDirection: "column",
    background: "var(--surface)",
    borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
    boxShadow: "var(--shadow-lg)",
    transition: "transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 999,
    background: "var(--border)",
    margin: "12px auto 0",
    flexShrink: 0,
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "none",
    background: "var(--surface-alt)",
    color: "var(--text-dim)",
    fontSize: 13,
    cursor: "pointer",
    zIndex: 1,
  },
  favoriteButton: {
    position: "absolute",
    top: 12,
    right: 50,
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "none",
    background: "var(--surface-alt)",
    fontSize: 14,
    cursor: "pointer",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollArea: {
    overflowY: "auto",
    padding: "14px 20px 4px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    paddingRight: 70,
  },
  name: {
    margin: 0,
    fontFamily: "var(--font-display)",
    fontSize: 19,
    color: "var(--text)",
  },
  address: {
    margin: 0,
    fontSize: 13,
    color: "var(--text-dim)",
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  synced: {
    fontSize: 12,
    color: "var(--text-faint)",
    fontWeight: 600,
  },
  spotsBox: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  },
  spotsNum: {
    fontFamily: "var(--font-display)",
    fontSize: 34,
    color: "var(--accent-strong)",
    lineHeight: 1,
  },
  spotsTotal: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-dim)",
  },
  feeBox: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    background: "var(--surface-alt)",
    borderRadius: "var(--radius-md)",
    padding: "12px 14px",
  },
  feeBoxTitle: {
    margin: "0 0 2px",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-faint)",
  },
  feeBoxRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 13.5,
  },
  feeBoxLabel: {
    color: "var(--text-dim)",
    fontWeight: 600,
  },
  feeBoxValue: {
    color: "var(--text)",
    fontWeight: 700,
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
  footer: {
    flexShrink: 0,
    padding: "14px 20px calc(18px + env(safe-area-inset-bottom, 0px))",
    boxShadow: "0 -8px 20px rgba(0, 0, 0, 0.06)",
    background: "var(--surface)",
    zIndex: 1,
  },
  navButton: {
    width: "100%",
    padding: "16px 16px",
    borderRadius: "var(--radius-md)",
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    fontWeight: 800,
    fontSize: 16,
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(var(--accent-rgb), 0.4)",
  },
};
