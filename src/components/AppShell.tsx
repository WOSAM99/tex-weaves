"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Production", href: "/dashboard", icon: "📊" },
  { label: "Shift Entry", href: "/shift-entry", icon: "✏️" },
  { label: "Beam Management", href: "/beam", icon: "🧶" },
  { label: "Quality Master", href: "/quality-master", icon: "🏷️" },
  { label: "Machine Master", href: "/machine-master", icon: "⚙️" },
  { label: "Cost Sheet", href: "/cost-sheet", icon: "💰" },
  { label: "Jobwork", href: "/jobwork", icon: "🤝" },
  { label: "Monthly Summary", href: "/monthly-summary", icon: "📅" },
  { label: "Settings", href: "/settings", icon: "🔧" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-800 text-white flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <h1 className="text-lg font-bold text-blue-400">Tex Weaves</h1>
          <p className="text-xs text-slate-400">Production Management</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm transition ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-700"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-700 text-xs text-slate-500">
          © Tex Weaves 2025-26
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}