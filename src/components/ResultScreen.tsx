"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { jsPDF } from "jspdf";

interface ResultScreenProps {
  resultSrc: string;
  originalSrc: string | null;
  onNewScan: () => void;
}

export default function ResultScreen({
  resultSrc,
  originalSrc,
  onNewScan,
}: ResultScreenProps) {
  const [showComparison, setShowComparison] = useState(false);
  const [sliderPos, setSliderPos] = useState(50);
  const [bw, setBw] = useState(false);
  const compRef = useRef<HTMLDivElement>(null);
  const [displaySrc, setDisplaySrc] = useState(resultSrc);

  // B&W toggle
  useEffect(() => {
    if (!bw) {
      setDisplaySrc(resultSrc);
      return;
    }

    const canvas = document.createElement("canvas");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        // Apply threshold for cleaner B&W
        const val = gray > 180 ? 255 : gray < 80 ? 0 : gray;
        data[i] = data[i + 1] = data[i + 2] = val;
      }
      ctx.putImageData(imageData, 0, 0);
      setDisplaySrc(canvas.toDataURL("image/png"));
    };
    img.src = resultSrc;
  }, [bw, resultSrc]);

  // Download PNG
  const downloadPNG = () => {
    const a = document.createElement("a");
    a.href = displaySrc;
    a.download = `passport-scan-${Date.now()}.png`;
    a.click();
  };

  // Download PDF
  const downloadPDF = () => {
    const img = new Image();
    img.onload = () => {
      // Passport open: 125mm × 88mm
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [88, 125],
      });
      pdf.addImage(displaySrc, "PNG", 0, 0, 88, 125);
      pdf.save(`passport-scan-${Date.now()}.pdf`);
    };
    img.src = displaySrc;
  };

  // Copy to clipboard
  const copyToClipboard = async () => {
    try {
      const res = await fetch(displaySrc);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      alert("Imagen copiada al portapapeles");
    } catch {
      alert("No se pudo copiar. Usa descargar en su lugar.");
    }
  };

  // Comparison slider
  const handleSliderMove = useCallback((e: React.PointerEvent) => {
    const rect = compRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    setSliderPos(Math.max(0, Math.min(100, (x / rect.width) * 100)));
  }, []);

  return (
    <div className="flex-1 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
        <button
          onClick={onNewScan}
          className="flex items-center gap-1 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Nuevo
        </button>
        <span className="text-sm font-medium text-green-400">✓ Escaneo listo</span>
        <div className="flex gap-2">
          {originalSrc && (
            <button
              onClick={() => setShowComparison(!showComparison)}
              className={`text-xs px-2 py-1 rounded-md transition-colors ${
                showComparison
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              A/B
            </button>
          )}
          <button
            onClick={() => setBw(!bw)}
            className={`text-xs px-2 py-1 rounded-md transition-colors ${
              bw
                ? "bg-blue-600 text-white"
                : "bg-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            B/N
          </button>
        </div>
      </div>

      {/* Result image */}
      <div className="flex-1 relative flex items-center justify-center p-4 overflow-hidden">
        {showComparison && originalSrc ? (
          <div
            ref={compRef}
            className="comparison-container relative w-full max-w-2xl aspect-[1.42/1] rounded-lg overflow-hidden"
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              handleSliderMove(e);
            }}
            onPointerMove={(e) => {
              if (e.buttons > 0) handleSliderMove(e);
            }}
            style={{ touchAction: "none" }}
          >
            {/* Original (background) */}
            <img
              src={originalSrc}
              alt="Original"
              className="absolute inset-0 w-full h-full object-contain"
            />
            {/* Result (clipped) */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${sliderPos}%` }}
            >
              <img
                src={displaySrc}
                alt="Escaneado"
                className="absolute inset-0 w-full h-full object-contain"
                style={{ width: `${100 / (sliderPos / 100)}%`, maxWidth: "none" }}
              />
            </div>
            {/* Slider line */}
            <div
              className="comparison-slider"
              style={{ left: `${sliderPos}%` }}
            />
            {/* Labels */}
            <div className="absolute bottom-2 left-2 text-xs bg-black/60 px-2 py-1 rounded">
              Original
            </div>
            <div className="absolute bottom-2 right-2 text-xs bg-black/60 px-2 py-1 rounded">
              Escaneado
            </div>
          </div>
        ) : (
          <img
            src={displaySrc}
            alt="Documento escaneado"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl img-fade-in"
          />
        )}
      </div>

      {/* Action buttons */}
      <div className="px-4 py-4 border-t border-neutral-800 space-y-3">
        <div className="flex gap-2">
          <button
            onClick={downloadPNG}
            className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors flex items-center justify-center gap-2 font-medium"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            PNG
          </button>
          <button
            onClick={downloadPDF}
            className="flex-1 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 transition-colors flex items-center justify-center gap-2 font-medium"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            PDF
          </button>
          <button
            onClick={copyToClipboard}
            className="py-3 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 transition-colors flex items-center justify-center"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <button
          onClick={onNewScan}
          className="w-full py-2.5 rounded-xl border border-neutral-700 hover:border-neutral-500 transition-colors text-sm text-neutral-300"
        >
          Nuevo escaneo
        </button>
      </div>
    </div>
  );
}
