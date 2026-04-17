"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/db";

interface SettingRow { key: string; value: string; }

const SETTING_GROUPS = [
  {
    title: "Production Settings",
    items: [
      { key: "target_efficiency", label: "Target Efficiency (%)", type: "number" },
      { key: "c_constant", label: "C Constant", type: "number" },
      { key: "day_shift_mins", label: "Day Shift (mins)", type: "number" },
      { key: "night_shift_mins", label: "Night Shift (mins)", type: "number" },
      { key: "production_wastage", label: "Production Wastage Factor", type: "number" },
    ],
  },
  {
    title: "Alert Thresholds",
    items: [
      { key: "bhidan_alert_meters", label: "Bhidan Alert (meters remaining)", type: "number" },
      { key: "low_efficiency_alert", label: "Low Efficiency Alert (%)", type: "number" },
      { key: "high_stops_alert", label: "High Stops Alert (count)", type: "number" },
      { key: "bhidan_threshold_pct", label: "Bhidan Completion Threshold (%)", type: "number" },
    ],
  },
  {
    title: "Financial",
    items: [
      { key: "looms_salary_monthly", label: "Looms Salary (₹/month)", type: "number" },
      { key: "milgin_exp_monthly", label: "Milgin Expenses (₹/month)", type: "number" },
      { key: "emi_monthly", label: "EMI (₹/month)", type: "number" },
    ],
  },
  {
    title: "Security",
    items: [
      { key: "app_password", label: "App Password", type: "text" },
    ],
  },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from("settings").select("key, value").then(({ data }) => {
      if (data) {
        setSettings(Object.fromEntries(data.map((r: SettingRow) => [r.key, r.value])));
      }
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    const rows = Object.entries(settings).map(([key, value]) => ({ key, value }));
    const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  function handleChange(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">⚙️ Settings</h1>
        <div className="flex items-center gap-3">
          {saved && <span className="text-green-600 text-sm font-medium">Saved!</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {SETTING_GROUPS.map((group) => (
        <div key={group.title} className="bg-white rounded-xl shadow mb-6">
          <div className="px-5 py-3 border-b bg-slate-50">
            <h2 className="font-semibold text-slate-700">{group.title}</h2>
          </div>
          <div className="p-5 space-y-4">
            {group.items.map((item) => (
              <div key={item.key}>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {item.label}
                </label>
                <input
                  type={item.type}
                  value={settings[item.key] || ""}
                  onChange={(e) => handleChange(item.key, e.target.value)}
                  className="w-full max-w-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}