import { useState, type CSSProperties, type KeyboardEvent } from "react";
import type { ParkingLot } from "../lib/types";
import StatusChip from "./StatusChip";
import {
  formatBaseFee,
  formatDistance,
  formatSyncedAgo,
  getLocalizedParkingName,
  isPrivateLot,
  statusColor,
} from "../lib/format";
import { useFavorites } from "../lib/favorites";
import { useSettings } from "../lib/settings";

interface ParkingCardProps {
  lot: ParkingLot;
  onSelect: (id: string) => void;
}

export default function ParkingCard({ lot, onSelect }: ParkingCardProps) {
  const { locale, t } = useSettings();
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorite = isFavorite(lot.id);
  const [justToggled, setJustToggled] = useState(false);

  const isFree = lot.fee.baseFee === 0;
  const isPrivate = isPrivateLot(lot.name);
  const spotsColor = statusColor(lot.realtimeSupported, lot.congestion);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(lot.id);
    }
  }

  return (
    <div
      className="app-card"
      style={styles.card}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(lot.id)}
      onKeyDown={handleKeyDown}
    >
      <div style={styles.topRow}>
        <div style={styles.nameCol}>
          <span style={styles.name} translate="no" className="notranslate">
            {getLocalizedParkingName(lot.name, locale)}
          </span>
          <span style={styles.distance}>{formatDistance(lot.distanceM)}</span>
        </div>
        <div style={styles.topRowRight}>
          <StatusChip realtimeSupported={lot.realtimeSupported} congestion={lot.congestion} />
          <button
            type="button"
            style={{
              ...styles.favoriteButton,
              animation: justToggled ? "heart-pop 0.35s ease" : undefined,
            }}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(lot.id);
              setJustToggled(true);
            }}
            onAnimationEnd={() => setJustToggled(false)}
            aria-label={favorite ? t.favoriteRemoveAria : t.favoriteAddAria}
            aria-pressed={favorite}
          >
            {favorite ? "❤️" : "🤍"}
          </button>
        </div>
      </div>

      <div style={styles.badgeRow} translate="no" className="notranslate">
        <span
          style={{
            ...styles.badge,
            ...(isPrivate ? styles.badgeNeutral : styles.badgeAccent),
          }}
        >
          {isPrivate ? t.badgePrivate : t.badgePublic}
        </span>
        <span
          style={{
            ...styles.badge,
            ...(isFree ? styles.badgeFree : styles.badgeNeutral),
          }}
        >
          {isFree ? t.badgeFree : t.badgePaid}
        </span>
        {lot.realtimeSupported ? (
          <span
            style={{
              ...styles.badge,
              color: spotsColor,
              background: `${spotsColor}1a`,
              border: `1px solid ${spotsColor}55`,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            🅿️ {lot.availableSpots}/{lot.totalSpots}
            {t.spotsUnit}
          </span>
        ) : (
          <span style={{ ...styles.badge, ...styles.badgeMuted }}>{t.basicInfoOnly}</span>
        )}
        <span style={styles.syncedCaption}>{formatSyncedAgo(lot.lastSyncedMinutesAgo, locale)}</span>
      </div>

      <div style={styles.feeRow} translate="no" className="notranslate">
        {t.feeBasePrefix} {formatBaseFee(lot.fee, locale)}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    width: "100%",
    textAlign: "left",
    background: "var(--surface)",
    border: "1px solid var(--border-soft)",
    borderRadius: "var(--radius-xl)",
    padding: "16px 18px",
    cursor: "pointer",
    boxShadow: "var(--shadow-md)",
    animation: "fade-in-up 0.25s ease both",
  },
  topRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  topRowRight: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  favoriteButton: {
    width: 26,
    height: 26,
    flexShrink: 0,
    border: "none",
    background: "transparent",
    fontSize: 15,
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  nameCol: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  distance: {
    fontSize: 12,
    color: "var(--text-faint)",
    fontWeight: 600,
  },
  badgeRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    padding: "4px 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  badgeAccent: {
    color: "var(--accent-strong)",
    background: "var(--accent-soft)",
    border: "1px solid var(--accent-line)",
  },
  badgeFree: {
    color: "#1fa971",
    background: "rgba(31, 169, 113, 0.12)",
    border: "1px solid rgba(31, 169, 113, 0.35)",
  },
  badgeNeutral: {
    color: "var(--text-dim)",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
  },
  badgeMuted: {
    color: "var(--text-faint)",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
  },
  syncedCaption: {
    fontSize: 11,
    color: "var(--text-faint)",
    fontWeight: 600,
    marginLeft: "auto",
  },
  feeRow: {
    fontSize: 12.5,
    color: "var(--text-dim)",
    paddingTop: 8,
    borderTop: "1px dashed var(--border)",
  },
};
