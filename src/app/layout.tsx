import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tex Weaves — Production Management",
  description: "Internal production management system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}