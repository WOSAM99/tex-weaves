"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/db";

interface Machine {
  id: number;
  machine_no: number;
  true_rpm: number;
}

export default function MachineMasterPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Machine | null>(null);
  const [rpm, setRpm] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    supabase.from("machine_master").select("*").order("machine_no").then(({ data }) => {
      setMachines(data || []);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

  async function handleSave(machineNo: number) {
    setSaving(true);
    await supabase.from("machine_master").upsert({ machine_no: machineNo, true_rpm: Number(rpm) || 547 }, { onConflict: "machine_no" });
    setSaving(false);
    setEditing(null);
    load();
  }

  function startEdit(m: Machine) {
    setEditing(m);
    setRpm(String(m.true_rpm));
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">⚙️ Machine Master</h1>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">Machine No</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">True RPM</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {machines.map((m) => (
              <tr key={m.id} className="border-t hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">Machine {m.machine_no}</td>
                <td className="px-4 py-3">
                  {editing?.id === m.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={rpm}
                        onChange={(e) => setRpm(e.target.value)}
                        className="border border-slate-300 rounded px-3 py-1 w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSave(m.machine_no)}
                        disabled={saving}
                        className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50 text-xs"
                      >
                        Save
                      </button>
                      <button onClick={() => setEditing(null)} className="bg-slate-200 px-3 py-1 rounded hover:bg-slate-300 text-xs">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span>{m.true_rpm}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {editing?.id !== m.id && (
                    <button onClick={() => startEdit(m)} className="text-blue-600 hover:underline text-xs">
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}