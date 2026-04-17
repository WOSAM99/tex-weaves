"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/db";

interface Quality { id: number; name: string; ppi: number; warp_pagar: number; pasar_pagar: number; mending_pagar: number; tfo_pagar_monthly: number; }
interface Setting { key: string; value: string; }

function normalizeFixed(cost: number, adjProd: number) {
  if (adjProd <= 0) return 0;
  return Math.round((cost / adjProd) * 100) / 100;
}

export default function CostSheetPage() {
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [view, setView] = useState<"daily" | "monthly">("daily");
  const [dateFrom, setDateFrom] = useState("2025-04-01");
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [costRows, setCostRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("quality_master").select("*").order("name").then(({ data }) => {
      setQualities(data || []);
    });
    supabase.from("settings").select("key, value").then(({ data }) => {
      setSettings(Object.fromEntries((data || []).map((r: Setting) => [r.key, r.value])));
    });
  }, []);

  useEffect(() => {
    if (!qualities.length) return;
    loadCosts();
  }, [dateFrom, dateTo, view, qualities]);

  async function loadCosts() {
    setLoading(true);

    const { data: logs } = await supabase
      .from("shift_log")
      .select("quality_id, production_meters, run_mins, shift, quality:quality_id(ppi)")
      .gte("date", dateFrom)
      .lte("date", dateTo);

    const qualMap: Record<number, any> = {};
    (logs || []).forEach((l: any) => {
      const qid = l.quality_id;
      if (!qualMap[qid]) qualMap[qid] = { quality_id: qid, dayProd: 0, nightProd: 0, shiftCount: 0, runMins: 0 };
      if (l.shift === "DAY") qualMap[qid].dayProd += l.production_meters || 0;
      if (l.shift === "NIGHT") qualMap[qid].nightProd += l.production_meters || 0;
      if (l.shift === "DAY" && l.production_meters > 0) qualMap[qid].shiftCount++;
      if (l.shift === "NIGHT" && l.production_meters > 0) qualMap[qid].shiftCount++;
      qualMap[qid].runMins += l.run_mins || 0;
    });

    const wastage = Number(settings["production_wastage"] || "0.98");
    const looms = Number(settings["looms_salary_monthly"] || "450000");
    const milgin = Number(settings["milgin_exp_monthly"] || "150000");
    const emi = Number(settings["emi_monthly"] || "1000000");

    const rows = Object.entries(qualMap).map(([qid, agg]) => {
      const q = qualities.find((q) => String(q.id) === qid) || {} as Quality;
      const dayAdj = (agg.dayProd / 660) * 1440;
      const nightAdj = (agg.nightProd / 780) * 1440;
      const shiftCount = agg.shiftCount || 1;
      const adjProd = ((dayAdj + nightAdj) * wastage) / shiftCount / 28;

      const loomsCost = normalizeFixed(looms, adjProd);
      const tfoCost = normalizeFixed(q.tfo_pagar_monthly || 0, adjProd);
      const milginCost = normalizeFixed(milgin, adjProd);
      const emiCost = normalizeFixed(emi, adjProd);
      const totalLabour = loomsCost + tfoCost + milginCost + (q.warp_pagar || 0) + (q.pasar_pagar || 0) + (q.mending_pagar || 0);
      const totalCost = totalLabour + emiCost;

      return {
        name: q.name || `Quality ${qid}`,
        looms: loomsCost,
        tfo: tfoCost,
        warp: q.warp_pagar || 0,
        pasar: q.pasar_pagar || 0,
        mending: q.mending_pagar || 0,
        milgin: milginCost,
        emi: emiCost,
        totalLabour,
        totalCost,
        totalProd: agg.dayProd + agg.nightProd,
      };
    });

    setCostRows(rows);
    setLoading(false);
  }

  const grandTotal = costRows.reduce((s, r) => s + r.totalCost, 0);
  const grandProd = costRows.reduce((s, r) => s + r.totalProd, 0);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">💰 Cost Sheet</h1>
        <div className="flex gap-3">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="self-center text-slate-400">to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {([["daily", "Daily"], ["monthly", "Monthly"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setView(v)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${view === v ? "bg-white shadow text-blue-600" : "text-slate-500"}`}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Calculating costs...</p>
      ) : costRows.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-12 text-center text-slate-400">No production data in selected range</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-xs">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Quality</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Production (m)</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Looms Salary</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">TFO Pagar</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Warp Pagar</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Pasar Pagar</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Mending</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Milgin</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">EMI</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 bg-blue-50">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {costRows.map((r) => (
                <tr key={r.name} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                  <td className="px-4 py-3 text-right">{Math.round(r.totalProd).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">₹{r.looms.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">₹{r.tfo.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">₹{r.warp.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">₹{r.pasar.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">₹{r.mending.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">₹{r.milgin.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">₹{r.emi.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-bold text-blue-700 bg-blue-50">₹{r.totalCost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold">
                <td className="px-4 py-3">TOTAL</td>
                <td className="px-4 py-3 text-right">{Math.round(grandProd).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">₹{costRows.reduce((s, r) => s + r.looms, 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-right">₹{costRows.reduce((s, r) => s + r.tfo, 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-right">₹{costRows.reduce((s, r) => s + r.warp, 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-right">₹{costRows.reduce((s, r) => s + r.pasar, 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-right">₹{costRows.reduce((s, r) => s + r.mending, 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-right">₹{costRows.reduce((s, r) => s + r.milgin, 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-right">₹{costRows.reduce((s, r) => s + r.emi, 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-blue-800 bg-blue-100">₹{costRows.reduce((s, r) => s + r.totalCost, 0).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="mt-4 text-sm text-slate-400">
        * Costs are normalized over adjusted production (day/night normalized to 24h basis, divided by 28 machines)
      </div>
    </div>
  );
}