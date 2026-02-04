"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { Corner } from "./ScannerApp";

interface CornersScreenProps {
  image: HTMLImageElement;
  corners: Corner[];
  onCornersChange: (corners: Corner[]) => void;
  onScan: () => void;
  onBack: () => void;
  foldMode: boolean;
  onFoldModeChange: (v: boolean) => void;
}

// Point labels for 6-point mode
const LABELS_6 = ["TL", "TC", "TR", "BR", "BC", "BL"];
// Edges for 6-point: TL→TC, TC→TR, TR→BR, BR→BC, BC→BL, BL→TL
const EDGES_6 = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0]];
// Fold line: TC→BC
const FOLD_EDGE = [1, 4];

// Edges for 4-point: TL→TR, TR→BR, BR→BL, BL→TL
const EDGES_4 = [[0,1],[1,2],[2,3],[3,0]];

export default function CornersScreen({
  image,
  corners,
  onCornersChange,
  onScan,
  onBack,
  foldMode,
  onFoldModeChange,
}: CornersScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const edges = foldMode ? EDGES_6 : EDGES_4;

  // When toggling fold mode, reset corners
  const handleToggleFold = () => {
    const newMode = !foldMode;
    onFoldModeChange(newMode);
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    const m = 0.05;
    if (newMode) {
      // Switch to 6 points
      onCornersChange([
        { x: w * m, y: h * m },
        { x: w * 0.5, y: h * m },
        { x: w * (1 - m), y: h * m },
        { x: w * (1 - m), y: h * (1 - m) },
        { x: w * 0.5, y: h * (1 - m) },
        { x: w * m, y: h * (1 - m) },
      ]);
    } else {
      // Switch to 4 points
      onCornersChange([
        { x: w * m, y: h * m },
        { x: w * (1 - m), y: h * m },
        { x: w * (1 - m), y: h * (1 - m) },
        { x: w * m, y: h * (1 - m) },
      ]);
    }
  };

  // Draw image and overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !image) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const iw = image.naturalWidth;
    const ih = image.naturalHeight;

    const s = Math.min(cw / iw, ch / ih);
    const ox = (cw - iw * s) / 2;
    const oy = (ch - ih * s) / 2;

    setScale(s);
    setOffset({ x: ox, y: oy });

    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d")!;

    // Draw image
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(image, ox, oy, iw * s, ih * s);

    // Dark overlay
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, cw, ch);

    // Cut out polygon
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    const polyOrder = foldMode ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3];
    polyOrder.forEach((idx, i) => {
      const c = corners[idx];
      if (!c) return;
      const sx = c.x * s + ox;
      const sy = c.y * s + oy;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Redraw image inside polygon
    ctx.save();
    ctx.beginPath();
    polyOrder.forEach((idx, i) => {
      const c = corners[idx];
      if (!c) return;
      const sx = c.x * s + ox;
      const sy = c.y * s + oy;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, ox, oy, iw * s, ih * s);
    ctx.restore();

    // Draw edges
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    edges.forEach(([a, b]) => {
      const ca = corners[a];
      const cb = corners[b];
      if (!ca || !cb) return;
      ctx.beginPath();
      ctx.moveTo(ca.x * s + ox, ca.y * s + oy);
      ctx.lineTo(cb.x * s + ox, cb.y * s + oy);
      ctx.stroke();
    });

    // Draw fold line (dashed, different color)
    if (foldMode && corners.length === 6) {
      const ct = corners[FOLD_EDGE[0]];
      const cb = corners[FOLD_EDGE[1]];
      if (ct && cb) {
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(ct.x * s + ox, ct.y * s + oy);
        ctx.lineTo(cb.x * s + ox, cb.y * s + oy);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }, [image, corners, foldMode]);

  const imageToScreen = (c: Corner) => ({
    x: c.x * scale + offset.x,
    y: c.y * scale + offset.y,
  });

  const screenToImage = (sx: number, sy: number): Corner => ({
    x: (sx - offset.x) / scale,
    y: (sy - offset.y) / scale,
  });

  const findNearestCorner = (sx: number, sy: number): number | null => {
    let minDist = 40;
    let nearest: number | null = null;
    corners.forEach((c, i) => {
      const sc = imageToScreen(c);
      const d = Math.hypot(sc.x - sx, sc.y - sy);
      if (d < minDist) {
        minDist = d;
        nearest = i;
      }
    });
    return nearest;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const idx = findNearestCorner(sx, sy);
    if (idx !== null) {
      setDragging(idx);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragging === null) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const imgCoord = screenToImage(sx, sy);

    imgCoord.x = Math.max(0, Math.min(image.naturalWidth, imgCoord.x));
    imgCoord.y = Math.max(0, Math.min(image.naturalHeight, imgCoord.y));

    const newCorners = [...corners];
    newCorners[dragging] = imgCoord;
    onCornersChange(newCorners);
  };

  const handlePointerUp = () => {
    setDragging(null);
  };

  const handleScan = () => {
    setProcessing(true);
    requestAnimationFrame(() => {
      onScan();
      setProcessing(false);
    });
  };

  // Determine if a point is a fold point
  const isFoldPoint = (i: number) => foldMode && (i === 1 || i === 4);

  return (
    <div className="flex-1 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Atrás
        </button>
        <span className="text-sm text-neutral-400">Ajusta los puntos</span>
        {/* Fold mode toggle */}
        <button
          onClick={handleToggleFold}
          className={`text-xs px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
            foldMode
              ? "bg-amber-600 text-white"
              : "bg-neutral-800 text-neutral-400 hover:text-white"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" />
            <rect x="3" y="5" width="18" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {foldMode ? "6 pts" : "4 pts"}
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 relative select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ touchAction: "none" }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        {/* Draggable corner handles */}
        {corners.map((c, i) => {
          const sc = imageToScreen(c);
          const fold = isFoldPoint(i);
          return (
            <div
              key={i}
              className={fold ? "fold-handle" : "corner-handle"}
              style={{ left: sc.x, top: sc.y }}
            >
              {fold && (
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-amber-400 font-bold whitespace-nowrap">
                  DOBLEZ
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom bar */}
      <div className="px-4 py-4 border-t border-neutral-800 space-y-2">
        <button
          onClick={handleScan}
          disabled={processing}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 text-lg font-medium"
        >
          {processing ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full spin-scan" />
              Procesando...
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M4 4h4M4 4v4M20 4h-4M20 4v4M4 20h4M4 20v-4M20 20h-4M20 20v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M2 12h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" />
              </svg>
              Escanear
            </>
          )}
        </button>
        <p className="text-xs text-neutral-500 text-center">
          {foldMode
            ? "Arrastra los 6 puntos — los amarillos marcan el doblez central"
            : "Arrastra los 4 puntos azules para ajustar el área"}
        </p>
      </div>
    </div>
  );
}
