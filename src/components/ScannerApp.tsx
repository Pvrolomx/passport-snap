"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import CaptureScreen from "./CaptureScreen";
import CornersScreen from "./CornersScreen";
import ResultScreen from "./ResultScreen";

export type Corner = { x: number; y: number };
export type AppScreen = "capture" | "corners" | "result";

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

  // Load OpenCV.js
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
        // cv module loaded but needs initialization
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
      // OpenCV.js calls onOpenCvReady when ready
      // But also handle the case where cv is a promise
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

    return () => {
      // cleanup not needed, script stays loaded
    };
  }, []);

  // PWA install prompt
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

  // When user selects/captures an image
  const handleImageSelected = useCallback(
    (img: HTMLImageElement) => {
      setSourceImage(img);
      setOriginalForCompare(img.src);

      if (cvReady) {
        const detected = detectCorners(img);
        setCorners(detected);
      } else {
        // Default corners at ~10% inset
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const m = 0.05;
        setCorners([
          { x: w * m, y: h * m },
          { x: w * (1 - m), y: h * m },
          { x: w * (1 - m), y: h * (1 - m) },
          { x: w * m, y: h * (1 - m) },
        ]);
      }
      setScreen("corners");
    },
    [cvReady]
  );

  // Detect document corners using OpenCV
  const detectCorners = (img: HTMLImageElement): Corner[] => {
    const cv = window.cv;
    if (!cv || !cv.Mat) {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const m = 0.05;
      return [
        { x: w * m, y: h * m },
        { x: w * (1 - m), y: h * m },
        { x: w * (1 - m), y: h * (1 - m) },
        { x: w * m, y: h * (1 - m) },
      ];
    }

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    const src = cv.imread(canvas);
    const gray = new cv.Mat();
    const blurred = new cv.Mat();
    const edges = new cv.Mat();

    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      cv.Canny(blurred, edges, 75, 200);

      // Dilate to close gaps
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      cv.dilate(edges, edges, kernel);
      kernel.delete();

      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let bestContour: any = null;
      let bestArea = 0;
      const imgArea = img.naturalWidth * img.naturalHeight;

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);

        if (area > imgArea * 0.15 && area > bestArea) {
          const peri = cv.arcLength(contour, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(contour, approx, 0.02 * peri, true);

          if (approx.rows === 4) {
            bestContour = approx;
            bestArea = area;
          } else {
            approx.delete();
          }
        }
      }

      if (bestContour) {
        const pts: Corner[] = [];
        for (let i = 0; i < 4; i++) {
          pts.push({
            x: bestContour.data32S[i * 2],
            y: bestContour.data32S[i * 2 + 1],
          });
        }
        bestContour.delete();
        contours.delete();
        hierarchy.delete();

        // Order: top-left, top-right, bottom-right, bottom-left
        return orderCorners(pts);
      }

      contours.delete();
      hierarchy.delete();
    } catch (e) {
      console.warn("Corner detection failed, using defaults:", e);
    } finally {
      src.delete();
      gray.delete();
      blurred.delete();
      edges.delete();
    }

    // Fallback
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const m = 0.05;
    return [
      { x: w * m, y: h * m },
      { x: w * (1 - m), y: h * m },
      { x: w * (1 - m), y: h * (1 - m) },
      { x: w * m, y: h * (1 - m) },
    ];
  };

  // Order corners: TL, TR, BR, BL
  const orderCorners = (pts: Corner[]): Corner[] => {
    const center = {
      x: pts.reduce((s, p) => s + p.x, 0) / 4,
      y: pts.reduce((s, p) => s + p.y, 0) / 4,
    };

    const tl = pts.filter((p) => p.x < center.x && p.y < center.y)[0];
    const tr = pts.filter((p) => p.x >= center.x && p.y < center.y)[0];
    const br = pts.filter((p) => p.x >= center.x && p.y >= center.y)[0];
    const bl = pts.filter((p) => p.x < center.x && p.y >= center.y)[0];

    if (tl && tr && br && bl) return [tl, tr, br, bl];

    // Fallback sort
    const sorted = [...pts].sort((a, b) => a.y - b.y);
    const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
    const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
    return [top[0], top[1], bottom[1], bottom[0]];
  };

  // Process image: perspective correction + enhancement
  const handleScan = useCallback(() => {
    if (!sourceImage || corners.length !== 4) return;

    const cv = window.cv;
    if (!cv || !cv.Mat) {
      alert("OpenCV no está listo. Espera un momento.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = sourceImage.naturalWidth;
    canvas.height = sourceImage.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(sourceImage, 0, 0);

    const src = cv.imread(canvas);

    try {
      // Passport open: 125mm × 88mm → ratio 1.42:1
      // Output at 300 DPI equivalent
      const outW = 1750;
      const outH = 1232;

      // Source points (from user-adjusted corners)
      const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        corners[0].x, corners[0].y,
        corners[1].x, corners[1].y,
        corners[2].x, corners[2].y,
        corners[3].x, corners[3].y,
      ]);

      // Destination points
      const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,
        outW, 0,
        outW, outH,
        0, outH,
      ]);

      // Perspective transform
      const M = cv.getPerspectiveTransform(srcPts, dstPts);
      const warped = new cv.Mat();
      cv.warpPerspective(src, warped, M, new cv.Size(outW, outH), cv.INTER_CUBIC);

      // Enhancement pipeline
      const enhanced = enhanceImage(cv, warped);

      // Output to canvas
      const outCanvas = document.createElement("canvas");
      outCanvas.width = outW;
      outCanvas.height = outH;
      cv.imshow(outCanvas, enhanced);

      setResultImage(outCanvas.toDataURL("image/png"));

      // Cleanup
      srcPts.delete();
      dstPts.delete();
      M.delete();
      warped.delete();
      enhanced.delete();
    } catch (e) {
      console.error("Scan processing error:", e);
      alert("Error procesando la imagen. Intenta de nuevo.");
    } finally {
      src.delete();
    }

    setScreen("result");
  }, [sourceImage, corners]);

  // Enhance scanned image
  const enhanceImage = (cv: any, src: any): any => {
    const result = src.clone();

    try {
      // 1. Normalize illumination
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // Large blur to estimate background illumination
      const bg = new cv.Mat();
      cv.GaussianBlur(gray, bg, new cv.Size(51, 51), 0);

      // Divide original by background to normalize
      const normalized = new cv.Mat();
      cv.divide(gray, bg, normalized, 255.0);

      // 2. Adaptive threshold for text mask
      const textMask = new cv.Mat();
      cv.adaptiveThreshold(normalized, textMask, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 21, 10);

      // 3. Merge: use color image but with improved contrast
      // Convert normalized back to color
      const channels = new cv.MatVector();
      cv.split(result, channels);

      for (let i = 0; i < 3; i++) {
        const ch = channels.get(i);
        const chFloat = new cv.Mat();
        const bgCh = new cv.Mat();
        const normCh = new cv.Mat();

        ch.convertTo(chFloat, cv.CV_32F);
        cv.GaussianBlur(chFloat, bgCh, new cv.Size(51, 51), 0);

        // Normalize each channel
        cv.divide(chFloat, bgCh, normCh, 255.0);
        normCh.convertTo(ch, cv.CV_8U);

        chFloat.delete();
        bgCh.delete();
        normCh.delete();
      }

      cv.merge(channels, result);

      // 4. Sharpen slightly
      const sharpKernel = cv.matFromArray(3, 3, cv.CV_32FC1, [
        0, -0.5, 0,
        -0.5, 3, -0.5,
        0, -0.5, 0,
      ]);
      const sharpened = new cv.Mat();
      cv.filter2D(result, sharpened, -1, sharpKernel);
      sharpened.copyTo(result);

      // Cleanup
      gray.delete();
      bg.delete();
      normalized.delete();
      textMask.delete();
      channels.delete();
      sharpKernel.delete();
      sharpened.delete();
    } catch (e) {
      console.warn("Enhancement error, returning unenhanced:", e);
    }

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
      {/* Header */}
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
            <button
              onClick={handleInstall}
              className="text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-full transition-colors"
            >
              Instalar
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {screen === "capture" && (
          <CaptureScreen onImageSelected={handleImageSelected} />
        )}
        {screen === "corners" && sourceImage && (
          <CornersScreen
            image={sourceImage}
            corners={corners}
            onCornersChange={setCorners}
            onScan={handleScan}
            onBack={handleReset}
          />
        )}
        {screen === "result" && resultImage && (
          <ResultScreen
            resultSrc={resultImage}
            originalSrc={originalForCompare}
            onNewScan={handleReset}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-600 py-2 border-t border-neutral-800">
        Hecho por duendes.app 2026 — Tu documento nunca sale del dispositivo
      </footer>
    </div>
  );
}
