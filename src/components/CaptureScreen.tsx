"use client";

import { useRef, useCallback } from "react";

interface CaptureScreenProps {
  onImageSelected: (img: HTMLImageElement) => void;
}

export default function CaptureScreen({ onImageSelected }: CaptureScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const loadImage = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => onImageSelected(img);
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    },
    [onImageSelected]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadImage(file);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) loadImage(file);
    },
    [loadImage]
  );

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8">
      {/* Hero */}
      <div className="text-center space-y-3 max-w-sm">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-white">
            <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M7 8h4M7 12h10M7 16h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="17" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold">PassportSnap</h1>
        <p className="text-neutral-400 text-sm leading-relaxed">
          Escanea pasaportes y documentos con tu celular. 
          Imagen limpia, recta, lista para trámites.
        </p>
        <div className="flex items-center justify-center gap-1 text-xs text-green-500">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" />
            <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          100% privado — nada sale de tu dispositivo
        </div>
      </div>

      {/* Capture area */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="w-full max-w-sm space-y-3"
      >
        {/* Camera button (primary) */}
        <button
          onClick={() => cameraInputRef.current?.click()}
          className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors flex items-center justify-center gap-3 text-lg font-medium pulse-scan"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2v11z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" />
          </svg>
          Tomar foto
        </button>

        {/* Upload button (secondary) */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-3 rounded-xl border border-neutral-700 hover:border-neutral-500 active:bg-neutral-800 transition-colors flex items-center justify-center gap-2 text-sm text-neutral-300"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Subir imagen existente
        </button>
      </div>

      {/* Hidden inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* How it works */}
      <div className="max-w-sm w-full pt-4 border-t border-neutral-800">
        <p className="text-xs text-neutral-500 text-center mb-3">Cómo funciona</p>
        <div className="flex justify-between text-center text-xs text-neutral-400 gap-4">
          <div className="flex-1 space-y-1">
            <div className="text-2xl">📸</div>
            <p>Toma foto</p>
          </div>
          <div className="flex-1 space-y-1">
            <div className="text-2xl">📐</div>
            <p>Ajusta esquinas</p>
          </div>
          <div className="flex-1 space-y-1">
            <div className="text-2xl">✨</div>
            <p>Escaneo limpio</p>
          </div>
        </div>
      </div>
    </div>
  );
}
