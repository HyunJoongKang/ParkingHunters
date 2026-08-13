import type { CSSProperties } from "react";
import type { ParkingLot } from "../lib/types";
import StatusChip from "./StatusChip";
import { formatBaseFee, formatDistance, formatSyncedAgo, getLocalizedParkingName } from "../lib/format";
import { useSettings } from "../lib/settings";

interface ParkingCardProps {
  lot: ParkingLot;
  onSelect: (id: string) => void;
}

export default function ParkingCard({ lot, onSelect }: ParkingCardProps) {
  const { locale, t } = useSettings();
  return (
    <button type="button" style={styles.card} onClick={() => onSelect(lot.id)}>
      <div style={styles.topRow}>
        <div style={styles.nameCol}>
          <span style={styles.name} translate="no" className="notranslate">
            {getLocalizedParkingName(lot.name, locale)}
          </span>
          <span style={styles.distance}>{formatDistance(lot.distanceM)}</span>
        </div>
        <StatusChip realtimeSupported={lot.realtimeSupported} congestion={lot.congestion} />
      </div>

      <div style={styles.midRow}>
        {lot.realtimeSupported ? (
          <span style={styles.spots}>
            <b style={styles.spotsNum}>{lot.availableSpots}</b>
            <span style={styles.spotsTotal}> / {lot.totalSpots}{t.spotsUnit}</span>
          </span>
        ) : (
          <span style={styles.spotsMuted}>{t.basicInfoOnly}</span>
        )}
        <span style={styles.dot}>·</span>
        <span style={styles.synced}>{formatSyncedAgo(lot.lastSyncedMinutesAgo, locale)}</span>
      </div>

      <div style={styles.feeRow} translate="no" className="notranslate">
        {t.feeBasePrefix} {formatBaseFee(lot.fee, locale)}
      </div>
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: "100%",
    textAlign: "left",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    padding: "14px 16px",
    cursor: "pointer",
    animation: "fade-in-up 0.25s ease both",
  },
  topRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
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
  midRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    fontSize: 12.5,
    color: "var(--text-dim)",
  },
  spots: {
    fontVariantNumeric: "tabular-nums",
  },
  spotsNum: {
    fontFamily: "var(--font-display)",
    fontSize: 17,
    color: "var(--accent-strong)",
  },
  spotsTotal: {
    fontWeight: 600,
  },
  spotsMuted: {
    fontWeight: 600,
    color: "var(--text-faint)",
  },
  dot: {
    color: "var(--text-faint)",
  },
  synced: {
    color: "var(--text-faint)",
  },
  feeRow: {
    fontSize: 12.5,
    color: "var(--text-dim)",
    paddingTop: 6,
    borderTop: "1px dashed var(--border)",
  },
};
