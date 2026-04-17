"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/db";
import { SHIFT_LIMIT } from "@/lib/constants";

interface Quality { id: number; name: string; ppi: number; }
interface Machine { id: number; machine_no: number; true_rpm: number; }

interface RowData {
  machine_no: number;
  quality_id: number | null;
  power_time: string;
  run_time: string;
  stops: string;
  run_rpm: string;
}

function toMins(v: string) {
  if (!v) return 0;
  const s = v.trim();
  if (s.includes(".")) {
    const parts = s.split(".");
    return Math.round(parseFloat(parts[0]) * 60 + parseInt(parts[1]) * 10);
  }
  return Math.round(parseFloat(s) * 60);
}

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function prevDay() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

const MACHINE_COUNT = 28;

export default function ShiftEntryPage() {
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [date, setDate] = useState(prevDay());
  const [shift, setShift] = useState<"DAY" | "NIGHT">("DAY");
  const [rows, setRows] = useState<RowData[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    supabase.from("quality_master").select("id, name, ppi").order("name").then(({ data }) => {
      setQualities(data || []);
    });
  }, []);

  useEffect(() => {
    setRows(
      Array.from({ length: MACHINE_COUNT }, (_, i) => ({
        machine_no: i + 1,
        quality_id: null,
        power_time: "",
        run_time: "",
        stops: "",
        run_rpm: "",
      }))
    );
  }, []);

  function updateRow(idx: number, field: keyof RowData, value: string | number | null) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
    setErrors((prev) => { const e = { ...prev }; delete e[idx]; return e; });
  }

  function validate(): boolean {
    const newErrors: Record<number, string> = {};
    rows.forEach((r, idx) => {
      const rt = parseFloat(r.run_time) || 0;
      const pt = parseFloat(r.power_time) || 0;
      if (r.quality_id && rt > pt) {
        newErrors[idx] = "Run time cannot exceed power time";
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);

    const validRows = rows.filter(
      (r) => r.quality_id && (parseFloat(r.run_time) || 0) > 0
    );

    if (validRows.length === 0) {
      alert("No data to save. Please fill in at least one machine.");
      setSubmitting(false);
      return;
    }

    const records = validRows.map((r) => {
      const shiftLimit = SHIFT_LIMIT(shift);
      const runMins = toMins(r.run_time);
      const eff = Math.round((runMins / shiftLimit) * 10000) / 10000;
      // We'll look up ppi and true_rpm from client-side data
      return {
        date,
        shift,
        machine_no: r.machine_no,
        quality_id: r.quality_id,
        power_time: parseFloat(r.power_time) || 0,
        run_time: parseFloat(r.run_time) || 0,
        stops: parseInt(r.stops) || 0,
        run_rpm: parseInt(r.run_rpm) || 0,
        run_mins: runMins,
        actual_efficiency: eff,
        production_meters: 0, // will be calculated server-side
        true_production_meters: 0,
      };
    });

    const { error } = await supabase.from("shift_log").insert(records);
    setSubmitting(false);

    if (error) {
      alert("Error saving: " + error.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  const shiftLimit = SHIFT_LIMIT(shift);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">✏️ Shift Data Entry</h1>
        <div className="flex items-center gap-3">
          {saved && <span className="text-green-600 font-medium text-sm">Saved!</span>}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save Shift Data"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <div>
          <label className="label">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="label">Shift</label>
          <div className="flex gap-2">
            {(["DAY", "NIGHT"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setShift(s)}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  shift === s ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                }`}
              >
                {s === "DAY" ? "☀️ Day (11h)" : "🌙 Night (13h)"}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-auto text-right">
          <p className="text-sm text-slate-500">Shift Limit</p>
          <p className="text-lg font-bold text-slate-700">{shiftLimit} mins</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-slate-100 text-slate-700 text-xs">
            <tr>
              <th className="px-3 py-3 text-center font-semibold w-12">#</th>
              <th className="px-3 py-3 text-left font-semibold w-40">Quality</th>
              <th className="px-3 py-3 text-center font-semibold">Power Time<br/><span className="font-normal text-slate-400">(hrs.dec)</span></th>
              <th className="px-3 py-3 text-center font-semibold">Run Time<br/><span className="font-normal text-slate-400">(hrs.dec)</span></th>
              <th className="px-3 py-3 text-center font-semibold">Efficiency<br/><span className="font-normal text-slate-400">(auto)</span></th>
              <th className="px-3 py-3 text-center font-semibold">Stops</th>
              <th className="px-3 py-3 text-center font-semibold">Run RPM</th>
              <th className="px-3 py-3 text-left font-semibold text-red-600 w-48">Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const rt = parseFloat(row.run_time) || 0;
              const eff = rt > 0 ? Math.round((toMins(row.run_time) / shiftLimit) * 10000) / 10000 : 0;
              return (
                <tr key={row.machine_no} className={`border-t ${errors[idx] ? "bg-red-50" : "hover:bg-slate-50"}`}>
                  <td className="px-3 py-2 text-center text-slate-500 font-medium">{row.machine_no}</td>
                  <td className="px-3 py-2">
                    <select
                      value={row.quality_id ?? ""}
                      onChange={(e) => updateRow(idx, "quality_id", e.target.value ? Number(e.target.value) : null)}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Select —</option>
                      {qualities.map((q) => (
                        <option key={q.id} value={q.id}>{q.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.power_time}
                      onChange={(e) => updateRow(idx, "power_time", e.target.value)}
                      placeholder="10.30"
                      className="w-24 border border-slate-300 rounded px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.run_time}
                      onChange={(e) => updateRow(idx, "run_time", e.target.value)}
                      placeholder="9.50"
                      className="w-24 border border-slate-300 rounded px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    {rt > 0 ? (
                      <span className={`font-bold ${eff >= 0.85 ? "text-green-600" : eff >= 0.80 ? "text-orange-500" : "text-red-600"}`}>
                        {(eff * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      value={row.stops}
                      onChange={(e) => updateRow(idx, "stops", e.target.value)}
                      placeholder="0"
                      className="w-20 border border-slate-300 rounded px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      value={row.run_rpm}
                      onChange={(e) => updateRow(idx, "run_rpm", e.target.value)}
                      placeholder="699"
                      className="w-24 border border-slate-300 rounded px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-red-600 text-xs">
                    {errors[idx] || ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}