// All magic numbers and constants in one place
export const SHIFT_LIMITS = {
  DAY: 660,   // 11 hours × 60 mins
  NIGHT: 780, // 13 hours × 60 mins
} as const;

export const SHIFT_LIMIT = (shift: string) =>
  shift === "NIGHT" ? SHIFT_LIMITS.NIGHT : SHIFT_LIMITS.DAY;

export const C = 36.56;

export const DEFAULT_SETTINGS: Record<string, string> = {
  target_efficiency: "85",
  day_shift_mins: "660",
  night_shift_mins: "780",
  c_constant: "36.56",
  bhidan_threshold_pct: "10",
  bhidan_alert_meters: "1000",
  low_efficiency_alert: "85",
  high_stops_alert: "30",
  looms_salary_monthly: "450000",
  milgin_exp_monthly: "150000",
  emi_monthly: "1000000",
  production_wastage: "0.98",
  app_password: "texweaves2026",
};

export const FY_START = "2025-04-01";
export const FY_END = "2026-03-31";

export const ALERT_THRESHOLDS = {
  bhidanAlertMeters: 1000,
  lowEfficiencyAlert: 85,
  highStopsAlert: 30,
} as const;