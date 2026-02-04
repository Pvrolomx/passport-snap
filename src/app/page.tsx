"use client";

import dynamic from "next/dynamic";

const ScannerApp = dynamic(() => import("@/components/ScannerApp"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full spin-scan mx-auto" />
        <p className="text-neutral-400">Cargando PassportSnap...</p>
      </div>
    </div>
  ),
});

export default function Home() {
  return <ScannerApp />;
}
