"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { Corner } from "./ScannerApp";

interface CornersScreenProps {
  image: HTMLImageElement;
  corners: Corner[];
  onCornersChange: (corners: Corner[]) => void;
  onScan: () => void;
  onBack: () => void;
}

export default function CornersScreen({
  image,
  corners,
  onCornersChange,
  onScan,
  onBack,
}: CornersScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

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

    // Draw dark overlay outside polygon
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, cw, ch);

    // Cut out the polygon area
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    corners.forEach((c, i) => {
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
    corners.forEach((c, i) => {
      const sx = c.x * s + ox;
      const sy = c.y * s + oy;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, ox, oy, iw * s, ih * s);
    ctx.restore();

    // Draw polygon outline
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    corners.forEach((c, i) => {
      const sx = c.x * s + ox;
      const sy = c.y * s + oy;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.stroke();

    // Draw edge midpoint lines (dashed)
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
    for (let i = 0; i < 4; i++) {
      const c1 = corners[i];
      const c2 = corners[(i + 1) % 4];
      ctx.beginPath();
      ctx.moveTo(c1.x * s + ox, c1.y * s + oy);
      ctx.lineTo(c2.x * s + ox, c2.y * s + oy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }, [image, corners, containerRef.current?.clientWidth]);

  // Convert screen coords to image coords
  const screenToImage = (sx: number, sy: number): Corner => ({
    x: (sx - offset.x) / scale,
    y: (sy - offset.y) / scale,
  });

  // Convert image coords to screen coords
  const imageToScreen = (c: Corner) => ({
    x: c.x * scale + offset.x,
    y: c.y * scale + offset.y,
  });

  // Find nearest corner
  const findNearestCorner = (sx: number, sy: number): number | null => {
    let minDist = 40; // threshold px
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

  // Pointer handlers
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

    // Clamp to image bounds
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
    // Slight delay for UI feedback
    requestAnimationFrame(() => {
      onScan();
      setProcessing(false);
    });
  };

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
        <span className="text-sm text-neutral-400">Ajusta las esquinas</span>
        <div className="w-16" />
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
          return (
            <div
              key={i}
              className="corner-handle"
              style={{ left: sc.x, top: sc.y }}
            />
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
          Arrastra los puntos azules para ajustar el área de escaneo
        </p>
      </div>
    </div>
  );
}
