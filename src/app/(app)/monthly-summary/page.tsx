"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/db";

interface MonthData {
  month: string;
  quality: string;
  totalProd: number;
  avgEff: number;
  totalCost: number;
  costPerMeter: number;
}

const FY_MONTHS = [
  "April 2025", "May 2025", "June 2025", "July 2025", "August 2025",
  "September 2025", "October 2025", "November 2025", "December 2025",
  "January 2026", "February 2026", "March 2026",
];

const FY_START = "2025-04-01";
const FY_END = "2026-03-31";

export default function MonthlySummaryPage() {
  const [rows, setRows] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  useEffect(() => {
    loadSummary();
  }, []);

  async function loadSummary() {
    setLoading(true);

    const { data: logs } = await supabase
      .from("shift_log")
      .select("date, quality_id, production_meters, true_production_meters, actual_efficiency, quality:quality_id(name)")
      .gte("date", FY_START)
      .lte("date", FY_END);

    const { data: settings } = await supabase.from("settings").select("key, value");

    const qualMap: Record<string, MonthData> = {};

    (logs || []).forEach((l: any) => {
      const d = new Date(l.date);
      const monthName = d.toLocaleString("en-US", { month: "long", year: "numeric" });
      const qName = l.quality?.name || `Quality ${l.quality_id}`;
      const key = `${monthName}|${qName}`;

      if (!qualMap[key]) {
        qualMap[key] = { month: monthName, quality: qName, totalProd: 0, avgEff: 0, totalCost: 0, costPerMeter: 0 };
      }
      qualMap[key].totalProd += l.production_meters || 0;
    });

    const result = Object.values(qualMap);
    result.sort((a, b) => {
      const mi = FY_MONTHS.indexOf(a.month);
      const mj = FY_MONTHS.indexOf(b.month);
      return mi - mj;
    });

    setRows(result);
    setLoading(false);
  }

  const monthlyData = FY_MONTHS.map((month) => {
    const monthRows = rows.filter((r) => r.month === month);
    return {
      month,
      totalProd: monthRows.reduce((s, r) => s + r.totalProd, 0),
    };
  });

  const grandTotal = monthlyData.reduce((s, r) => s + r.totalProd, 0);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">📅 Monthly Summary — FY 2025-26</h1>
        <div className="text-right">
          <p className="text-sm text-slate-500">Grand Total Production</p>
          <p className="text-2xl font-bold text-blue-600">{Math.round(grandTotal).toLocaleString()} m</p>
        </div>
      </div>

      {/* FY Monthly Overview */}
      <div className="bg-white rounded-xl shadow mb-6">
        <div className="px-5 py-3 border-b bg-slate-50">
          <h2 className="font-semibold text-slate-700">Monthly Overview</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-5 py-3 text-slate-600 font-semibold">Month</th>
              <th className="text-right px-5 py-3 text-slate-600 font-semibold">Total Production (m)</th>
              <th className="text-right px-5 py-3 text-slate-600 font-semibold">% of FY Total</th>
            </tr>
          </thead>
          <tbody>
            {monthlyData.map((m) => (
              <tr key={m.month} className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedMonth(selectedMonth === m.month ? null : m.month)}>
                <td className="px-5 py-3 font-medium text-slate-700">{m.month}</td>
                <td className="px-5 py-3 text-right">{Math.round(m.totalProd).toLocaleString()}</td>
                <td className="px-5 py-3 text-right text-slate-500">
                  {grandTotal > 0 ? ((m.totalProd / grandTotal) * 100).toFixed(1) : "0.0"}%
                </td>
              </tr>
            ))}
            <tr className="bg-slate-100 font-bold">
              <td className="px-5 py-3">TOTAL FY 2025-26</td>
              <td className="px-5 py-3 text-right">{Math.round(grandTotal).toLocaleString()}</td>
              <td className="px-5 py-3 text-right">100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Quality Breakdown for Selected Month */}
      {selectedMonth && (
        <div className="bg-white rounded-xl shadow">
          <div className="px-5 py-3 border-b bg-blue-50">
            <h2 className="font-semibold text-blue-700">{selectedMonth} — Quality Breakdown</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-5 py-3 text-slate-600 font-semibold">Quality</th>
                <th className="text-right px-5 py-3 text-slate-600 font-semibold">Production (m)</th>
                <th className="text-right px-5 py-3 text-slate-600 font-semibold">% of Month</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => r.month === selectedMonth)
                .sort((a, b) => b.totalProd - a.totalProd)
                .map((r) => {
                  const monthTotal = monthlyData.find((m) => m.month === selectedMonth)?.totalProd || 0;
                  return (
                    <tr key={`${r.month}|${r.quality}`} className="border-t">
                      <td className="px-5 py-3 font-medium text-slate-700">{r.quality}</td>
                      <td className="px-5 py-3 text-right">{Math.round(r.totalProd).toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-slate-500">
                        {monthTotal > 0 ? ((r.totalProd / monthTotal) * 100).toFixed(1) : "0.0"}%
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {loading && <p className="text-slate-500 mt-4">Loading...</p>}
    </div>
  );
}