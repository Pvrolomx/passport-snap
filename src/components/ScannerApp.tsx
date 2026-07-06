"use client";

import { useState, useCallback, useEffect } from "react";
import CaptureScreen from "./CaptureScreen";
import CornersScreen from "./CornersScreen";
import ResultScreen from "./ResultScreen";

export type Corner = { x: number; y: number };
export type AppScreen = "capture" | "corners" | "result";
export type DocType = "passport" | "id" | "document"; // document = contracts, acts (B&W aggressive)
export type IDSide = "front" | "back";

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
  const [useFoldMode, setUseFoldMode] = useState(true);
  
  const [idSide, setIdSide] = useState<IDSide>("front");
  const [idFrontResult, setIdFrontResult] = useState<string | null>(null);
  const [idBackResult, setIdBackResult] = useState<string | null>(null);
  const [documentPages, setDocumentPages] = useState<string[]>([]);
  const [documentSize, setDocumentSize] = useState<"letter" | "oficio">("letter");

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

  const getDefaultCorners = (w: number, h: number, type: DocType, foldMode: boolean): Corner[] => {
    const m = 0.05;
    // ID and Document are landscape, Passport is portrait with optional fold
    if (type === "id" || type === "document") {
      return [
        { x: w * m, y: h * m },
        { x: w * (1 - m), y: h * m },
        { x: w * (1 - m), y: h * (1 - m) },
        { x: w * m, y: h * (1 - m) },
      ];
    }
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

  const detectDocumentCorners = (cv: any, img: HTMLImageElement, w: number, h: number): Corner[] | null => {
    try {
      // Redimensionar a max 1000px para reducir ruido y acelerar Canny
      const maxDim = 1000;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const sw = Math.round(w * scale);
      const sh = Math.round(h * scale);

      const canvas = document.createElement("canvas");
      canvas.width = sw; canvas.height = sh;
      canvas.getContext("2d")!.drawImage(img, 0, 0, sw, sh);
      const src = cv.imread(canvas);

      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      const blurred = new cv.Mat();
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      const edges = new cv.Mat();
      cv.Canny(blurred, edges, 75, 200);

      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      console.log("=== DETECCIÓN DE DOCUMENTO ===");
      console.log("Imagen original:", w, "x", h, "| Procesando:", sw, "x", sh, "| scale:", scale.toFixed(3));
      console.log("Contornos encontrados:", contours.size());

      let bestCorners: Corner[] | null = null;
      let maxArea = 0;

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);
        const minArea = sw * sh * 0.05;
        if (area < minArea) { contour.delete(); continue; }

        const peri = cv.arcLength(contour, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, 0.02 * peri, true);

        console.log(`Contorno ${i}: área=${area.toFixed(0)}, vértices=${approx.rows}`);

        if (approx.rows === 4 && area > maxArea) {
          maxArea = area;
          const pts: Corner[] = [];
          for (let j = 0; j < 4; j++) {
            pts.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] });
          }
          pts.sort((a, b) => a.y - b.y);
          const top = pts.slice(0, 2).sort((a, b) => a.x - b.x);
          const bot = pts.slice(2, 4).sort((a, b) => a.x - b.x);
          bestCorners = [top[0], top[1], bot[1], bot[0]];
          console.log("✅ Documento detectado (escalado):", bestCorners);
        }
        approx.delete();
        contour.delete();
      }

      // Escalar corners de vuelta a coordenadas originales
      if (bestCorners) {
        bestCorners = bestCorners.map(c => ({ x: Math.round(c.x / scale), y: Math.round(c.y / scale) }));
        console.log("✅ Corners en coordenadas originales:", bestCorners);
      }
      console.log("Resultado:", bestCorners ? "detectado" : "fallback a default");

      src.delete(); gray.delete(); blurred.delete();
      edges.delete(); contours.delete(); hierarchy.delete();

      return bestCorners;
    } catch (e) {
      console.error("❌ Error en detección:", e);
      return null;
    }
  };

  const handleImageSelected = useCallback(
    (img: HTMLImageElement) => {
      setSourceImage(img);
      setOriginalForCompare(img.src);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const foldEnabled = docType === "passport" && useFoldMode;

      const cv = (window as any).cv;
      const detected = (cv && cv.Mat) ? detectDocumentCorners(cv, img, w, h) : null;
      setCorners(detected ?? getDefaultCorners(w, h, docType, foldEnabled));
      setScreen("corners");
    },
    [docType, useFoldMode]
  );

  const processImage = (sourceImg: HTMLImageElement, cornersPts: Corner[]): string | null => {
    const cv = window.cv;
    if (!cv || !cv.Mat) return null;

    const canvas = document.createElement("canvas");
    canvas.width = sourceImg.naturalWidth;
    canvas.height = sourceImg.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(sourceImg, 0, 0);
    const src = cv.imread(canvas);

    try {
      let outW: number, outH: number;
      
      if (docType === "id") {
        // ID card: 85.6mm × 54mm at 300 DPI
        outW = 1011;
        outH = 638;
      } else if (docType === "document") {
        // Document: Letter or Oficio at 200 DPI
        outW = 1700;
        outH = documentSize === "oficio" ? 2677 : 2200;
      } else {
        // Passport: portrait
        outW = 1232;
        outH = 1750;
      }

      let finalCanvas: HTMLCanvasElement;
      const foldEnabled = docType === "passport" && useFoldMode && cornersPts.length === 6;

      if (foldEnabled) {
        const halfH = Math.round(outH / 2);
        const [TL, TR, BR, BL, ML, MR] = cornersPts;

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

        const enhTop = enhanceImage(cv, warpedTop, docType);
        const enhBot = enhanceImage(cv, warpedBot, docType);

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
        const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
          cornersPts[0].x, cornersPts[0].y, cornersPts[1].x, cornersPts[1].y,
          cornersPts[2].x, cornersPts[2].y, cornersPts[3].x, cornersPts[3].y,
        ]);
        const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0, outW, 0, outW, outH, 0, outH,
        ]);
        const M = cv.getPerspectiveTransform(srcPts, dstPts);
        const warped = new cv.Mat();
        cv.warpPerspective(src, warped, M, new cv.Size(outW, outH), cv.INTER_CUBIC);
        const enhanced = enhanceImage(cv, warped, docType);

        finalCanvas = document.createElement("canvas");
        finalCanvas.width = outW; finalCanvas.height = outH;
        cv.imshow(finalCanvas, enhanced);

        srcPts.delete(); dstPts.delete(); M.delete(); warped.delete(); enhanced.delete();
      }

      src.delete();
      return finalCanvas.toDataURL("image/png");
    } catch (e) {
      console.error("Scan error:", e);
      src.delete();
      return null;
    }
  };

  const handleScan = useCallback(() => {
    if (!sourceImage) return;
    
    const result = processImage(sourceImage, corners);
    if (!result) {
      alert("Error procesando. Intenta de nuevo.");
      return;
    }

    if (docType === "id") {
      if (idSide === "front") {
        setIdFrontResult(result);
        setIdSide("back");
        setScreen("capture");
        setSourceImage(null);
        setCorners([]);
      } else {
        setIdBackResult(result);
        setResultImage(result);
        setScreen("result");
      }
    } else {
      // Document mode: accumulate pages
      setDocumentPages(prev => [...prev, result]);
      setResultImage(result);
      setScreen("result");
    }
  }, [sourceImage, corners, docType, idSide, useFoldMode]);

  // Enhancement: LAB + CLAHE + controlled enhancement (all modes)
  const enhanceImage = (cv: any, src: any, type: DocType): any => {
    const result = src.clone();
    try {
      // 1. Convert to LAB color space
      const rgb = new cv.Mat();
      cv.cvtColor(result, rgb, cv.COLOR_RGBA2RGB);
      const lab = new cv.Mat();
      cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
      rgb.delete();

      // 2. CLAHE on L channel (clipLimit=3.0, tileGridSize 8x8)
      const labChannels = new cv.MatVector();
      cv.split(lab, labChannels);
      
      const lChannel = labChannels.get(0);
      const clahe = new cv.CLAHE(3.0, new cv.Size(8, 8));
      const lEnhanced = new cv.Mat();
      clahe.apply(lChannel, lEnhanced);
      lEnhanced.copyTo(lChannel);
      lEnhanced.delete();
      clahe.delete();

      cv.merge(labChannels, lab);
      labChannels.delete();

      // Convert back to RGB then RGBA
      const rgbResult = new cv.Mat();
      cv.cvtColor(lab, rgbResult, cv.COLOR_Lab2RGB);
      lab.delete();
      cv.cvtColor(rgbResult, result, cv.COLOR_RGB2RGBA);
      rgbResult.delete();

      // 3. Gamma 0.85 (brightens mid-tones without crushing)
      const floatImg = new cv.Mat();
      result.convertTo(floatImg, cv.CV_32F, 1.0 / 255.0);
      const gammaCorrected = new cv.Mat();
      cv.pow(floatImg, 0.85, gammaCorrected);
      gammaCorrected.convertTo(result, cv.CV_8U, 255.0);
      floatImg.delete(); gammaCorrected.delete();

      // 4. Contrast: alpha=1.2, beta=5
      const contrasted = new cv.Mat();
      result.convertTo(contrasted, -1, 1.2, 5);
      contrasted.copyTo(result);
      contrasted.delete();

      // 4b. White point correction (documento only): push light grays to pure white
      // so the paper background comes out clean instead of grayish/dirty.
      // INE/Pasaporte skip this to preserve photo mid-tones.
      if (type === "document") {
        const data = result.data;
        const WHITE_THRESHOLD = 200; // pixels con luminosidad > 200 → blanco
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum > WHITE_THRESHOLD) {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
          }
        }
      }

      // 5. Sharpen kernel: [-0.5,-0.5,-0.5 / -0.5,5.0,-0.5 / -0.5,-0.5,-0.5]
      const kernel = cv.matFromArray(3, 3, cv.CV_32FC1, [
        -0.5, -0.5, -0.5,
        -0.5,  5.0, -0.5,
        -0.5, -0.5, -0.5
      ]);
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
    setIdSide("front");
    setIdFrontResult(null);
    setIdBackResult(null);
    setDocumentPages([]);
  };

  const handleAddPage = () => {
    setScreen("capture");
    setSourceImage(null);
    setCorners([]);
    setResultImage(null);
    setOriginalForCompare(null);
  };

  const handleIDFrontOnly = useCallback(() => {
    setResultImage(idFrontResult);
    setScreen("result");
  }, [idFrontResult]);

  const handleDeletePage = (index: number) => {
    setDocumentPages(prev => {
      const updated = prev.filter((_, i) => i !== index);
      // Update resultImage to last remaining page or null
      if (updated.length > 0) {
        setResultImage(updated[updated.length - 1]);
      } else {
        setResultImage(null);
        setScreen("capture");
      }
      return updated;
    });
  };

  const handleFinishPDF = () => {
    if (documentPages.length === 0) return;
    const { jsPDF } = require("jspdf");
    const isOficio = documentSize === "oficio";
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: isOficio ? [215.9, 339.85] : "letter" });
    const pageW = 215.9;
    const pageH = isOficio ? 339.85 : 279.4;
    const imgW = 180;
    const imgH = isOficio ? 290 : 233;
    const x = (pageW - imgW) / 2;
    const y = (pageH - imgH) / 2;

    const addPage = (index: number) => {
      if (index >= documentPages.length) {
        pdf.save(`documento-${Date.now()}.pdf`);
        return;
      }
      const img = new Image();
      img.onload = () => {
        if (index > 0) pdf.addPage();
        pdf.addImage(documentPages[index], "PNG", x, y, imgW, imgH);
        addPage(index + 1);
      };
      img.src = documentPages[index];
    };
    addPage(0);
  };

  const handleDocTypeChange = (type: DocType) => {
    setDocType(type);
    setIdSide("front");
    setIdFrontResult(null);
    setIdBackResult(null);
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
            onDocTypeChange={handleDocTypeChange}
            idSide={idSide}
            idFrontResult={idFrontResult}
            onReset={handleReset}
            documentSize={documentSize}
            onDocumentSizeChange={setDocumentSize}
            onIDFrontOnly={handleIDFrontOnly}
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
            idSide={idSide}
          />
        )}
        {screen === "result" && (
          <ResultScreen 
            resultSrc={resultImage} 
            originalSrc={originalForCompare} 
            onNewScan={handleReset}
            docType={docType}
            idFrontResult={idFrontResult}
            idBackResult={idBackResult}
            documentPages={documentPages}
            onAddPage={handleAddPage}
            onDeletePage={handleDeletePage}
            onFinishPDF={handleFinishPDF}
          />
        )}
      </main>

      <footer className="text-center text-xs text-neutral-600 py-2 border-t border-neutral-800">
        Hecho por duendes.app 2026 — Tu documento nunca sale del dispositivo
      </footer>
    </div>
  );
}










