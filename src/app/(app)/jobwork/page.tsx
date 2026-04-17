"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/db";

interface Party { id: number; name: string; contact: string | null; }
interface Sent { id: number; party_id: number; beam_id: number | null; warp_meter: number; date_sent: string; party: { name: string }; beam: { beam_no: string; quality: { name: string } } | null; }
interface Receipt { id: number; party_id: number; quality_id: number; bill_date: string; meters: number; party: { name: string }; quality: { name: string }; }

function today() { return new Date().toISOString().split("T")[0]; }

export default function JobworkPage() {
  const [parties, setParties] = useState<Party[]>([]);
  const [sent, setSent] = useState<Sent[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddParty, setShowAddParty] = useState(false);
  const [showAddReceipt, setShowAddReceipt] = useState(false);
  const [newParty, setNewParty] = useState({ name: "", contact: "" });
  const [receiptForm, setReceiptForm] = useState({ party_id: "", quality_id: "", bill_date: "", meters: "" });
  const [qualities, setQualities] = useState<any[]>([]);

  function load() {
    setLoading(true);
    Promise.all([
      supabase.from("jobwork_party").select("*").order("name"),
      supabase.from("jobwork_sent").select("*, party:party_id(name), beam:beam_id(beam_no, quality:quality_id(name))").order("date_sent", { ascending: false }),
      supabase.from("jobwork_receipt").select("*, party:party_id(name), quality:quality_id(name)").order("bill_date", { ascending: false }),
      supabase.from("quality_master").select("id, name").order("name"),
    ]).then(([p, s, r, q]) => {
      setParties(p.data || []);
      setSent(s.data || []);
      setReceipts(r.data || []);
      setQualities(q.data || []);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

  async function handleAddParty(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("jobwork_party").insert({ name: newParty.name.trim(), contact: newParty.contact.trim() || null });
    setNewParty({ name: "", contact: "" });
    setShowAddParty(false);
    load();
  }

  async function handleAddReceipt(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("jobwork_receipt").insert({
      party_id: Number(receiptForm.party_id),
      quality_id: Number(receiptForm.quality_id),
      bill_date: receiptForm.bill_date || today(),
      meters: Number(receiptForm.meters) || 0,
    });
    setReceiptForm({ party_id: "", quality_id: "", bill_date: "", meters: "" });
    setShowAddReceipt(false);
    load();
  }

  // Party summary
  const partySummary = parties.map((party) => {
    const sentTotal = sent.filter((s) => s.party_id === party.id).reduce((sum, s) => sum + s.warp_meter, 0);
    const recTotal = receipts.filter((r) => r.party_id === party.id).reduce((sum, r) => sum + r.meters, 0);
    return { ...party, sentTotal, recTotal, pending: sentTotal - recTotal };
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">🤝 Jobwork</h1>
        <div className="flex gap-3">
          <button onClick={() => setShowAddParty(true)} className="bg-slate-700 text-white px-4 py-2 rounded-lg hover:bg-slate-800 text-sm">
            + Add Party
          </button>
          <button onClick={() => setShowAddReceipt(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            + Record Receipt
          </button>
        </div>
      </div>

      {/* Party Summary */}
      <div className="bg-white rounded-xl shadow mb-6">
        <div className="px-5 py-3 border-b bg-slate-50">
          <h2 className="font-semibold text-slate-700">Party Summary</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs">
            <tr>
              <th className="text-left px-5 py-3 text-slate-600 font-semibold">Party</th>
              <th className="text-right px-5 py-3 text-slate-600 font-semibold">Sent (m)</th>
              <th className="text-right px-5 py-3 text-slate-600 font-semibold">Received (m)</th>
              <th className="text-right px-5 py-3 text-slate-600 font-semibold">Pending (m)</th>
            </tr>
          </thead>
          <tbody>
            {partySummary.map((p) => (
              <tr key={p.id} className="border-t hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">{p.name}</td>
                <td className="px-5 py-3 text-right">{p.sentTotal.toLocaleString()}</td>
                <td className="px-5 py-3 text-right">{p.recTotal.toLocaleString()}</td>
                <td className={`px-5 py-3 text-right font-bold ${p.pending > 0 ? "text-red-600" : "text-green-600"}`}>
                  {p.pending.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Sent Beams */}
        <div className="bg-white rounded-xl shadow">
          <div className="px-5 py-3 border-b bg-slate-50">
            <h2 className="font-semibold text-slate-700">📤 Sent Beams</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs">
              <tr>
                <th className="text-left px-4 py-2 text-slate-600 font-semibold">Party</th>
                <th className="text-left px-4 py-2 text-slate-600 font-semibold">Beam</th>
                <th className="text-right px-4 py-2 text-slate-600 font-semibold">Meters</th>
                <th className="text-right px-4 py-2 text-slate-600 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {sent.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-2 text-slate-600">{s.party?.name}</td>
                  <td className="px-4 py-2 text-slate-600">{s.beam?.beam_no || "—"}</td>
                  <td className="px-4 py-2 text-right">{s.warp_meter.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-slate-400 text-xs">{s.date_sent}</td>
                </tr>
              ))}
              {sent.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">No sent beams</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Received Meters */}
        <div className="bg-white rounded-xl shadow">
          <div className="px-5 py-3 border-b bg-slate-50">
            <h2 className="font-semibold text-slate-700">📥 Received Meters</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs">
              <tr>
                <th className="text-left px-4 py-2 text-slate-600 font-semibold">Party</th>
                <th className="text-left px-4 py-2 text-slate-600 font-semibold">Quality</th>
                <th className="text-right px-4 py-2 text-slate-600 font-semibold">Meters</th>
                <th className="text-right px-4 py-2 text-slate-600 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2 text-slate-600">{r.party?.name}</td>
                  <td className="px-4 py-2 text-slate-600">{r.quality?.name || "—"}</td>
                  <td className="px-4 py-2 text-right">{r.meters.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-slate-400 text-xs">{r.bill_date}</td>
                </tr>
              ))}
              {receipts.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">No receipts recorded</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Party Modal */}
      {showAddParty && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">🤝 Add Jobwork Party</h2>
            <form onSubmit={handleAddParty} className="space-y-4">
              <div>
                <label className="label">Party Name</label>
                <input type="text" value={newParty.name} onChange={(e) => setNewParty((p) => ({ ...p, name: e.target.value }))} className="input" required placeholder="e.g. XYZ Textiles" />
              </div>
              <div>
                <label className="label">Contact (optional)</label>
                <input type="text" value={newParty.contact} onChange={(e) => setNewParty((p) => ({ ...p, contact: e.target.value }))} className="input" placeholder="Phone or address" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">Add Party</button>
                <button type="button" onClick={() => setShowAddParty(false)} className="flex-1 bg-slate-200 text-slate-800 py-2 rounded-lg hover:bg-slate-300">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Receipt Modal */}
      {showAddReceipt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">📥 Record Jobwork Receipt</h2>
            <form onSubmit={handleAddReceipt} className="space-y-4">
              <div>
                <label className="label">Party</label>
                <select value={receiptForm.party_id} onChange={(e) => setReceiptForm((f) => ({ ...f, party_id: e.target.value }))} className="input" required>
                  <option value="">Select party</option>
                  {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Quality</label>
                <select value={receiptForm.quality_id} onChange={(e) => setReceiptForm((f) => ({ ...f, quality_id: e.target.value }))} className="input" required>
                  <option value="">Select quality</option>
                  {qualities.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Bill Date</label>
                <input type="date" value={receiptForm.bill_date} onChange={(e) => setReceiptForm((f) => ({ ...f, bill_date: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Meters Received</label>
                <input type="number" value={receiptForm.meters} onChange={(e) => setReceiptForm((f) => ({ ...f, meters: e.target.value }))} className="input" required placeholder="e.g. 3500" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">Save Receipt</button>
                <button type="button" onClick={() => setShowAddReceipt(false)} className="flex-1 bg-slate-200 text-slate-800 py-2 rounded-lg hover:bg-slate-300">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}