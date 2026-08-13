import type { CSSProperties } from "react";
import { CONGESTION_COLOR, CONGESTION_LABEL, UNKNOWN_COLOR } from "../lib/format";
import type { Congestion } from "../lib/types";

const ORDER: Congestion[] = ["available", "moderate", "busy", "full"];

export default function MapLegend() {
  return (
    <div style={styles.row}>
      {ORDER.map((c) => (
        <span key={c} style={styles.item}>
          <span style={{ ...styles.dot, background: CONGESTION_COLOR[c] }} />
          {CONGESTION_LABEL[c]}
        </span>
      ))}
      <span style={styles.item}>
        <span style={{ ...styles.dot, background: UNKNOWN_COLOR }} />
        정보없음
      </span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  row: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px 14px",
    padding: "10px 2px 2px",
  },
  item: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11.5,
    color: "var(--text-dim)",
    fontWeight: 600,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
};
