"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import CaptureScreen from "./CaptureScreen";
import CornersScreen from "./CornersScreen";
import ResultScreen from "./ResultScreen";

export type Corner = { x: number; y: number };
export type AppScreen = "capture" | "corners" | "result";
// 6 points: TL, TC (top-center/fold), TR, BR, BC (bottom-center/fold), BL
// Order: [TL, TC, TR, BR, BC, BL]

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
  const [useFoldMode, setUseFoldMode] = useState(true); // 6-point mode by default

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

  // Generate default 6 points (or 4)
  const getDefaultCorners = (w: number, h: number, foldMode: boolean): Corner[] => {
    const m = 0.05;
    if (foldMode) {
      // 6 points: TL, TC, TR, BR, BC, BL
      return [
        { x: w * m, y: h * m },           // TL
        { x: w * 0.5, y: h * m },         // TC (fold top)
        { x: w * (1 - m), y: h * m },     // TR
        { x: w * (1 - m), y: h * (1 - m) }, // BR
        { x: w * 0.5, y: h * (1 - m) },   // BC (fold bottom)
        { x: w * m, y: h * (1 - m) },     // BL
      ];
    }
    // 4 points: TL, TR, BR, BL
    return [
      { x: w * m, y: h * m },
      { x: w * (1 - m), y: h * m },
      { x: w * (1 - m), y: h * (1 - m) },
      { x: w * m, y: h * (1 - m) },
    ];
  };

  // When user selects/captures an image
  const handleImageSelected = useCallback(
    (img: HTMLImageElement) => {
      setSourceImage(img);
      setOriginalForCompare(img.src);

      const w = img.naturalWidth;
      const h = img.naturalHeight;

      if (cvReady && !useFoldMode) {
        const detected = detectCorners4(img);
        setCorners(detected);
      } else {
        setCorners(getDefaultCorners(w, h, useFoldMode));
      }
      setScreen("corners");
    },
    [cvReady, useFoldMode]
  );

  // Detect 4 document corners using OpenCV
  const detectCorners4 = (img: HTMLImageElement): Corner[] => {
    const cv = window.cv;
    if (!cv || !cv.Mat) {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      return getDefaultCorners(w, h, false);
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
        return orderCorners4(pts);
      }

      contours.delete();
      hierarchy.delete();
    } catch (e) {
      console.warn("Corner detection failed:", e);
    } finally {
      src.delete();
      gray.delete();
      blurred.delete();
      edges.delete();
    }

    return getDefaultCorners(img.naturalWidth, img.naturalHeight, false);
  };

  // Order 4 corners: TL, TR, BR, BL
  const orderCorners4 = (pts: Corner[]): Corner[] => {
    const sorted = [...pts].sort((a, b) => a.y - b.y);
    const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
    const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
    return [top[0], top[1], bottom[1], bottom[0]];
  };

  // Process: perspective correction + enhancement
  const handleScan = useCallback(() => {
    if (!sourceImage) return;

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
      // Passport open: 125mm × 88mm → 1750 × 1232 px
      const outW = 1750;
      const outH = 1232;
      const halfW = Math.round(outW / 2);

      let finalCanvas: HTMLCanvasElement;

      if (useFoldMode && corners.length === 6) {
        // 6-POINT MODE: Process left and right halves separately
        // Points: [TL(0), TC(1), TR(2), BR(3), BC(4), BL(5)]
        const [TL, TC, TR, BR, BC, BL] = corners;

        // LEFT HALF: TL → TC → BC → BL
        const srcLeft = cv.matFromArray(4, 1, cv.CV_32FC2, [
          TL.x, TL.y,
          TC.x, TC.y,
          BC.x, BC.y,
          BL.x, BL.y,
        ]);
        const dstLeft = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0,
          halfW, 0,
          halfW, outH,
          0, outH,
        ]);

        const mLeft = cv.getPerspectiveTransform(srcLeft, dstLeft);
        const warpedLeft = new cv.Mat();
        cv.warpPerspective(src, warpedLeft, mLeft, new cv.Size(halfW, outH), cv.INTER_CUBIC);

        // RIGHT HALF: TC → TR → BR → BC
        const srcRight = cv.matFromArray(4, 1, cv.CV_32FC2, [
          TC.x, TC.y,
          TR.x, TR.y,
          BR.x, BR.y,
          BC.x, BC.y,
        ]);
        const dstRight = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0,
          halfW, 0,
          halfW, outH,
          0, outH,
        ]);

        const mRight = cv.getPerspectiveTransform(srcRight, dstRight);
        const warpedRight = new cv.Mat();
        cv.warpPerspective(src, warpedRight, mRight, new cv.Size(halfW, outH), cv.INTER_CUBIC);

        // Enhance each half
        const enhLeft = enhanceImage(cv, warpedLeft);
        const enhRight = enhanceImage(cv, warpedRight);

        // Stitch together
        finalCanvas = document.createElement("canvas");
        finalCanvas.width = outW;
        finalCanvas.height = outH;

        const canvasLeft = document.createElement("canvas");
        canvasLeft.width = halfW;
        canvasLeft.height = outH;
        cv.imshow(canvasLeft, enhLeft);

        const canvasRight = document.createElement("canvas");
        canvasRight.width = halfW;
        canvasRight.height = outH;
        cv.imshow(canvasRight, enhRight);

        const fCtx = finalCanvas.getContext("2d")!;
        fCtx.drawImage(canvasLeft, 0, 0);
        fCtx.drawImage(canvasRight, halfW, 0);

        // Cleanup
        srcLeft.delete(); dstLeft.delete(); mLeft.delete(); warpedLeft.delete();
        srcRight.delete(); dstRight.delete(); mRight.delete(); warpedRight.delete();
        enhLeft.delete(); enhRight.delete();
      } else {
        // 4-POINT MODE: Standard single perspective transform
        const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
          corners[0].x, corners[0].y,
          corners[1].x, corners[1].y,
          corners[2].x, corners[2].y,
          corners[3].x, corners[3].y,
        ]);
        const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0,
          outW, 0,
          outW, outH,
          0, outH,
        ]);

        const M = cv.getPerspectiveTransform(srcPts, dstPts);
        const warped = new cv.Mat();
        cv.warpPerspective(src, warped, M, new cv.Size(outW, outH), cv.INTER_CUBIC);

        const enhanced = enhanceImage(cv, warped);

        finalCanvas = document.createElement("canvas");
        finalCanvas.width = outW;
        finalCanvas.height = outH;
        cv.imshow(finalCanvas, enhanced);

        srcPts.delete(); dstPts.delete(); M.delete(); warped.delete(); enhanced.delete();
      }

      setResultImage(finalCanvas.toDataURL("image/png"));
    } catch (e) {
      console.error("Scan processing error:", e);
      alert("Error procesando la imagen. Intenta de nuevo.");
    } finally {
      src.delete();
    }

    setScreen("result");
  }, [sourceImage, corners, useFoldMode]);

  // Enhance scanned image
  const enhanceImage = (cv: any, src: any): any => {
    const result = src.clone();

    try {
      const channels = new cv.MatVector();
      cv.split(result, channels);

      for (let i = 0; i < 3; i++) {
        const ch = channels.get(i);
        const chFloat = new cv.Mat();
        const bgCh = new cv.Mat();
        const normCh = new cv.Mat();

        ch.convertTo(chFloat, cv.CV_32F);
        cv.GaussianBlur(chFloat, bgCh, new cv.Size(51, 51), 0);
        cv.divide(chFloat, bgCh, normCh, 255.0);
        normCh.convertTo(ch, cv.CV_8U);

        chFloat.delete();
        bgCh.delete();
        normCh.delete();
      }

      cv.merge(channels, result);

      // Sharpen
      const sharpKernel = cv.matFromArray(3, 3, cv.CV_32FC1, [
        0, -0.5, 0,
        -0.5, 3, -0.5,
        0, -0.5, 0,
      ]);
      const sharpened = new cv.Mat();
      cv.filter2D(result, sharpened, -1, sharpKernel);
      sharpened.copyTo(result);

      channels.delete();
      sharpKernel.delete();
      sharpened.delete();
    } catch (e) {
      console.warn("Enhancement error:", e);
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
            foldMode={useFoldMode}
            onFoldModeChange={setUseFoldMode}
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
