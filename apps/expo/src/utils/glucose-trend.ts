const ARROWS: Record<string, string> = {
  DoubleUp:      "⇈",
  SingleUp:      "↑",
  FortyFiveUp:   "↗",
  Flat:          "→",
  FortyFiveDown: "↘",
  SingleDown:    "↓",
  DoubleDown:    "⇊",
};

const LABELS: Record<string, string> = {
  DoubleUp:      "Rising fast",
  SingleUp:      "Rising",
  FortyFiveUp:   "Rising slowly",
  Flat:          "Steady",
  FortyFiveDown: "Falling slowly",
  SingleDown:    "Falling",
  DoubleDown:    "Falling fast",
  None:          "Unknown",
  NotComputable: "Unknown",
  RateOutOfRange: "Unknown",
};

export function trendArrow(code: string | null | undefined): string {
  if (!code) return "—";
  return ARROWS[code] ?? "—";
}

export function trendLabel(code: string | null | undefined): string {
  if (!code) return "Unknown";
  return LABELS[code] ?? "Unknown";
}
