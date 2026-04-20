/**
 * Phase 0: Seed Script
 * Reads all Excel files and imports data into Supabase Postgres.
 * Run once on first deployment.
 */

import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { decimalHoursToMins, calcEfficiency, calcProduction, calcTrueProduction } from "../formulas/production";
import { C } from "../constants";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

const EXCEL_DIR = path.join(process.cwd(), ".."); // parent dir has the .xlsx files

// Helper: parse date "DD-MM-YY" → "YYYY-MM-DD"
function parseExcelDate(val: unknown): string {
  if (!val) return "";
  if (typeof val === "number") {
    // Excel date serial number
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().split("T")[0];
  }
  const s = String(val).trim(); // e.g. "09-04-26"
  const parts = s.split("-");
  if (parts.length === 3) {
    const [d, m, y] = parts.map(Number);
    const fullYear = 2000 + y;
    return `${fullYear}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return s;
}

async function seedQualityMaster() {
  const wb = XLSX.readFile(path.join(EXCEL_DIR, "Quality Data.xlsx"));
  const ws = wb.Sheets["LOOMS"];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  const records = raw
    .filter((r) => r["Quality"] && String(r["Quality"]).trim() !== "")
    .map((r) => ({
      name: String(r["Quality"]).trim(),
      ppi: Number(r["Quality Pick"]) || 0,
      warpPagar: Number(r["Warp Pagar"]) || 0,
      pasarPagar: Number(r["Pasar Pagar"]) || 0,
      mendingPagar: Number(r["Mending Pagar"]) || 0,
      tfoPagarMonthly: Number(r["TFO PAGAR"]) || 0,
    }));

  for (const rec of records) {
    await sql`
      INSERT INTO quality_master (name, ppi, warp_pagar, pasar_pagar, mending_pagar, tfo_pagar_monthly)
      VALUES (${rec.name}, ${rec.ppi}, ${rec.warpPagar}, ${rec.pasarPagar}, ${rec.mendingPagar}, ${rec.tfoPagarMonthly})
      ON CONFLICT (name) DO UPDATE SET
        ppi = EXCLUDED.ppi,
        warp_pagar = EXCLUDED.warp_pagar,
        pasar_pagar = EXCLUDED.pasar_pagar,
        mending_pagar = EXCLUDED.mending_pagar,
        tfo_pagar_monthly = EXCLUDED.tfo_pagar_monthly
    `;
  }
  console.log(`✓ Quality Master: ${records.length} records`);
}

async function seedMachineMaster() {
  const wb = XLSX.readFile(path.join(EXCEL_DIR, "Machine Data.xlsx"));
  const ws = wb.Sheets["WJ"];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  const records = raw
    .filter((r) => r["Machine Number"] != null)
    .map((r) => ({
      machineNo: Number(r["Machine Number"]),
      trueRpm: Number(r["True RPM"]) || 547,
    }));

  for (const rec of records) {
    if (!rec.machineNo) return;
    await sql`
      INSERT INTO machine_master (machine_no, true_rpm)
      VALUES (${rec.machineNo}, ${rec.trueRpm})
      ON CONFLICT (machine_no) DO UPDATE SET true_rpm = EXCLUDED.true_rpm
    `;
  }
  console.log(`✓ Machine Master: ${records.length} records`);
}

async function seedShiftLog() {
  const wb = XLSX.readFile(path.join(EXCEL_DIR, "WjEff.xlsx"));
  const sheetNames = wb.SheetNames;

  // Build quality name → id lookup
  const qualRows = await sql`SELECT id, name FROM quality_master`;
  const qualityLookup: Record<string, number> = {};
  (qualRows as { id: number; name: string }[]).forEach((r) => {
    qualityLookup[r.name.trim()] = r.id;
  });

  // Build machine no → true rpm lookup
  const machRows = await sql`SELECT machine_no, true_rpm FROM machine_master`;
  const machineLookup: Record<number, number> = {};
  (machRows as { machine_no: number; true_rpm: number }[]).forEach((r) => {
    machineLookup[r.machine_no] = r.true_rpm;
  });

  let totalRows = 0;

  for (const sheetName of sheetNames) {
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
    });

    // Row 0 = header, skip. Data starts at row 1
    // Cols: 0=Machine No, 1=Quality, 2=Power Time, 3=Run Time, 4=Stops, 5=RPM (Day)
    //        6=Quality.1, 7=Power.1, 8=Run.1, 9=Stops.1, 10=RPM.1 (Night)

    for (let i = 1; i < raw.length; i++) {
      const row = raw[i] as (unknown | null)[];
      if (!row || row.length < 11) continue;

      const machineNo = Number(row[0]);
      if (!machineNo || machineNo < 1 || machineNo > 28) continue;

      const qualityName = String(row[1] || "").trim();
      const qualityId = qualityLookup[qualityName];
      if (!qualityId) continue;

      const trueRpm = machineLookup[machineNo] || 547;
      const ppi = 0; // will look up from quality id

      const insertRecord = async (
        shift: string,
        qualityCell: unknown,
        powerTime: unknown,
        runTime: unknown,
        stops: unknown,
        rpm: unknown
      ) => {
        if (!runTime && !powerTime) return;
        const q = String(qualityCell || qualityName).trim();
        const qId = qualityLookup[q];
        if (!qId) return;

        const ppiRows = await sql`SELECT ppi FROM quality_master WHERE id = ${qId}` as { ppi: number }[];
        const ppiVal = ppiRows[0]?.ppi ?? 80;

        const rt = Number(runTime) || 0;
        const pt = Number(powerTime) || 0;
        if (rt === 0) return;

        const shiftLimit = shift === "NIGHT" ? 780 : 660;
        const runMins = Math.round(rt * 60);
        const actualEfficiency = Math.round((runMins / shiftLimit) * 10000) / 10000;
        const productionMeters = (C * (Number(rpm) || 0) * runMins) / shiftLimit / ppiVal;
        const trueProductionMeters = (C * trueRpm * runMins) / shiftLimit / ppiVal;
        const dateStr = parseExcelDate(sheetName);

        if (!dateStr) return;

        await sql`
          INSERT INTO shift_log (date, shift, machine_no, quality_id, power_time, run_time, stops, run_rpm, run_mins, actual_efficiency, production_meters, true_production_meters)
          VALUES (
            ${dateStr}, ${shift}, ${machineNo}, ${qId},
            ${pt}, ${rt}, ${Number(stops) || 0}, ${Number(rpm) || 0},
            ${runMins}, ${actualEfficiency}, ${productionMeters}, ${trueProductionMeters}
          )
        `;
        totalRows++;
      };

      // Day shift
      await insertRecord("DAY", row[1], row[2], row[3], row[4], row[5]);
      // Night shift
      await insertRecord("NIGHT", row[6], row[7], row[8], row[9], row[10]);
    }
  }

  console.log(`✓ Shift Log: ${totalRows} records`);
}

async function seedBeam() {
  const wb = XLSX.readFile(path.join(EXCEL_DIR, "BEAM BOOK.xlsx"));
  const ws = wb.Sheets["Sheet1"];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  const qualRowsBm = await sql`SELECT id, name FROM quality_master`;
  const qualityLookup: Record<string, number> = {};
  (qualRowsBm as { id: number; name: string }[]).forEach((r) => {
    qualityLookup[r.name.trim()] = r.id;
  });

  let count = 0;
  for (const r of raw) {
    const beamNo = String(r["Beam No"] || "").trim();
    if (!beamNo) continue;

    const qualName = String(r["Quality"] || "").trim();
    const qualityId = qualityLookup[qualName];
    if (!qualityId) continue;

    const loadingDate = parseExcelDate(r["Loading Date"]);
    const bhidanDate = parseExcelDate(r["Bhidan Date"]);

    let status = "IN_STOCK";
    if (bhidanDate) status = "COMPLETED";
    else if (loadingDate) status = "ACTIVE";

    const dateCreated = parseExcelDate(r["Date"]) || new Date().toISOString().split("T")[0];

    await sql`
      INSERT INTO beam (beam_no, quality_id, warp_meter, date_created, status, loading_date, loading_shift, machine_no, bhidan_date, bhidan_shift)
      VALUES (
        ${beamNo}, ${qualityId}, ${Number(r["Warp Meter"]) || 0},
        ${dateCreated}, ${status},
        ${loadingDate || null}, ${String(r["Loading Shift"] || "").trim() || null},
        ${Number(r["Machine Number"]) || null},
        ${bhidanDate || null}, ${String(r["Bhidan Shift"] || "").trim() || null}
      )
      ON CONFLICT (beam_no) DO UPDATE SET
        quality_id = EXCLUDED.quality_id,
        warp_meter = EXCLUDED.warp_meter,
        status = EXCLUDED.status,
        loading_date = EXCLUDED.loading_date,
        bhidan_date = EXCLUDED.bhidan_date
    `;
    count++;
  }
  console.log(`✓ Beam: ${count} records`);
}

async function seedYarnPurchase() {
  const wb = XLSX.readFile(path.join(EXCEL_DIR, "YarnBook-TEX WEAVES.xlsx"));

  // 25-26 sheet has headers at row 4 (0-indexed)
  const ws = wb.Sheets["25-26"];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
  });

  let count = 0;
  for (let i = 4; i < raw.length; i++) {
    const row = raw[i] as (unknown | null)[];
    if (!row || row.length < 8) continue;
    const date = parseExcelDate(row[3]); // BILL DATE column
    if (!date) continue;

    await sql`
      INSERT INTO yarn_purchase (date, dealer, filament_denier, quantity_kg, rate, amount)
      VALUES (
        ${date}, ${String(row[5] || "").trim()},
        ${String(row[7] || "").trim()}, ${Number(row[8]) || null},
        ${Number(row[9]) || null}, ${Number(row[10]) || null}
      )
    `;
    count++;
  }
  console.log(`✓ Yarn Purchase: ${count} records`);

  // Jobwork receipts from 25-26 JW sheet
  const wsJw = wb.Sheets["25-26 JW"];
  const rawJw = XLSX.utils.sheet_to_json<unknown[]>(wsJw, {
    header: 1,
    defval: null,
  });

  const qualRowsBm = await sql`SELECT id, name FROM quality_master`;
  const qualityLookup: Record<string, number> = {};
  (qualRowsBm as { id: number; name: string }[]).forEach((r) => {
    qualityLookup[r.name.trim()] = r.id;
  });

  // Check if jobwork parties exist, create default if needed
  await sql`INSERT INTO jobwork_party (name) VALUES ('Default Party') ON CONFLICT DO NOTHING`;

  const partyRows = await sql`SELECT id, name FROM jobwork_party`;
  const partyLookup: Record<string, number> = {};
  (partyRows as { id: number; name: string }[]).forEach((r) => {
    partyLookup[r.name.trim()] = r.id;
  });

  count = 0;
  for (let i = 1; i < rawJw.length; i++) {
    const row = rawJw[i] as (unknown | null)[];
    if (!row || row.length < 5) continue;
    const billDate = parseExcelDate(row[1]);
    if (!billDate) continue;

    const partyName = String(row[0] || "Default Party").trim();
    const qualName = String(row[3] || "").trim();
    const qualityId = qualityLookup[qualName];
    const partyId = partyLookup[partyName] || partyLookup["Default Party"];

    if (!qualityId || !partyId) continue;

    await sql`
      INSERT INTO jobwork_receipt (party_id, quality_id, bill_date, meters)
      VALUES (${partyId}, ${qualityId}, ${billDate}, ${Number(row[4]) || 0})
    `;
    count++;
  }
  console.log(`✓ Jobwork Receipt: ${count} records`);
}

async function seedSettings() {
  const defaultSettings: [string, string][] = [
    ["target_efficiency", "85"],
    ["day_shift_mins", "660"],
    ["night_shift_mins", "780"],
    ["c_constant", "36.56"],
    ["bhidan_threshold_pct", "10"],
    ["bhidan_alert_meters", "1000"],
    ["low_efficiency_alert", "85"],
    ["high_stops_alert", "30"],
    ["looms_salary_monthly", "450000"],
    ["milgin_exp_monthly", "150000"],
    ["emi_monthly", "1000000"],
    ["production_wastage", "0.98"],
    ["app_password", "texweaves2026"],
  ];

  for (const [key, value] of defaultSettings) {
    await sql`
      INSERT INTO settings (key, value) VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  }
  console.log("✓ Settings seeded");
}

async function main() {
  console.log("\n🚀 Starting Tex Weaves data seed...\n");

  try {
    await seedSettings();
    await seedQualityMaster();
    await seedMachineMaster();
    await seedShiftLog();
    await seedBeam();
    await seedYarnPurchase();

    console.log("\n✅ All data seeded successfully!\n");
  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  }
}

main();