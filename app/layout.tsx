import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { Nav } from "@/components/Nav";
import { SWRegister } from "@/components/SWRegister";

export const metadata: Metadata = {
  title: "Badminton Club",
  description: "Badminton club management — sessions, rankings and more.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "Badminton Club", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-slate-50 text-slate-900 antialiased">
        <AuthProvider>
          <Nav />
          <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 md:pb-12">
            {children}
          </main>
        </AuthProvider>
        <SWRegister />
      </body>
    </html>
  );
}
