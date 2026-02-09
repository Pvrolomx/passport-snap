"use client";

import { useState, useCallback, useEffect } from "react";
import CaptureScreen from "./CaptureScreen";
import CornersScreen from "./CornersScreen";
import ResultScreen from "./ResultScreen";

export type Corner = { x: number; y: number };
export type AppScreen = "capture" | "corners" | "result";
export type DocType = "passport" | "id"; // passport = portrait 6pts, id = landscape 4pts

declare global {
  interface Window {
    cv: any;
    onOpenCvReady: () => void;
  }
}

export default function ScannerApp() {
  const [screen, setScreen] = useState<AppScreen>("capture");
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [corners, setCorners] = useState<Corner[]>([]);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [originalForCompare, setOriginalForCompare] = useState<string | null>(null);
  const [cvReady, setCvReady] = useState(false);
  const [cvLoading, setCvLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [docType, setDocType] = useState<DocType>("passport");
  const [useFoldMode, setUseFoldMode] = useState(true); // only for passport

  useEffect(() => {
    if (typeof window !== "undefined" && window.cv && window.cv.Mat) {
      setCvReady(true);
      return;
    }
    setCvLoading(true);
    window.onOpenCvReady = () => {
      if (window.cv && window.cv.Mat) {
        setCvReady(true);
        setCvLoading(false);
      } else {
        window.cv["onRuntimeInitialized"] = () => {
          setCvReady(true);
          setCvLoading(false);
        };
      }
    };
    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.9.0/opencv.js";
    script.async = true;
    script.onload = () => {
      if (window.cv && typeof window.cv.then === "function") {
        window.cv.then((cv: any) => {
          window.cv = cv;
          setCvReady(true);
          setCvLoading(false);
        });
      }
    };
    script.onerror = () => {
      setCvLoading(false);
      alert("Error cargando OpenCV. Recarga la página.");
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  // Default corners based on doc type
  const getDefaultCorners = (w: number, h: number, type: DocType, foldMode: boolean): Corner[] => {
    const m = 0.05;
    if (type === "id") {
      // ID/License: always 4 points
      return [
        { x: w * m, y: h * m },
        { x: w * (1 - m), y: h * m },
        { x: w * (1 - m), y: h * (1 - m) },
        { x: w * m, y: h * (1 - m) },
      ];
    }
    // Passport with optional fold
    if (foldMode) {
      return [
        { x: w * m, y: h * m },
        { x: w * (1 - m), y: h * m },
        { x: w * (1 - m), y: h * (1 - m) },
        { x: w * m, y: h * (1 - m) },
        { x: w * m, y: h * 0.5 },
        { x: w * (1 - m), y: h * 0.5 },
      ];
    }
    return [
      { x: w * m, y: h * m },
      { x: w * (1 - m), y: h * m },
      { x: w * (1 - m), y: h * (1 - m) },
      { x: w * m, y: h * (1 - m) },
    ];
  };

  const handleImageSelected = useCallback(
    (img: HTMLImageElement) => {
      setSourceImage(img);
      setOriginalForCompare(img.src);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const foldEnabled = docType === "passport" && useFoldMode;
      setCorners(getDefaultCorners(w, h, docType, foldEnabled));
      setScreen("corners");
    },
    [docType, useFoldMode]
  );

  const handleScan = useCallback(() => {
    if (!sourceImage) return;
    const cv = window.cv;
    if (!cv || !cv.Mat) { alert("OpenCV no está listo."); return; }

    const canvas = document.createElement("canvas");
    canvas.width = sourceImage.naturalWidth;
    canvas.height = sourceImage.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(sourceImage, 0, 0);
    const src = cv.imread(canvas);

    try {
      let outW: number, outH: number;
      
      if (docType === "id") {
        // ID/License: 85.6mm × 54mm → landscape at 300 DPI = 1011 × 638 px
        outW = 1011;
        outH = 638;
      } else {
        // Passport: portrait 1232 × 1750
        outW = 1232;
        outH = 1750;
      }

      let finalCanvas: HTMLCanvasElement;
      const foldEnabled = docType === "passport" && useFoldMode && corners.length === 6;

      if (foldEnabled) {
        // 6-POINT MODE for passport
        const halfH = Math.round(outH / 2);
        const [TL, TR, BR, BL, ML, MR] = corners;

        const srcTop = cv.matFromArray(4, 1, cv.CV_32FC2, [
          TL.x, TL.y, TR.x, TR.y, MR.x, MR.y, ML.x, ML.y,
        ]);
        const dstTop = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0, outW, 0, outW, halfH, 0, halfH,
        ]);
        const mTop = cv.getPerspectiveTransform(srcTop, dstTop);
        const warpedTop = new cv.Mat();
        cv.warpPerspective(src, warpedTop, mTop, new cv.Size(outW, halfH), cv.INTER_CUBIC);

        const srcBot = cv.matFromArray(4, 1, cv.CV_32FC2, [
          ML.x, ML.y, MR.x, MR.y, BR.x, BR.y, BL.x, BL.y,
        ]);
        const dstBot = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0, outW, 0, outW, halfH, 0, halfH,
        ]);
        const mBot = cv.getPerspectiveTransform(srcBot, dstBot);
        const warpedBot = new cv.Mat();
        cv.warpPerspective(src, warpedBot, mBot, new cv.Size(outW, halfH), cv.INTER_CUBIC);

        const enhTop = enhanceImage(cv, warpedTop);
        const enhBot = enhanceImage(cv, warpedBot);

        finalCanvas = document.createElement("canvas");
        finalCanvas.width = outW;
        finalCanvas.height = outH;

        const cTop = document.createElement("canvas");
        cTop.width = outW; cTop.height = halfH;
        cv.imshow(cTop, enhTop);

        const cBot = document.createElement("canvas");
        cBot.width = outW; cBot.height = halfH;
        cv.imshow(cBot, enhBot);

        const fCtx = finalCanvas.getContext("2d")!;
        fCtx.drawImage(cTop, 0, 0);
        fCtx.drawImage(cBot, 0, halfH);

        srcTop.delete(); dstTop.delete(); mTop.delete(); warpedTop.delete();
        srcBot.delete(); dstBot.delete(); mBot.delete(); warpedBot.delete();
        enhTop.delete(); enhBot.delete();
      } else {
        // 4-POINT MODE (both passport without fold and ID)
        const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
          corners[0].x, corners[0].y, corners[1].x, corners[1].y,
          corners[2].x, corners[2].y, corners[3].x, corners[3].y,
        ]);
        const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0, outW, 0, outW, outH, 0, outH,
        ]);
        const M = cv.getPerspectiveTransform(srcPts, dstPts);
        const warped = new cv.Mat();
        cv.warpPerspective(src, warped, M, new cv.Size(outW, outH), cv.INTER_CUBIC);
        const enhanced = enhanceImage(cv, warped);

        finalCanvas = document.createElement("canvas");
        finalCanvas.width = outW; finalCanvas.height = outH;
        cv.imshow(finalCanvas, enhanced);

        srcPts.delete(); dstPts.delete(); M.delete(); warped.delete(); enhanced.delete();
      }

      setResultImage(finalCanvas.toDataURL("image/png"));
    } catch (e) {
      console.error("Scan error:", e);
      alert("Error procesando. Intenta de nuevo.");
    } finally { src.delete(); }

    setScreen("result");
  }, [sourceImage, corners, docType, useFoldMode]);

  const enhanceImage = (cv: any, src: any): any => {
    const result = src.clone();
    try {
      const channels = new cv.MatVector();
      cv.split(result, channels);
      for (let i = 0; i < 3; i++) {
        const ch = channels.get(i);
        const chF = new cv.Mat(); const bgCh = new cv.Mat(); const normCh = new cv.Mat();
        ch.convertTo(chF, cv.CV_32F);
        cv.GaussianBlur(chF, bgCh, new cv.Size(71, 71), 0);
        cv.divide(chF, bgCh, normCh, 238.0);
        normCh.convertTo(ch, cv.CV_8U);
        chF.delete(); bgCh.delete(); normCh.delete();
      }
      cv.merge(channels, result);
      channels.delete();

      const floatImg = new cv.Mat();
      result.convertTo(floatImg, cv.CV_32F, 1.0 / 255.0);
      const gammaCorrected = new cv.Mat();
      cv.pow(floatImg, 0.7, gammaCorrected);
      const blended = new cv.Mat();
      cv.addWeighted(gammaCorrected, 0.55, floatImg, 0.45, 0, blended);
      blended.convertTo(result, cv.CV_8U, 255.0);
      floatImg.delete(); gammaCorrected.delete(); blended.delete();

      const contrasted = new cv.Mat();
      result.convertTo(contrasted, -1, 0.95, 3);
      contrasted.copyTo(result);
      contrasted.delete();

      const kernel = cv.matFromArray(3, 3, cv.CV_32FC1, [0,-0.25,0,-0.25,2.0,-0.25,0,-0.25,0]);
      const sharp = new cv.Mat();
      cv.filter2D(result, sharp, -1, kernel);
      sharp.copyTo(result);
      kernel.delete(); sharp.delete();
    } catch (e) { console.warn("Enhancement error:", e); }
    return result;
  };

  const handleReset = () => {
    setScreen("capture");
    setSourceImage(null);
    setCorners([]);
    setResultImage(null);
    setOriginalForCompare(null);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-blue-500">
            <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M7 8h4M7 12h10M7 16h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="17" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span className="font-semibold text-sm">PassportSnap</span>
        </div>
        <div className="flex items-center gap-2">
          {cvLoading && (
            <span className="text-xs text-neutral-500 flex items-center gap-1">
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              OpenCV
            </span>
          )}
          {cvReady && (
            <span className="text-xs text-neutral-500 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              Listo
            </span>
          )}
          {installPrompt && (
            <button onClick={handleInstall}
              className="text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-full transition-colors">
              Instalar
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {screen === "capture" && (
          <CaptureScreen 
            onImageSelected={handleImageSelected}
            docType={docType}
            onDocTypeChange={setDocType}
          />
        )}
        {screen === "corners" && sourceImage && (
          <CornersScreen
            image={sourceImage}
            corners={corners}
            onCornersChange={setCorners}
            onScan={handleScan}
            onBack={handleReset}
            docType={docType}
            foldMode={docType === "passport" && useFoldMode}
            onFoldModeChange={setUseFoldMode}
          />
        )}
        {screen === "result" && resultImage && (
          <ResultScreen 
            resultSrc={resultImage} 
            originalSrc={originalForCompare} 
            onNewScan={handleReset}
            docType={docType}
          />
        )}
      </main>

      <footer className="text-center text-xs text-neutral-600 py-2 border-t border-neutral-800">
        Hecho por duendes.app 2026 — Tu documento nunca sale del dispositivo
      </footer>
    </div>
  );
}
