"use client";

import { useState, useRef, useEffect } from "react";
import { jsPDF } from "jspdf";
import type { DocType } from "./ScannerApp";

interface ResultScreenProps {
  resultSrc: string;
  originalSrc: string | null;
  onNewScan: () => void;
  docType: DocType;
}

export default function ResultScreen({ resultSrc, originalSrc, onNewScan, docType }: ResultScreenProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [bwMode, setBwMode] = useState(false);
  const [bwSrc, setBwSrc] = useState<string | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [sliderPos, setSliderPos] = useState(50);

  const displaySrc = bwMode && bwSrc ? bwSrc : resultSrc;
  const isPassport = docType === "passport";

  useEffect(() => {
    if (!bwMode || bwSrc) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = data[i + 1] = data[i + 2] = gray;
      }
      ctx.putImageData(imageData, 0, 0);
      setBwSrc(canvas.toDataURL("image/png"));
    };
    img.src = resultSrc;
  }, [bwMode, resultSrc, bwSrc]);

  const handleDownloadPNG = () => {
    const a = document.createElement("a");
    a.href = displaySrc;
    a.download = `${isPassport ? "passport" : "id"}-scan-${Date.now()}.png`;
    a.click();
  };

  const handleDownloadPDF = () => {
    const img = new Image();
    img.onload = () => {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "letter",
      });
      
      const pageW = 215.9;
      const pageH = 279.4;
      
      let imgW: number, imgH: number;
      if (isPassport) {
        // Passport: 114 × 162 mm (30% larger than actual size)
        imgW = 114;
        imgH = 162;
      } else {
        // ID: 114 × 72 mm (scaled up proportionally, ~33% larger than actual 85.6x54)
        imgW = 114;
        imgH = 72;
      }
      
      const x = (pageW - imgW) / 2;
      const y = (pageH - imgH) / 2;
      pdf.addImage(displaySrc, "PNG", x, y, imgW, imgH);
      pdf.save(`${isPassport ? "passport" : "id"}-scan-${Date.now()}.pdf`);
    };
    img.src = displaySrc;
  };

  const handleCopy = async () => {
    try {
      const response = await fetch(displaySrc);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      alert("Imagen copiada al portapapeles");
    } catch {
      alert("No se pudo copiar");
    }
  };

  const handleSliderMove = (e: React.PointerEvent | React.TouchEvent) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const pos = ((clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(0, Math.min(100, pos)));
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
        <button onClick={onNewScan}
          className="flex items-center gap-1 text-sm text-neutral-400 hover:text-white transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Nuevo
        </button>
        <span className={`text-sm font-medium ${isPassport ? "text-blue-400" : "text-green-400"}`}>
          {isPassport ? "Pasaporte" : "INE / Licencia"}
        </span>
        <div className="flex gap-2">
          {originalSrc && (
            <button
              onClick={() => setShowOriginal(!showOriginal)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                showOriginal ? "bg-purple-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              {showOriginal ? "Original" : "Comparar"}
            </button>
          )}
          <button
            onClick={() => setBwMode(!bwMode)}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
              bwMode ? "bg-neutral-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            B&N
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 bg-neutral-950">
        {showOriginal && originalSrc ? (
          <div
            ref={sliderRef}
            className="relative w-full max-w-md overflow-hidden rounded-xl cursor-ew-resize select-none"
            onPointerMove={handleSliderMove}
            onTouchMove={handleSliderMove}
            style={{ touchAction: "none" }}
          >
            <img src={displaySrc} alt="Escaneado" className="w-full" draggable={false} />
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
            >
              <img src={originalSrc} alt="Original" className="w-full" draggable={false} />
            </div>
            <div
              className="absolute top-0 bottom-0 w-1 bg-white shadow-lg"
              style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M8 12H4m0 0l3-3m-3 3l3 3M16 12h4m0 0l-3-3m3 3l-3 3" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>
        ) : (
          <img src={displaySrc} alt="Escaneado" className="max-w-full max-h-full rounded-xl shadow-2xl" />
        )}
      </div>

      <div className="px-4 py-4 border-t border-neutral-800">
        <div className="flex gap-3">
          <button onClick={handleDownloadPNG}
            className="flex-1 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            PNG
          </button>
          <button onClick={handleDownloadPDF}
            className={`flex-1 py-3 rounded-xl transition-colors flex items-center justify-center gap-2 ${
              isPassport ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"
            }`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            PDF
          </button>
          <button onClick={handleCopy}
            className="py-3 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
