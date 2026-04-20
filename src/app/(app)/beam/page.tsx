"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/db";

type BeamStatus = "IN_STOCK" | "ACTIVE" | "COMPLETED" | "JOBWORK_SENT" | "JOBWORK_RECEIVED";

interface Beam {
  id: number;
  beam_no: string;
  quality_id: number;
  warp_meter: number;
  date_created: string;
  status: BeamStatus;
  loading_date: string | null;
  loading_shift: string | null;
  machine_no: number | null;
  bhidan_date: string | null;
  bhidan_shift: string | null;
  is_jobwork: number;
  job_party: string | null;
  quality: { name: string };
}

interface Quality { id: number; name: string; }
interface Machine { machine_no: number; }

const TABS = ["IN_STOCK", "ACTIVE", "COMPLETED", "JOBWORK"] as const;

function daysColor(days: number) {
  if (days < 3) return "text-red-600 bg-red-50";
  if (days <= 7) return "text-orange-600 bg-orange-50";
  return "text-green-600 bg-green-50";
}

export default function BeamPage() {
  const [tab, setTab] = useState<typeof TABS[number]>("ACTIVE");
  const [beams, setBeams] = useState<Beam[]>([]);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [avgProd, setAvgProd] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  const [showBhidan, setShowBhidan] = useState(false);
  const [selectedBeam, setSelectedBeam] = useState<Beam | null>(null);

  const [form, setForm] = useState({ beam_no: "", quality_id: "", warp_meter: "", date_created: "" });
  const [loadForm, setLoadForm] = useState({ machine_no: "", loading_date: "", loading_shift: "DAY" });
  const [bhidanForm, setBhidanForm] = useState({ bhidan_date: "", bhidan_shift: "DAY" });
  const [saving, setSaving] = useState(false);

  function today() {
    return new Date().toISOString().split("T")[0];
  }

  useEffect(() => {
    Promise.all([
      supabase.from("quality_master").select("id, name").order("name"),
      supabase.from("machine_master").select("machine_no").order("machine_no"),
    ]).then(([q, m]) => {
      setQualities(q.data || []);
      setMachines(m.data || []);
      setForm((f) => ({ ...f, date_created: today() }));
    });
  }, []);

  useEffect(() => {
    loadBeams();
  }, [tab]);

  async function loadBeams() {
    setLoading(true);

    const targetStatus = tab === "JOBWORK" ? "JOBWORK_SENT" : tab;

    const { data: rawBeams } = await supabase
      .from("beam")
      .select("*, quality:quality_id(name)")
      .eq("status", targetStatus)
      .order("date_created", { ascending: false });

    if (tab === "ACTIVE" && rawBeams && rawBeams.length > 0) {
      const { data: prodRows } = await supabase
        .from("shift_log")
        .select("machine_no, production_meters")
        .order("date", { ascending: false })
        .limit(100);

      const prodByMc: Record<number, number[]> = {};
      (prodRows || []).forEach((r: any) => {
        if (!prodByMc[r.machine_no]) prodByMc[r.machine_no] = [];
        prodByMc[r.machine_no].push(r.production_meters || 0);
      });

      const avg: Record<number, number> = {};
      Object.entries(prodByMc).forEach(([mc, prods]) => {
        avg[Number(mc)] = prods.slice(0, 5).reduce((a, b) => a + b, 0) / Math.min(prods.length, 5) || 0;
      });
      setAvgProd(avg);
    }

    setBeams(rawBeams || []);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from("beam").insert({
      beam_no: form.beam_no.trim(),
      quality_id: Number(form.quality_id),
      warp_meter: Number(form.warp_meter) || 0,
      date_created: form.date_created || today(),
      status: "IN_STOCK",
    });
    setSaving(false);
    setShowCreate(false);
    setForm({ beam_no: "", quality_id: "", warp_meter: "", date_created: today() });
    loadBeams();
  }

  async function handleLoad(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBeam) return;
    setSaving(true);
    await supabase.from("beam").update({
      status: "ACTIVE",
      loading_date: loadForm.loading_date || today(),
      loading_shift: loadForm.loading_shift,
      machine_no: Number(loadForm.machine_no),
    }).eq("id", selectedBeam.id);
    setSaving(false);
    setShowLoad(false);
    setSelectedBeam(null);
    loadBeams();
  }

  async function handleBhidan(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBeam) return;
    setSaving(true);
    await supabase.from("beam").update({
      status: "COMPLETED",
      bhidan_date: bhidanForm.bhidan_date || today(),
      bhidan_shift: bhidanForm.bhidan_shift,
    }).eq("id", selectedBeam.id);
    setSaving(false);
    setShowBhidan(false);
    setSelectedBeam(null);
    loadBeams();
  }

  function tabLabel(t: typeof TABS[number]) {
    if (t === "IN_STOCK") return "In Stock";
    if (t === "ACTIVE") return "Active";
    if (t === "COMPLETED") return "Completed";
    return "Jobwork";
  }

  function tabIcon(t: typeof TABS[number]) {
    if (t === "IN_STOCK") return "📦";
    if (t === "ACTIVE") return "⚙️";
    if (t === "COMPLETED") return "✅";
    return "🏭";
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Beam Management</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
        >
          + New Beam
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              tab === t
                ? "bg-blue-600 text-white px-4 py-2 rounded-lg font-medium text-sm"
                : "bg-white text-slate-600 border border-slate-300 px-4 py-2 rounded-lg font-medium text-sm hover:bg-slate-50"
            }
          >
            {tabIcon(t)} {tabLabel(t)}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : beams.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-12 text-center text-slate-400">
          No beams in &ldquo;{tabLabel(tab)}&rdquo; status
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-xs">
              <tr>
                {tab === "ACTIVE" && (
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Machine</th>
                )}
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Beam No</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Quality</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Warp (m)</th>
                {tab === "ACTIVE" && (
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Pending (m)</th>
                )}
                {tab === "ACTIVE" && (
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Days to Bhidan</th>
                )}
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Loaded Date</th>
                {tab === "COMPLETED" && (
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Bhidan Date</th>
                )}
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {beams.map((b) => {
                const avg = avgProd[b.machine_no || 0] || 0;
                const days = avg > 0
                  ? Math.round(Math.max(0, b.warp_meter / avg))
                  : null;

                return (
                  <tr key={b.id} className="border-t hover:bg-slate-50">
                    {tab === "ACTIVE" && (
                      <td className="px-4 py-3 font-medium">
                        {b.machine_no ? "Machine " + b.machine_no : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium text-slate-800">{b.beam_no}</td>
                    <td className="px-4 py-3 text-slate-600">{b.quality?.name || "—"}</td>
                    <td className="px-4 py-3 text-right">{b.warp_meter.toLocaleString()}</td>
                    {tab === "ACTIVE" && (
                      <td className="px-4 py-3 text-right font-medium">
                        {b.loading_date ? b.warp_meter.toLocaleString() : "—"}
                      </td>
                    )}
                    {tab === "ACTIVE" && (
                      <td className="px-4 py-3 text-center">
                        {days !== null ? (
                          <span className={"px-2 py-1 rounded-full text-xs font-bold " + daysColor(days)}>
                            ~{days}d
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {b.loading_date
                        ? b.loading_date + (b.loading_shift ? " " + b.loading_shift : "")
                        : "—"}
                    </td>
                    {tab === "COMPLETED" && (
                      <td className="px-4 py-3 text-slate-500 text-xs">{b.bhidan_date || "—"}</td>
                    )}
                    <td className="px-4 py-3 text-right">
                      {tab === "IN_STOCK" && (
                        <button
                          onClick={() => {
                            setSelectedBeam(b);
                            setShowLoad(true);
                            setLoadForm({ machine_no: String(b.machine_no || ""), loading_date: today(), loading_shift: "DAY" });
                          }}
                          className="text-blue-600 hover:underline text-xs"
                        >
                          Load on Machine
                        </button>
                      )}
                      {tab === "ACTIVE" && (
                        <button
                          onClick={() => {
                            setSelectedBeam(b);
                            setShowBhidan(true);
                            setBhidanForm({ bhidan_date: today(), bhidan_shift: "DAY" });
                          }}
                          className="text-orange-600 hover:underline text-xs"
                        >
                          Mark Bhidan
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Beam Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Create New Beam</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="label">Beam No</label>
                <input
                  type="text"
                  value={form.beam_no}
                  onChange={(e) => setForm((f) => ({ ...f, beam_no: e.target.value }))}
                  className="input"
                  required
                  placeholder="e.g. NB5338"
                />
              </div>
              <div>
                <label className="label">Quality</label>
                <select
                  value={form.quality_id}
                  onChange={(e) => setForm((f) => ({ ...f, quality_id: e.target.value }))}
                  className="input"
                  required
                >
                  <option value="">Select quality</option>
                  {qualities.map((q) => (
                    <option key={q.id} value={q.id}>{q.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Warp Meter</label>
                <input
                  type="number"
                  value={form.warp_meter}
                  onChange={(e) => setForm((f) => ({ ...f, warp_meter: e.target.value }))}
                  className="input"
                  required
                  placeholder="e.g. 3755"
                />
              </div>
              <div>
                <label className="label">Date Created</label>
                <input
                  type="date"
                  value={form.date_created}
                  onChange={(e) => setForm((f) => ({ ...f, date_created: e.target.value }))}
                  className="input"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                  {saving ? "Saving..." : "Create Beam"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 bg-slate-200 text-slate-800 py-2 rounded-lg hover:bg-slate-300 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Load on Machine Modal */}
      {showLoad && selectedBeam && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-slate-800 mb-4">
              Load Beam {selectedBeam.beam_no}
            </h2>
            <form onSubmit={handleLoad} className="space-y-4">
              <div>
                <label className="label">Machine No</label>
                <select
                  value={loadForm.machine_no}
                  onChange={(e) => setLoadForm((f) => ({ ...f, machine_no: e.target.value }))}
                  className="input"
                  required
                >
                  <option value="">Select machine</option>
                  {machines.map((m) => (
                    <option key={m.machine_no} value={m.machine_no}>Machine {m.machine_no}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Loading Date</label>
                <input
                  type="date"
                  value={loadForm.loading_date}
                  onChange={(e) => setLoadForm((f) => ({ ...f, loading_date: e.target.value }))}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label">Shift</label>
                <div className="flex gap-2">
                  {(["DAY", "NIGHT"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setLoadForm((f) => ({ ...f, loading_shift: s }))}
                      className={
                        "flex-1 py-2 rounded-lg font-medium text-sm " +
                        (loadForm.loading_shift === s ? "bg-blue-600 text-white" : "bg-slate-100")
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                  {saving ? "Saving..." : "Load Beam"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLoad(false)}
                  className="flex-1 bg-slate-200 text-slate-800 py-2 rounded-lg hover:bg-slate-300 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bhidan Modal */}
      {showBhidan && selectedBeam && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-slate-800 mb-4">
              Mark Bhidan — {selectedBeam.beam_no}
            </h2>
            <form onSubmit={handleBhidan} className="space-y-4">
              <div>
                <label className="label">Bhidan Date</label>
                <input
                  type="date"
                  value={bhidanForm.bhidan_date}
                  onChange={(e) => setBhidanForm((f) => ({ ...f, bhidan_date: e.target.value }))}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label">Shift</label>
                <div className="flex gap-2">
                  {(["DAY", "NIGHT"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setBhidanForm((f) => ({ ...f, bhidan_shift: s }))}
                      className={
                        "flex-1 py-2 rounded-lg font-medium text-sm " +
                        (bhidanForm.bhidan_shift === s ? "bg-blue-600 text-white" : "bg-slate-100")
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-700">
                This beam will be marked as completed. Production will stop being tracked for this beam.
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-orange-600 text-white py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 text-sm font-medium"
                >
                  {saving ? "Saving..." : "Confirm Bhidan"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBhidan(false)}
                  className="flex-1 bg-slate-200 text-slate-800 py-2 rounded-lg hover:bg-slate-300 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}