"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/db";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "app_password")
      .single();

    if (data?.value === password) {
      // Set cookie for middleware auth
      document.cookie = "auth=ok; path=/; max-age=86400";
      router.push("/dashboard");
    } else {
      setError("Incorrect password");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-800 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Tex Weaves</h1>
          <p className="text-sm text-slate-500 mt-1">Production Management System</p>
        </div>

        <form onSubmit={handleLogin}>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Enter Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••"
            autoFocus
          />

          {error && (
            <p className="text-red-600 text-sm mb-4">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}