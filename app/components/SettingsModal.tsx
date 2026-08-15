"use client";

import type { CSSProperties } from "react";
import { useSettings } from "../lib/settings";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { locale, theme, radiusM, setLocale, setTheme, setRadiusM, t } = useSettings();

  return (
    <div
      style={{ ...styles.backdrop, opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
      onClick={onClose}
      aria-hidden={!open}
    >
      <div
        style={{
          ...styles.modal,
          transform: open ? "scale(1)" : "scale(0.94)",
          opacity: open ? 1 : 0,
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t.settingsTitle}
      >
        <div style={styles.headerRow}>
          <h2 style={styles.title}>{t.settingsTitle}</h2>
          <button type="button" style={styles.closeButton} onClick={onClose} aria-label={t.closeAria}>
            ✕
          </button>
        </div>

        <div style={styles.section}>
          <p style={styles.sectionLabel}>{t.languageLabel}</p>
          <div style={styles.segmented}>
            <SegmentButton active={locale === "ko"} onClick={() => setLocale("ko")} label={t.langKorean} />
            <SegmentButton active={locale === "en"} onClick={() => setLocale("en")} label={t.langEnglish} />
          </div>
        </div>

        <div style={styles.section}>
          <p style={styles.sectionLabel}>{t.themeLabel}</p>
          <div style={styles.segmented}>
            <SegmentButton
              active={theme === "light"}
              onClick={() => setTheme("light")}
              label={`☀️ ${t.themeLight}`}
            />
            <SegmentButton
              active={theme === "dark"}
              onClick={() => setTheme("dark")}
              label={`🌙 ${t.themeDark}`}
            />
          </div>
        </div>

        <div style={styles.section}>
          <p style={styles.sectionLabel}>{t.searchRadiusLabel}</p>
          <div style={styles.segmented}>
            <SegmentButton
              active={radiusM === 500}
              onClick={() => setRadiusM(500)}
              label={t.radius500Label}
            />
            <SegmentButton
              active={radiusM === 1000}
              onClick={() => setRadiusM(1000)}
              label={t.radius1kmLabel}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...styles.segmentButton, ...(active ? styles.segmentButtonActive : null) }}
    >
      {label}
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.5)",
    transition: "opacity 0.22s ease",
    zIndex: 30,
    padding: 20,
  },
  modal: {
    width: "100%",
    maxWidth: 340,
    background: "var(--surface)",
    borderRadius: "var(--radius-lg)",
    padding: "20px 20px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 18,
    boxShadow: "0 20px 44px rgba(0, 0, 0, 0.24)",
    transition: "transform 0.22s ease, opacity 0.22s ease",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    margin: 0,
    fontFamily: "var(--font-display)",
    fontSize: 18,
    color: "var(--text)",
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "none",
    background: "var(--surface-alt)",
    color: "var(--text-dim)",
    fontSize: 13,
    cursor: "pointer",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  sectionLabel: {
    margin: 0,
    fontSize: 12.5,
    fontWeight: 700,
    color: "var(--text-faint)",
  },
  segmented: {
    display: "flex",
    gap: 8,
    background: "var(--surface-alt)",
    borderRadius: "var(--radius-md)",
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    padding: "9px 10px",
    borderRadius: "var(--radius-sm)",
    border: "none",
    background: "transparent",
    color: "var(--text-dim)",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    transition: "background 0.15s ease, color 0.15s ease",
  },
  segmentButtonActive: {
    background: "var(--accent)",
    color: "#fff",
  },
};
