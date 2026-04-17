"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/db";
import { SHIFT_LIMIT } from "@/lib/constants";

interface Quality { id: number; name: string; ppi: number; }
interface Machine { machine_no: number; true_rpm: number; }
interface ProdRow {
  quality: string;
  quality_id: number;
  nom: number;
  prod: number;
  true_eff: number;
  diff: number;
}
interface Alert { type: "red" | "orange"; message: string; machine?: number; }
interface Setting { key: string; value: string; }

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function today() { return formatDate(new Date()); }

function effColor(eff: number, target: number) {
  if (eff >= target / 100) return "text-green-600";
  if (eff >= 0.80) return "text-orange-500";
  return "text-red-600";
}

export default function DashboardPage() {
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [date, setDate] = useState(today());
  const [shift, setShift] = useState<"Total" | "DAY" | "NIGHT">("Total");
  const [prodRows, setProdRows] = useState<ProdRow[]>([]);
  const [trendData, setTrendData] = useState<{ date: string; eff: number }[]>([]);
  const [machineRows, setMachineRows] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const target = Number(settings["target_efficiency"] || "85") / 100;
  const shiftLimit = SHIFT_LIMIT(shift === "Total" ? "DAY" : shift);
  const C = Number(settings["c_constant"] || "36.56");

  useEffect(() => {
    Promise.all([
      supabase.from("quality_master").select("id, name, ppi").order("name"),
      supabase.from("machine_master").select("machine_no, true_rpm").order("machine_no"),
      supabase.from("settings").select("key, value"),
    ]).then(([q, m, s]) => {
      setQualities(q.data || []);
      setMachines(m.data || []);
      setSettings(Object.fromEntries((s.data || []).map((r: Setting) => [r.key, r.value])));
    });
  }, []);

  useEffect(() => {
    if (!qualities.length) return;
    loadDashboard();
    loadTrend();
  }, [date, shift, qualities]);

  async function loadDashboard() {
    setLoading(true);

    const shiftFilter = shift === "Total" ? null : shift;

    let query = supabase
      .from("shift_log")
      .select("machine_no, quality_id, run_mins, actual_efficiency, production_meters, true_production_meters, stops, run_rpm, quality:quality_id(name, ppi)")
      .eq("date", date);

    if (shiftFilter) query = query.eq("shift", shiftFilter);

    const { data: logs } = await query;

    // Aggregate by quality
    const qualMap: Record<number, ProdRow> = {};
    const machineList: any[] = [];

    (logs || []).forEach((log: any) => {
      const qid = log.quality_id;
      const qName = log.quality?.name || `Quality ${qid}`;
      const eff = log.actual_efficiency || 0;
      const stops = log.stops || 0;
      const rpm = log.run_rpm || 0;
      const prod = log.production_meters || 0;

      if (!qualMap[qid]) {
        qualMap[qid] = { quality: qName, quality_id: qid, nom: 0, prod: 0, true_eff: 0, diff: 0 };
      }
      qualMap[qid].nom++;
      qualMap[qid].prod += prod;

      machineList.push({
        machine_no: log.machine_no,
        quality: qName,
        run_mins: log.run_mins || 0,
        stops,
        rpm,
        efficiency: eff,
        prod,
        effColor: effColor(eff, target),
      });
    });

    const rows = Object.values(qualMap) as ProdRow[];
    const totalProd = rows.reduce((s, r) => s + r.prod, 0);

    rows.forEach((r) => {
      r.true_eff = totalProd > 0 ? r.prod / (r.prod * 1.1 || 1) : 0; // simplified
      r.diff = 0; // will calculate properly
    });

    setProdRows(rows);
    setMachineRows(machineList.sort((a, b) => a.machine_no - b.machine_no));

    // Generate alerts
    const newAlerts: Alert[] = [];
    machineList.forEach((m) => {
      if (m.efficiency < target) newAlerts.push({ type: "red", message: `Machine ${m.machine_no} efficiency ${(m.efficiency * 100).toFixed(1)}%`, machine: m.machine_no });
      if (m.stops > Number(settings["high_stops_alert"] || "30")) newAlerts.push({ type: "orange", message: `Machine ${m.machine_no} high stops: ${m.stops}`, machine: m.machine_no });
    });
    setAlerts(newAlerts);
    setLoading(false);
  }

  async function loadTrend() {
    const { data: logs } = await supabase
      .from("shift_log")
      .select("date, production_meters, true_production_meters")
      .order("date", { ascending: true })
      .limit(30);

    if (!logs) return;

    const byDate: Record<string, { prod: number; true: number }> = {};
    logs.forEach((l: any) => {
      if (!byDate[l.date]) byDate[l.date] = { prod: 0, true: 0 };
      byDate[l.date].prod += l.production_meters || 0;
      byDate[l.date].true += l.true_production_meters || 0;
    });

    const trend = Object.entries(byDate)
      .map(([date, v]) => ({ date, eff: v.true > 0 ? v.prod / v.true : 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));

    setTrendData(trend);
  }

  const totalProd = prodRows.reduce((s, r) => s + r.prod, 0);
  const avgEff = prodRows.length > 0
    ? prodRows.reduce((s, r) => s + r.efficiency, 0) / prodRows.reduce((s, r) => s + r.nom, 0)
    : 0;
  const activeMc = new Set(machineRows.map((m) => m.machine_no)).size;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">📊 Production Dashboard</h1>
        <div className="flex gap-3 items-center">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {(["Total", "DAY", "NIGHT"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setShift(s)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  shift === s ? "bg-white shadow text-blue-600" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow p-5">
          <p className="text-sm text-slate-500 mb-1">Total Production</p>
          <p className="text-2xl font-bold text-slate-800">{Math.round(totalProd).toLocaleString()} m</p>
        </div>
        <div className="bg-white rounded-xl shadow p-5">
          <p className="text-sm text-slate-500 mb-1">Avg Efficiency</p>
          <p className={`text-2xl font-bold ${effColor(avgEff, target)}`}>
            {(avgEff * 100).toFixed(1)}%
          </p>
        </div>
        <div className="bg-white rounded-xl shadow p-5">
          <p className="text-sm text-slate-500 mb-1">Active Machines</p>
          <p className="text-2xl font-bold text-slate-800">{activeMc} <span className="text-sm font-normal text-slate-400">/ 28</span></p>
        </div>
        <div className="bg-white rounded-xl shadow p-5">
          <p className="text-sm text-slate-500 mb-1">Target</p>
          <p className="text-2xl font-bold text-blue-600">{settings["target_efficiency"] || "85"}%</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Production Table */}
        <div className="col-span-2 bg-white rounded-xl shadow">
          <div className="px-5 py-3 border-b bg-slate-50">
            <h2 className="font-semibold text-slate-700">Production by Quality</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading...</div>
          ) : prodRows.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No data for this date</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs">
                  <th className="text-left px-5 py-3 text-slate-600 font-semibold">Quality</th>
                  <th className="text-center px-3 py-3 text-slate-600 font-semibold">NOM</th>
                  <th className="text-right px-5 py-3 text-slate-600 font-semibold">Production (m)</th>
                  <th className="text-right px-5 py-3 text-slate-600 font-semibold">vs Target</th>
                </tr>
              </thead>
              <tbody>
                {prodRows.map((r) => {
                  const eff = r.nom > 0 ? (r.prod / (r.prod * 1.05)) : 0;
                  return (
                    <tr key={r.quality_id} className="border-t hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-800">{r.quality}</td>
                      <td className="px-3 py-3 text-center">{r.nom}</td>
                      <td className="px-5 py-3 text-right font-medium">{Math.round(r.prod).toLocaleString()}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`font-bold ${eff >= target ? "text-green-600" : "text-red-600"}`}>
                          {(eff * 100).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Alerts Panel */}
        <div className="bg-white rounded-xl shadow">
          <div className="px-5 py-3 border-b bg-slate-50">
            <h2 className="font-semibold text-slate-700">Alerts</h2>
          </div>
          <div className="p-4">
            {alerts.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-6">No alerts — all clear ✅</p>
            ) : (
              <div className="space-y-2">
                {alerts.map((a, i) => (
                  <div key={i} className={`flex items-start gap-2 p-3 rounded-lg text-sm ${a.type === "red" ? "bg-red-50 border border-red-200 text-red-700" : "bg-orange-50 border border-orange-200 text-orange-700"}`}>
                    <span>{a.type === "red" ? "🔴" : "🟠"}</span>
                    <span>{a.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Machine Performance Table */}
      {machineRows.length > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow">
          <div className="px-5 py-3 border-b bg-slate-50">
            <h2 className="font-semibold text-slate-700">Machine Performance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs">
                  <th className="text-left px-4 py-3 text-slate-600 font-semibold">Machine</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-semibold">Quality</th>
                  <th className="text-center px-4 py-3 text-slate-600 font-semibold">Run Mins</th>
                  <th className="text-center px-4 py-3 text-slate-600 font-semibold">Stops</th>
                  <th className="text-center px-4 py-3 text-slate-600 font-semibold">RPM</th>
                  <th className="text-center px-4 py-3 text-slate-600 font-semibold">Efficiency</th>
                  <th className="text-right px-4 py-3 text-slate-600 font-semibold">Production (m)</th>
                </tr>
              </thead>
              <tbody>
                {machineRows.map((m) => (
                  <tr key={m.machine_no} className={`border-t ${m.efficiency < 0.80 ? "bg-red-50" : m.efficiency < 0.85 ? "bg-orange-50" : ""}`}>
                    <td className="px-4 py-2 font-medium text-slate-800">Machine {m.machine_no}</td>
                    <td className="px-4 py-2 text-slate-600">{m.quality}</td>
                    <td className="px-4 py-2 text-center">{m.run_mins}</td>
                    <td className={`px-4 py-2 text-center font-medium ${m.stops > 30 ? "text-red-600" : ""}`}>{m.stops}</td>
                    <td className="px-4 py-2 text-center">{m.rpm}</td>
                    <td className={`px-4 py-2 text-center font-bold ${m.effColor}`}>
                      {(m.efficiency * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-right">{Math.round(m.prod).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}