// Glucose conversion factor: g/mol of glucose / 10. Standard clinical value.
const MG_PER_MMOL = 18.018;

export type GlucoseUnit = "mg_dl" | "mmol_l";

export function toMmolL(mgDl: number): number {
  return Math.round((mgDl / MG_PER_MMOL) * 10) / 10;
}

export function toMgDl(mmolL: number): number {
  return Math.round(mmolL * MG_PER_MMOL);
}

export function formatGlucose(mgDl: number, unit: GlucoseUnit): string {
  if (unit === "mmol_l") return `${toMmolL(mgDl).toFixed(1)} mmol/L`;
  return `${mgDl} mg/dL`;
}

// Hardware safety floor — mirrors the SRF alert_rule.threshold CHECK constraint.
export const CRITICAL_LOW_FLOOR_MG_DL = 50;

export function clampCriticalLow(mgDl: number): number {
  return Math.max(mgDl, CRITICAL_LOW_FLOOR_MG_DL);
}
