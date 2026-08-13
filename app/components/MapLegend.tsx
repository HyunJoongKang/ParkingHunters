import type { CSSProperties } from "react";
import { CONGESTION_COLOR, congestionLabel, UNKNOWN_COLOR } from "../lib/format";
import { useSettings } from "../lib/settings";
import type { Congestion } from "../lib/types";

const ORDER: Congestion[] = ["available", "moderate", "busy", "full"];

export default function MapLegend() {
  const { locale, t } = useSettings();
  return (
    <div style={styles.row} translate="no" className="notranslate">
      {ORDER.map((c) => (
        <span key={c} style={styles.item}>
          <span style={{ ...styles.dot, background: CONGESTION_COLOR[c] }} />
          {congestionLabel(c, locale)}
        </span>
      ))}
      <span style={styles.item}>
        <span style={{ ...styles.dot, background: UNKNOWN_COLOR }} />
        {t.statusUnknown}
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
