"use client";

import { useState, useRef, useEffect } from "react";
import { jsPDF } from "jspdf";
import type { DocType } from "./ScannerApp";

interface ResultScreenProps {
  resultSrc: string | null;
  originalSrc: string | null;
  onNewScan: () => void;
  docType: DocType;
  idFrontResult: string | null;
  idBackResult: string | null;
}

export default function ResultScreen({ 
  resultSrc, originalSrc, onNewScan, docType, idFrontResult, idBackResult 
}: ResultScreenProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [bwMode, setBwMode] = useState(false);
  const [bwFront, setBwFront] = useState<string | null>(null);
  const [bwBack, setBwBack] = useState<string | null>(null);
  const [bwResult, setBwResult] = useState<string | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [sliderPos, setSliderPos] = useState(50);

  const isPassport = docType === "passport";
  const isID = docType === "id";
  const isDocument = docType === "document";
  const hasIDDual = isID && idFrontResult && idBackResult;

  useEffect(() => {
    if (!bwMode) return;
    
    const convertToBW = (src: string, callback: (result: string) => void) => {
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
        callback(canvas.toDataURL("image/png"));
      };
      img.src = src;
    };

    if (isID && idFrontResult && !bwFront) convertToBW(idFrontResult, setBwFront);
    if (isID && idBackResult && !bwBack) convertToBW(idBackResult, setBwBack);
    if ((isPassport || isDocument) && resultSrc && !bwResult) convertToBW(resultSrc, setBwResult);
  }, [bwMode, isID, isPassport, isDocument, idFrontResult, idBackResult, resultSrc, bwFront, bwBack, bwResult]);

  const displayFront = bwMode && bwFront ? bwFront : idFrontResult;
  const displayBack = bwMode && bwBack ? bwBack : idBackResult;
  const displayResult = bwMode && bwResult ? bwResult : resultSrc;

  const handleDownloadPNG = () => {
    if (hasIDDual) {
      const aFront = document.createElement("a");
      aFront.href = displayFront!;
      aFront.download = `id-front-${Date.now()}.png`;
      aFront.click();
      setTimeout(() => {
        const aBack = document.createElement("a");
        aBack.href = displayBack!;
        aBack.download = `id-back-${Date.now()}.png`;
        aBack.click();
      }, 500);
    } else {
      const a = document.createElement("a");
      a.href = displayResult!;
      a.download = `${isDocument ? "document" : "passport"}-scan-${Date.now()}.png`;
      a.click();
    }
  };

  const handleDownloadPDF = () => {
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "letter",
    });
    
    const pageW = 215.9;
    const pageH = 279.4;
    
    if (hasIDDual && displayFront && displayBack) {
      // INE: 70 × 44mm (ratio 1.585), gap 12mm, no labels
      const imgW = 70;
      const imgH = 44;
      const gap = 12;
      const x = (pageW - imgW) / 2;
      const totalH = imgH * 2 + gap;
      const startY = (pageH - totalH) / 2;
      
      const imgFront = new Image();
      imgFront.onload = () => {
        pdf.addImage(displayFront, "PNG", x, startY, imgW, imgH);
        
        const imgBack = new Image();
        imgBack.onload = () => {
          const backY = startY + imgH + gap;
          pdf.addImage(displayBack, "PNG", x, backY, imgW, imgH);
          pdf.save(`ine-scan-${Date.now()}.pdf`);
        };
        imgBack.src = displayBack;
      };
      imgFront.src = displayFront;
    } else if (displayResult) {
      let imgW: number, imgH: number;
      if (isDocument) {
        // Document: larger, almost full page with margins
        imgW = 180;
        imgH = 233; // Letter ratio
      } else {
        // Passport
        imgW = 114;
        imgH = 162;
      }
      const x = (pageW - imgW) / 2;
      const y = (pageH - imgH) / 2;
      
      const img = new Image();
      img.onload = () => {
        pdf.addImage(displayResult, "PNG", x, y, imgW, imgH);
        pdf.save(`${isDocument ? "document" : "passport"}-scan-${Date.now()}.pdf`);
      };
      img.src = displayResult;
    }
  };

  const handleCopy = async () => {
    try {
      const src = hasIDDual ? displayFront : displayResult;
      if (!src) return;
      const response = await fetch(src);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      alert(hasIDDual ? "Frente copiado al portapapeles" : "Imagen copiada al portapapeles");
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

  const getTextColor = () => {
    if (isDocument) return "text-amber-400";
    if (isID) return "text-green-400";
    return "text-blue-400";
  };

  const getButtonColor = () => {
    if (isDocument) return "bg-amber-600 hover:bg-amber-700";
    if (isID) return "bg-green-600 hover:bg-green-700";
    return "bg-blue-600 hover:bg-blue-700";
  };

  const getTitle = () => {
    if (isDocument) return "Documento";
    if (isID) return "INE / Licencia";
    return "Pasaporte";
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
        <span className={`text-sm font-medium ${getTextColor()}`}>
          {getTitle()}
        </span>
        <div className="flex gap-2">
          {!hasIDDual && originalSrc && (
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

      <div className="flex-1 flex items-center justify-center p-4 bg-neutral-950 overflow-auto">
        {hasIDDual ? (
          <div className="flex flex-col gap-4 max-w-md w-full">
            <div className="text-center">
              <p className="text-xs text-green-400 mb-2 font-medium">FRENTE</p>
              <img src={displayFront!} alt="Frente" className="w-full rounded-xl shadow-2xl" />
            </div>
            <div className="text-center">
              <p className="text-xs text-green-400 mb-2 font-medium">REVERSO</p>
              <img src={displayBack!} alt="Reverso" className="w-full rounded-xl shadow-2xl" />
            </div>
          </div>
        ) : showOriginal && originalSrc && displayResult ? (
          <div
            ref={sliderRef}
            className="relative w-full max-w-md overflow-hidden rounded-xl cursor-ew-resize select-none"
            onPointerMove={handleSliderMove}
            onTouchMove={handleSliderMove}
            style={{ touchAction: "none" }}
          >
            <img src={displayResult} alt="Escaneado" className="w-full" draggable={false} />
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
        ) : displayResult ? (
          <img src={displayResult} alt="Escaneado" className="max-w-full max-h-full rounded-xl shadow-2xl" />
        ) : null}
      </div>

      <div className="px-4 py-4 border-t border-neutral-800">
        <div className="flex gap-3">
          <button onClick={handleDownloadPNG}
            className="flex-1 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            PNG{hasIDDual && " (2)"}
          </button>
          <button onClick={handleDownloadPDF}
            className={`flex-1 py-3 rounded-xl transition-colors flex items-center justify-center gap-2 ${getButtonColor()}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            PDF{hasIDDual && " (ambos)"}
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
