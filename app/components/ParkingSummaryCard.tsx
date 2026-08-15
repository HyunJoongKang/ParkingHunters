"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import StatusChip from "./StatusChip";
import { formatDistance, formatSyncedAgo, getLocalizedParkingName, isPrivateLot } from "../lib/format";
import { startNavigation } from "../lib/navi";
import { useSettings } from "../lib/settings";
import type { ParkingLot } from "../lib/types";

interface ParkingSummaryCardProps {
  lot: ParkingLot;
  onOpenDetail: () => void;
  onClose: () => void;
}

export default function ParkingSummaryCard({ lot, onOpenDetail, onClose }: ParkingSummaryCardProps) {
  const { locale, t } = useSettings();
  const localizedName = getLocalizedParkingName(lot.name, locale);
  const isPrivate = isPrivateLot(lot.name);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpenDetail();
    }
  }

  return (
    <div style={styles.wrap}>
      <div
        className="app-card"
        style={styles.card}
        role="button"
        tabIndex={0}
        onClick={onOpenDetail}
        onKeyDown={handleKeyDown}
      >
        <button
          type="button"
          style={styles.closeButton}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label={t.closeAria}
        >
          ✕
        </button>

        <div style={styles.infoCol}>
          <div style={styles.nameRow} translate="no" className="notranslate">
            <span style={styles.name}>{localizedName}</span>
            <span
              style={{
                ...styles.typeBadge,
                ...(isPrivate ? styles.typeBadgeNeutral : styles.typeBadgeAccent),
              }}
            >
              {isPrivate ? t.badgePrivate : t.badgePublic}
            </span>
          </div>

          <div style={styles.statsRow}>
            {lot.realtimeSupported && lot.availableSpots != null ? (
              <>
                <span style={styles.bigNum}>{lot.availableSpots}</span>
                <span style={styles.bigNumUnit}>
                  /{lot.totalSpots}
                  {t.spotsUnit}
                </span>
              </>
            ) : (
              <StatusChip realtimeSupported={lot.realtimeSupported} congestion={lot.congestion} />
            )}
          </div>

          <span style={styles.caption} translate="no" className="notranslate">
            {formatDistance(lot.distanceM)} · {formatSyncedAgo(lot.lastSyncedMinutesAgo, locale)}
          </span>
        </div>

        <button
          type="button"
          className="primary-cta"
          style={styles.naviButton}
          onClick={(e) => {
            e.stopPropagation();
            startNavigation({ name: lot.name, lat: lot.lat, lng: lot.lng });
          }}
          aria-label={t.navigateButton}
        >
          <span aria-hidden="true" style={styles.naviIcon}>
            🧭
          </span>
          <span style={styles.naviLabel}>{t.navigateButtonShort}</span>
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 18,
    zIndex: 7,
  },
  card: {
    position: "relative",
    display: "flex",
    alignItems: "stretch",
    gap: 12,
    background: "var(--surface)",
    borderRadius: "var(--radius-xl)",
    boxShadow: "var(--shadow-lg)",
    padding: "16px 14px 16px 18px",
    cursor: "pointer",
    animation: "fade-in-up 0.25s ease both",
  },
  closeButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: "50%",
    border: "none",
    background: "var(--surface-alt)",
    color: "var(--text-dim)",
    fontSize: 11,
    cursor: "pointer",
    zIndex: 1,
  },
  infoCol: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingRight: 18,
  },
  nameRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    paddingRight: 20,
  },
  name: {
    fontSize: 16,
    fontWeight: 800,
    color: "var(--text)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  typeBadge: {
    flexShrink: 0,
    padding: "3px 8px",
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  typeBadgeAccent: {
    color: "var(--accent-strong)",
    background: "var(--accent-soft)",
    border: "1px solid var(--accent-line)",
  },
  typeBadgeNeutral: {
    color: "var(--text-dim)",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
  },
  statsRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 4,
  },
  bigNum: {
    fontFamily: "var(--font-display)",
    fontSize: 32,
    lineHeight: 1,
    color: "var(--accent-strong)",
  },
  bigNumUnit: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-dim)",
  },
  caption: {
    fontSize: 11.5,
    color: "var(--text-faint)",
    fontWeight: 600,
  },
  naviButton: {
    flexShrink: 0,
    width: 76,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    border: "none",
    borderRadius: "var(--radius-md)",
    background: "var(--accent)",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 10px 22px rgba(var(--accent-rgb), 0.4)",
  },
  naviIcon: {
    fontSize: 22,
    lineHeight: 1,
  },
  naviLabel: {
    fontSize: 11.5,
    fontWeight: 800,
  },
};
