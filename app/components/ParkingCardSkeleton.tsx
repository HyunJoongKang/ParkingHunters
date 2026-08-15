import type { CSSProperties } from "react";

export default function ParkingCardSkeleton() {
  return (
    <div style={styles.card} aria-hidden="true">
      <div style={styles.topRow}>
        <div style={styles.nameCol}>
          <span className="skeleton" style={styles.namePlaceholder} />
          <span className="skeleton" style={styles.distancePlaceholder} />
        </div>
        <span className="skeleton" style={styles.chipPlaceholder} />
      </div>
      <div style={styles.badgeRow}>
        <span className="skeleton" style={styles.badgePlaceholder} />
        <span className="skeleton" style={styles.badgePlaceholder} />
        <span className="skeleton" style={{ ...styles.badgePlaceholder, width: 70 }} />
      </div>
      <span className="skeleton" style={styles.feePlaceholder} />
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    width: "100%",
    background: "var(--surface)",
    border: "1px solid var(--border-soft)",
    borderRadius: "var(--radius-xl)",
    padding: "16px 18px",
    boxShadow: "var(--shadow-md)",
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
    gap: 6,
    minWidth: 0,
    flex: 1,
  },
  namePlaceholder: {
    display: "block",
    width: "58%",
    height: 15,
    borderRadius: 6,
  },
  distancePlaceholder: {
    display: "block",
    width: 44,
    height: 11,
    borderRadius: 6,
  },
  chipPlaceholder: {
    display: "block",
    width: 56,
    height: 22,
    borderRadius: 999,
    flexShrink: 0,
  },
  badgeRow: {
    display: "flex",
    gap: 6,
  },
  badgePlaceholder: {
    display: "block",
    width: 52,
    height: 20,
    borderRadius: 999,
  },
  feePlaceholder: {
    display: "block",
    width: "40%",
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
};
