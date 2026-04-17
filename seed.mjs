/**
 * Phase 0: Seed Script
 * Run once: node seed.mjs
 * Uses Supabase REST API (avoids blocked Postgres ports)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { fileURLToPath } from "url";
import path from "path";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_DIR = path.join(__dirname, "..");
const C = 36.56;

// ─── Supabase Client ─────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseExcelDate(val) {
  if (!val) return "";
  if (typeof val === "number") {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().split("T")[0];
  }
  const s = String(val).trim();
  const parts = s.split("-");
  if (parts.length === 3) {
    const [d, m, y] = parts.map(Number);
    return `${2000 + y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return s;
}

function decimalHoursToMins(val) {
  if (val === null || val === undefined || val === "") return 0;
  const s = String(val).trim();
  if (s.includes(".")) {
    const parts = s.split(".");
    const hours = parseFloat(parts[0]) || 0;
    const minPart = parts[1];
    const minutes = minPart.length === 1
      ? parseInt(minPart) * 10
      : parseInt(minPart.slice(0, 2));
    return Math.round(hours * 60 + minutes);
  }
  return isNaN(parseFloat(s)) ? 0 : Math.round(parseFloat(s) * 60);
}

async function upsert(table, data, conflictCol) {
  const { error } = await supabase.from(table).upsert(data, {
    onConflict: conflictCol,
  });
  if (error) throw error;
}

// ─── Seed Functions ─────────────────────────────────────────────────────────

async function seedSettings() {
  const defaults = [
    { key: "target_efficiency", value: "85" },
    { key: "day_shift_mins", value: "660" },
    { key: "night_shift_mins", value: "780" },
    { key: "c_constant", value: "36.56" },
    { key: "bhidan_threshold_pct", value: "10" },
    { key: "bhidan_alert_meters", value: "1000" },
    { key: "low_efficiency_alert", value: "85" },
    { key: "high_stops_alert", value: "30" },
    { key: "looms_salary_monthly", value: "450000" },
    { key: "milgin_exp_monthly", value: "150000" },
    { key: "emi_monthly", value: "1000000" },
    { key: "production_wastage", value: "0.98" },
    { key: "app_password", value: "texweaves2026" },
  ];
  await upsert("settings", defaults, "key");
  console.log("✓ Settings seeded");
}

async function seedQualityMaster() {
  const wb = XLSX.readFile(path.join(EXCEL_DIR, "Quality Data.xlsx"));
  const ws = wb.Sheets["LOOMS"];
  const raw = XLSX.utils.sheet_to_json(ws);

  const records = raw
    .filter((r) => String(r["Quality"] || "").trim())
    .map((r) => ({
      name: String(r["Quality"] || "").trim(),
      ppi: Number(r["Quality Pick"]) || 80,
      warp_pagar: Number(r["Warp Pagar"]) || 0,
      pasar_pagar: Number(r["Pasar Pagar"]) || 0,
      mending_pagar: Number(r["Mending Pagar"]) || 0,
      tfo_pagar_monthly: Number(r["TFO PAGAR"]) || 0,
    }));

  await upsert("quality_master", records, "name");
  console.log(`✓ Quality Master: ${records.length} records`);
}

async function seedMachineMaster() {
  const wb = XLSX.readFile(path.join(EXCEL_DIR, "Machine Data.xlsx"));
  const ws = wb.Sheets["WJ"];
  const raw = XLSX.utils.sheet_to_json(ws);

  const records = raw
    .filter((r) => Number(r["Machine Number"]) >= 1 && Number(r["Machine Number"]) <= 28)
    .map((r) => ({
      machine_no: Number(r["Machine Number"]),
      true_rpm: Number(r["True RPM"]) || 547,
    }));

  await upsert("machine_master", records, "machine_no");
  console.log(`✓ Machine Master: ${records.length} records`);
}

async function seedShiftLog() {
  const wb = XLSX.readFile(path.join(EXCEL_DIR, "WjEff.xlsx"));
  const sheetNames = wb.SheetNames;

  // Build lookups
  const { data: qualRows } = await supabase.from("quality_master").select("id, name");
  const qualities = Object.fromEntries((qualRows || []).map((r) => [r.name.trim(), r.id]));

  const { data: machRows } = await supabase.from("machine_master").select("machine_no, true_rpm");
  const machines = Object.fromEntries((machRows || []).map((r) => [r.machine_no, r.true_rpm]));

  const { data: ppiRows } = await supabase.from("quality_master").select("id, ppi");
  const ppiMap = Object.fromEntries((ppiRows || []).map((r) => [r.id, r.ppi]));

  const allRecords = [];

  for (const sheetName of sheetNames) {
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      if (!row || row.length < 11) continue;

      const machineNo = Number(row[0]);
      if (!machineNo || machineNo < 1 || machineNo > 28) continue;

      const defaultQual = String(row[1] || "").trim();
      const defaultQualId = qualities[defaultQual];
      if (!defaultQualId) continue;

      const trueRpm = machines[machineNo] || 547;
      const dateStr = parseExcelDate(sheetName);
      if (!dateStr) continue;

      const insertShift = (shift, qualCell, powerTime, runTime, stops, rpm) => {
        const rt = Number(runTime) || 0;
        const pt = Number(powerTime) || 0;
        if (rt === 0) return;

        const qName = String(qualCell || defaultQual).trim();
        const qId = qualities[qName] || defaultQualId;
        if (!qId) return;

        const ppi = ppiMap[qId] || 80;
        const shiftLimit = shift === "NIGHT" ? 780 : 660;
        const runMins = decimalHoursToMins(rt);
        const actualEfficiency = Math.round((runMins / shiftLimit) * 10000) / 10000;
        const productionMeters = (C * (Number(rpm) || 0) * runMins) / shiftLimit / ppi;
        const trueProductionMeters = (C * trueRpm * runMins) / shiftLimit / ppi;

        allRecords.push({
          date: dateStr,
          shift,
          machine_no: machineNo,
          quality_id: qId,
          power_time: pt,
          run_time: rt,
          stops: Number(stops) || 0,
          run_rpm: Number(rpm) || 0,
          run_mins: runMins,
          actual_efficiency: actualEfficiency,
          production_meters: productionMeters,
          true_production_meters: trueProductionMeters,
        });
      };

      insertShift("DAY", row[1], row[2], row[3], row[4], row[5]);
      insertShift("NIGHT", row[6], row[7], row[8], row[9], row[10]);
    }
  }

  // Insert in batches of 500
  const batchSize = 500;
  for (let i = 0; i < allRecords.length; i += batchSize) {
    const batch = allRecords.slice(i, i + batchSize);
    const { error } = await supabase.from("shift_log").insert(batch);
    if (error) console.warn(`Batch ${i} error:`, error.message);
  }

  console.log(`✓ Shift Log: ${allRecords.length} records`);
}

async function seedBeam() {
  const wb = XLSX.readFile(path.join(EXCEL_DIR, "BEAM BOOK.xlsx"));
  const ws = wb.Sheets["Sheet1"];
  const raw = XLSX.utils.sheet_to_json(ws);

  const { data: qualRows } = await supabase.from("quality_master").select("id, name");
  const qualities = Object.fromEntries((qualRows || []).map((r) => [r.name.trim(), r.id]));

  const records = raw
    .filter((r) => String(r["Beam No"] || "").trim())
    .map((r) => {
      const qualName = String(r["Quality"] || "").trim();
      const qualityId = qualities[qualName];
      if (!qualityId) return null;

      const loadingDate = parseExcelDate(r["Loading Date"]);
      const bhidanDate = parseExcelDate(r["Bhidan Date"]);

      let status = "IN_STOCK";
      if (bhidanDate) status = "COMPLETED";
      else if (loadingDate) status = "ACTIVE";

      return {
        beam_no: String(r["Beam No"] || "").trim(),
        quality_id: qualityId,
        warp_meter: Number(r["Warp Meter"]) || 0,
        date_created: parseExcelDate(r["Date"]) || new Date().toISOString().split("T")[0],
        status,
        loading_date: loadingDate || null,
        loading_shift: String(r["Loading Shift"] || "").trim() || null,
        machine_no: Number(r["Machine Number"]) || null,
        bhidan_date: bhidanDate || null,
        bhidan_shift: String(r["Bhidan Shift"] || "").trim() || null,
      };
    })
    .filter(Boolean);

  await upsert("beam", records, "beam_no");
  console.log(`✓ Beam: ${records.length} records`);
}

async function seedYarnPurchase() {
  const wb = XLSX.readFile(path.join(EXCEL_DIR, "YarnBook-TEX WEAVES.xlsx"));

  // 25-26 sheet
  const ws = wb.Sheets["25-26"];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const yarnRecords = [];
  for (let i = 4; i < raw.length; i++) {
    const row = raw[i];
    if (!row || row.length < 11) continue;
    const date = parseExcelDate(row[3]);
    if (!date) continue;
    yarnRecords.push({
      date,
      dealer: String(row[5] || "").trim(),
      filament_denier: String(row[7] || "").trim(),
      quantity_kg: Number(row[8]) || null,
      rate: Number(row[9]) || null,
      amount: Number(row[10]) || null,
    });
  }

  const { error: yErr } = await supabase.from("yarn_purchase").insert(yarnRecords);
  if (yErr) console.warn("Yarn purchase insert error:", yErr.message);
  console.log(`✓ Yarn Purchase: ${yarnRecords.length} records`);

  // Jobwork receipts
  const wsJw = wb.Sheets["25-26 JW"];
  const rawJw = XLSX.utils.sheet_to_json(wsJw, { header: 1, defval: null });

  const { data: qualRows } = await supabase.from("quality_master").select("id, name");
  const qualities = Object.fromEntries((qualRows || []).map((r) => [r.name.trim(), r.id]));

  await supabase.from("jobwork_party").upsert({ name: "Default Party" }, { onConflict: "name" });
  const { data: partyRows } = await supabase.from("jobwork_party").select("id, name");
  const parties = Object.fromEntries((partyRows || []).map((r) => [r.name.trim(), r.id]));
  const defaultPartyId = parties["Default Party"];

  const jwRecords = [];
  for (let i = 1; i < rawJw.length; i++) {
    const row = rawJw[i];
    if (!row || row.length < 5) continue;
    const billDate = parseExcelDate(row[1]);
    if (!billDate) continue;

    const qualName = String(row[3] || "").trim();
    const qualityId = qualities[qualName];
    const partyName = String(row[0] || "Default Party").trim();
    const partyId = parties[partyName] || defaultPartyId;

    if (!qualityId || !partyId) continue;
    jwRecords.push({ party_id: partyId, quality_id: qualityId, bill_date: billDate, meters: Number(row[4]) || 0 });
  }

  const { error: jwErr } = await supabase.from("jobwork_receipt").insert(jwRecords);
  if (jwErr) console.warn("Jobwork receipt insert error:", jwErr.message);
  console.log(`✓ Jobwork Receipt: ${jwRecords.length} records`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🚀 Tex Weaves — Starting data seed...\n");
  try {
    await seedSettings();
    await seedQualityMaster();
    await seedMachineMaster();
    await seedShiftLog();
    await seedBeam();
    await seedYarnPurchase();
    console.log("\n✅ All data seeded successfully!");
    console.log("\nNext: run 'npm run dev' to start the application.");
  } catch (err) {
    console.error("❌ Seed failed:", err.message || err);
    process.exit(1);
  }
}

main();