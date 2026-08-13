import type { CSSProperties } from "react";
import { useSettings } from "../lib/settings";
import type { Congestion } from "../lib/types";
import { statusColor, statusLabel } from "../lib/format";

interface StatusChipProps {
  realtimeSupported: boolean;
  congestion: Congestion;
  size?: "sm" | "md";
}

export default function StatusChip({ realtimeSupported, congestion, size = "md" }: StatusChipProps) {
  const { locale } = useSettings();
  const color = statusColor(realtimeSupported, congestion);
  const label = statusLabel(realtimeSupported, congestion, locale);
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: size === "sm" ? "3px 9px" : "5px 12px",
    borderRadius: 999,
    fontSize: size === "sm" ? 11.5 : 12.5,
    fontWeight: 700,
    color,
    background: `${color}1a`,
    border: `1px solid ${color}55`,
    whiteSpace: "nowrap",
  };
  return (
    <span style={style} translate="no" className="notranslate">
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}
