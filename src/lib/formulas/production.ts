import { SHIFT_LIMIT } from "@/lib/constants";

/**
 * Convert decimal hours (e.g. 10.36) to total minutes
 * Handles formats like: 10.36 (means 10 hours 36 mins),
 * "10:36", "10;36", or raw integers treated as hours
 */
export function decimalHoursToMins(val: number | string): number {
  if (val === null || val === undefined || val === "") return 0;

  const s = String(val).trim();

  // Handle HH:MM or HH;MM separator
  for (const sep of [":", ";"]) {
    if (s.includes(sep)) {
      const [h, m] = s.split(sep);
      return (parseFloat(h) || 0) * 60 + (parseFloat(m) || 0);
    }
  }

  // Handle decimal point — "10.36" means 10 hours + 36 minutes (not .36 of hour)
  if (s.includes(".")) {
    const parts = s.split(".");
    const hours = parseFloat(parts[0]) || 0;
    const minPart = parts[1];
    if (minPart.length === 1) {
      // "10.6" → 10 hours + 60 minutes (user typed 10.60)
      return hours * 60 + parseInt(minPart) * 10;
    } else {
      // "10.36" → 10 hours + 36 minutes
      return hours * 60 + parseInt(minPart.slice(0, 2));
    }
  }

  // Naked number → treat as hours
  const num = parseFloat(s);
  return isNaN(num) ? 0 : Math.round(num * 60);
}

/**
 * Calculate efficiency as a ratio (0–1)
 */
export function calcEfficiency(runMins: number, shift: string): number {
  const limit = SHIFT_LIMIT(shift);
  return Math.round((runMins / limit) * 10000) / 10000;
}

/**
 * Calculate production meters for a single machine record
 */
export function calcProduction(
  runMins: number,
  runRpm: number,
  ppi: number,
  shift: string
): number {
  const limit = SHIFT_LIMIT(shift);
  if (ppi === 0) return 0;
  return (C * runRpm * runMins) / limit / ppi;
}

/**
 * Calculate true production meters (using machine's True RPM)
 */
export function calcTrueProduction(
  runMins: number,
  trueRpm: number,
  ppi: number,
  shift: string
): number {
  const limit = SHIFT_LIMIT(shift);
  if (ppi === 0) return 0;
  return (C * trueRpm * runMins) / limit / ppi;
}

const C = 36.56;

/**
 * Process a raw shift record into computed fields
 */
export function processShiftRecord(raw: {
  runTime: number;
  runRpm: number;
  ppi: number;
  trueRpm: number;
  shift: string;
}) {
  const runMins = decimalHoursToMins(raw.runTime);
  const efficiency = calcEfficiency(runMins, raw.shift);
  const production = calcProduction(runMins, raw.runRpm, raw.ppi, raw.shift);
  const trueProd = calcTrueProduction(runMins, raw.trueRpm, raw.ppi, raw.shift);

  return { runMins, efficiency, production, trueProd };
}

/**
 * Calculate days to bhidan for an active beam
 * avgDailyProd = average production per day for this quality on this machine (last 5 days)
 */
export function calcDaysToBhidan(
  pendingMeters: number,
  avgDailyProd: number
): number {
  if (avgDailyProd <= 0) return 999;
  return Math.round(pendingMeters / avgDailyProd);
}

/**
 * Calculate adjusted production (normalized to 24h, divided by 28 machines)
 * wastage = 0.98 means 2% wastage factor
 */
export function calcAdjustedProduction(
  dayProd: number,
  nightProd: number,
  nom: number,
  shiftCount: number,
  wastage = 0.98
): number {
  const dayAdj = (dayProd / 660) * 1440; // normalize day to 24h
  const nightAdj = (nightProd / 780) * 1440; // normalize night to 24h
  if (nom === 0 || shiftCount === 0) return 0;
  return ((dayAdj + nightAdj) * wastage) / shiftCount / 28;
}

/**
 * Normalize a monthly fixed cost over adjusted production
 */
export function normalizeFixedCost(monthlyCost: number, adjustedProd: number): number {
  if (adjustedProd === 0) return 0;
  return Math.round((monthlyCost / adjustedProd) * 100) / 100;
}