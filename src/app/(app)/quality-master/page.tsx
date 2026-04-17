"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/db";

interface Quality {
  id: number;
  name: string;
  ppi: number;
  warp_pagar: number;
  pasar_pagar: number;
  mending_pagar: number;
  tfo_pagar_monthly: number;
}

const emptyForm = {
  name: "",
  ppi: 80,
  warp_pagar: 0,
  pasar_pagar: 0,
  mending_pagar: 0,
  tfo_pagar_monthly: 0,
};

export default function QualityMasterPage() {
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Quality | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    supabase.from("quality_master").select("*").order("name").then(({ data }) => {
      setQualities(data || []);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

  function openEdit(q: Quality) {
    setEditing(q);
    setForm({ name: q.name, ppi: q.ppi, warp_pagar: q.warp_pagar, pasar_pagar: q.pasar_pagar, mending_pagar: q.mending_pagar, tfo_pagar_monthly: q.tfo_pagar_monthly });
    setShowForm(true);
    setError("");
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
    setError("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      ppi: Number(form.ppi) || 80,
      warp_pagar: Number(form.warp_pagar) || 0,
      pasar_pagar: Number(form.pasar_pagar) || 0,
      mending_pagar: Number(form.mending_pagar) || 0,
      tfo_pagar_monthly: Number(form.tfo_pagar_monthly) || 0,
    };

    const { error: err } = await supabase.from("quality_master").upsert(payload, { onConflict: "name" });
    setSaving(false);

    if (err) {
      setError(err.message);
    } else {
      setShowForm(false);
      load();
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this quality?")) return;
    await supabase.from("quality_master").delete().eq("id", id);
    load();
  }

  function field(key: keyof typeof form, label: string, type = "number") {
    return (
      <div key={key}>
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
        <input
          type={type}
          value={form[key] as string | number}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          required={key === "name"}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">🏷️ Quality Master</h1>
        <button onClick={openNew} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
          + Add Quality
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-slate-800 mb-4">
              {editing ? "Edit Quality" : "Add New Quality"}
            </h2>

            <form onSubmit={handleSave} className="space-y-4">
              {field("name", "Quality Name", "text")}
              {field("ppi", "PPI (Picks per Inch)", "number")}
              {field("warp_pagar", "Warp Pagar (₹/meter)", "number")}
              {field("pasar_pagar", "Pasar Pagar (₹/meter)", "number")}
              {field("mending_pagar", "Mending Pagar (₹/meter)", "number")}
              {field("tfo_pagar_monthly", "TFO Pagar Monthly (₹)", "number")}

              {error && <p className="text-red-600 text-sm">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Saving..." : "Save"}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-slate-200 text-slate-800 py-2 rounded-lg hover:bg-slate-300">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Quality</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700">PPI</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700">Warp Pagar</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700">Pasar Pagar</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700">Mending Pagar</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700">TFO Monthly</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {qualities.map((q) => (
                <tr key={q.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{q.name}</td>
                  <td className="px-4 py-3 text-right">{q.ppi}</td>
                  <td className="px-4 py-3 text-right">₹{q.warp_pagar.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">₹{q.pasar_pagar.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">₹{q.mending_pagar.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">₹{q.tfo_pagar_monthly.toLocaleString()}</td>
                  <td className="px-4 py-3 flex gap-2 justify-end">
                    <button onClick={() => openEdit(q)} className="text-blue-600 hover:underline text-xs">Edit</button>
                    <button onClick={() => handleDelete(q.id)} className="text-red-600 hover:underline text-xs">Delete</button>
                  </td>
                </tr>
              ))}
              {qualities.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No qualities found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}