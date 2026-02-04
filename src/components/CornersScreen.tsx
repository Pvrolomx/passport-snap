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

// 6-point: [TL(0), TR(1), BR(2), BL(3), ML(4), MR(5)]
// Polygon order for clipping: TL → TR → MR → BR → BL → ML (going around)
// But for overlay we use: TL, TR, BR, BL as outer + ML,MR as fold
const OUTER_POLY_6 = [0, 1, 2, 3]; // TL, TR, BR, BL
const EDGES_6 = [[0,1],[1,2],[2,3],[3,0],[4,5]]; // outer edges + fold line
const FOLD_EDGE = [4, 5]; // ML → MR

const EDGES_4 = [[0,1],[1,2],[2,3],[3,0]];

export default function CornersScreen({
  image, corners, onCornersChange, onScan, onBack, foldMode, onFoldModeChange,
}: CornersScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleToggleFold = () => {
    const newMode = !foldMode;
    onFoldModeChange(newMode);
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    const m = 0.05;
    if (newMode) {
      onCornersChange([
        { x: w * m, y: h * m },
        { x: w * (1 - m), y: h * m },
        { x: w * (1 - m), y: h * (1 - m) },
        { x: w * m, y: h * (1 - m) },
        { x: w * m, y: h * 0.5 },
        { x: w * (1 - m), y: h * 0.5 },
      ]);
    } else {
      onCornersChange([
        { x: w * m, y: h * m },
        { x: w * (1 - m), y: h * m },
        { x: w * (1 - m), y: h * (1 - m) },
        { x: w * m, y: h * (1 - m) },
      ]);
    }
  };

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

    // Cut out the outer polygon (4 corners always)
    const outerIdx = [0, 1, 2, 3];
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    outerIdx.forEach((idx, i) => {
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
    outerIdx.forEach((idx, i) => {
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

    // Draw outer edges (blue solid)
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    EDGES_4.forEach(([a, b]) => {
      const ca = corners[a];
      const cb = corners[b];
      if (!ca || !cb) return;
      ctx.beginPath();
      ctx.moveTo(ca.x * s + ox, ca.y * s + oy);
      ctx.lineTo(cb.x * s + ox, cb.y * s + oy);
      ctx.stroke();
    });

    // Draw fold line (amber dashed)
    if (foldMode && corners.length === 6) {
      const ml = corners[4];
      const mr = corners[5];
      if (ml && mr) {
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        ctx.moveTo(ml.x * s + ox, ml.y * s + oy);
        ctx.lineTo(mr.x * s + ox, mr.y * s + oy);
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
    let minDist = 44;
    let nearest: number | null = null;
    corners.forEach((c, i) => {
      const sc = imageToScreen(c);
      const d = Math.hypot(sc.x - sx, sc.y - sy);
      if (d < minDist) { minDist = d; nearest = i; }
    });
    return nearest;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const idx = findNearestCorner(e.clientX - rect.left, e.clientY - rect.top);
    if (idx !== null) {
      setDragging(idx);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragging === null) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const imgCoord = screenToImage(e.clientX - rect.left, e.clientY - rect.top);
    imgCoord.x = Math.max(0, Math.min(image.naturalWidth, imgCoord.x));
    imgCoord.y = Math.max(0, Math.min(image.naturalHeight, imgCoord.y));
    const nc = [...corners];
    nc[dragging] = imgCoord;
    onCornersChange(nc);
  };

  const handlePointerUp = () => setDragging(null);

  const handleScan = () => {
    setProcessing(true);
    requestAnimationFrame(() => { onScan(); setProcessing(false); });
  };

  const isFoldPoint = (i: number) => foldMode && (i === 4 || i === 5);

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
        <button onClick={onBack}
          className="flex items-center gap-1 text-sm text-neutral-400 hover:text-white transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Atrás
        </button>
        <span className="text-sm text-neutral-400">Ajusta los puntos</span>
        <button onClick={handleToggleFold}
          className={`text-xs px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
            foldMode ? "bg-amber-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"
          }`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" />
            <rect x="3" y="5" width="18" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {foldMode ? "6 pts" : "4 pts"}
        </button>
      </div>

      <div ref={containerRef} className="flex-1 relative select-none"
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
        style={{ touchAction: "none" }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        {corners.map((c, i) => {
          const sc = imageToScreen(c);
          const fold = isFoldPoint(i);
          return (
            <div key={i} className={fold ? "fold-handle" : "corner-handle"}
              style={{ left: sc.x, top: sc.y }}>
              {fold && (
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-amber-400 font-bold whitespace-nowrap">
                  DOBLEZ
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-4 py-4 border-t border-neutral-800 space-y-2">
        <button onClick={handleScan} disabled={processing}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 text-lg font-medium">
          {processing ? (
            <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full spin-scan" />Procesando...</>
          ) : (
            <><svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 4h4M4 4v4M20 4h-4M20 4v4M4 20h4M4 20v-4M20 20h-4M20 20v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M2 12h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" />
            </svg>Escanear</>
          )}
        </button>
        <p className="text-xs text-neutral-500 text-center">
          {foldMode
            ? "Arrastra los 6 puntos — los amarillos marcan el doblez horizontal"
            : "Arrastra los 4 puntos azules para ajustar el área"}
        </p>
      </div>
    </div>
  );
}
