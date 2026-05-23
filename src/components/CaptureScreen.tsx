"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { DocType, IDSide } from "./ScannerApp";

interface CaptureScreenProps {
  onImageSelected: (img: HTMLImageElement) => void;
  docType: DocType;
  onDocTypeChange: (type: DocType) => void;
  idSide: IDSide;
  idFrontResult: string | null;
  onReset: () => void;
  documentSize: "letter" | "oficio";
  onDocumentSizeChange: (size: "letter" | "oficio") => void;
}

export default function CaptureScreen({ 
  onImageSelected, docType, onDocTypeChange, idSide, idFrontResult, onReset,
  documentSize, onDocumentSizeChange
}: CaptureScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const isID = docType === "id";
  const isDocument = docType === "document";
  const isCapturingBack = isID && idSide === "back";

  const handleFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => onImageSelected(img);
    img.src = url;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      setStream(mediaStream);
      setCameraActive(true);
      // srcObject se asigna en useEffect cuando el <video> ya existe en el DOM
    } catch (err) {
      alert("No se pudo acceder a la cámara");
    }
  };

  const stopCamera = () => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setCameraActive(false);
  };

  useEffect(() => {
    if (cameraActive && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [cameraActive, stream]);

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);
    stopCamera();
    const img = new Image();
    img.onload = () => onImageSelected(img);
    img.src = canvas.toDataURL("image/jpeg", 0.95);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) handleFile(file);
  }, []);

  const getButtonColor = () => {
    if (isDocument) return "bg-amber-600";
    if (isID) return "bg-green-600";
    return "bg-blue-600";
  };

  const getAccentColor = () => {
    if (isDocument) return "border-amber-600";
    if (isID) return "border-green-600";
    return "border-blue-600";
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4">
      {/* Doc Type Selector - only show if not capturing back */}
      {!isCapturingBack && (
        <div className="mb-6 flex gap-1.5 p-1 bg-neutral-900 rounded-xl">
          <button
            onClick={() => onDocTypeChange("passport")}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              docType === "passport"
                ? "bg-blue-600 text-white shadow-lg"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 16h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Pasaporte
          </button>
          <button
            onClick={() => onDocTypeChange("id")}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              docType === "id"
                ? "bg-green-600 text-white shadow-lg"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="8" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M13 10h6M13 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            INE
          </button>
          <button
            onClick={() => onDocTypeChange("document")}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              docType === "document"
                ? "bg-amber-600 text-white shadow-lg"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.5" />
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Documento
          </button>
        </div>
      )}

      {/* Document size selector */}
      {isDocument && !isCapturingBack && (
        <div className="mb-4 flex gap-2 justify-center">
          <button
            onClick={() => onDocumentSizeChange("letter")}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
              documentSize === "letter"
                ? "bg-amber-600 text-white"
                : "bg-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            Carta
          </button>
          <button
            onClick={() => onDocumentSizeChange("oficio")}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
              documentSize === "oficio"
                ? "bg-amber-600 text-white"
                : "bg-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            Oficio MX
          </button>
        </div>
      )}

      {/* Step indicator for ID */}
      {isID && (
        <div className="mb-4 flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
            idSide === "front" ? "bg-green-600 text-white" : "bg-green-900/50 text-green-400"
          }`}>
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">1</span>
            Frente
            {idFrontResult && <span className="text-green-300">✓</span>}
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-neutral-600">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
            idSide === "back" ? "bg-green-600 text-white" : "bg-neutral-800 text-neutral-500"
          }`}>
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">2</span>
            Reverso
          </div>
        </div>
      )}

      {/* Front preview when capturing back + Cancel button */}
      {isCapturingBack && idFrontResult && (
        <div className="mb-4 flex flex-col items-center gap-3">
          <div className="p-2 bg-neutral-900 rounded-xl">
            <p className="text-xs text-neutral-500 text-center mb-2">Frente capturado:</p>
            <img src={idFrontResult} alt="Frente" className="h-16 rounded-lg opacity-70" />
          </div>
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Cancelar y empezar de nuevo
          </button>
        </div>
      )}

      {cameraActive ? (
        <div className="relative w-full max-w-md aspect-[4/3] bg-black rounded-2xl overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className={`border-2 border-dashed border-white/50 rounded-lg ${
                isDocument ? "w-4/5 aspect-[0.77/1]" : isID ? "w-4/5 aspect-[1.586/1]" : "w-3/5 aspect-[0.7/1]"
              }`}
            />
          </div>
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
            <button
              onClick={stopCamera}
              className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
            <button
              onClick={capturePhoto}
              className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg"
            >
              <div className={`w-12 h-12 rounded-full border-4 ${getAccentColor()}`} />
            </button>
          </div>
        </div>
      ) : (
        <div
          className="w-full max-w-md aspect-[4/3] border-2 border-dashed border-neutral-700 rounded-2xl flex flex-col items-center justify-center gap-6 cursor-pointer hover:border-neutral-500 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <div className={`p-4 rounded-2xl ${isDocument ? "bg-amber-900/30" : isID ? "bg-green-900/30" : "bg-blue-900/30"}`}>
            {isDocument ? (
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="text-amber-400">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.5" />
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : isID ? (
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="text-green-400">
                <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="8" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M13 10h6M13 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="text-blue-400">
                <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 16h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </div>
          <div className="text-center">
            <p className="text-neutral-300 font-medium">
              {isDocument 
                ? "Escanear Documento" 
                : isID 
                  ? (isCapturingBack ? "Escanear REVERSO" : "Escanear FRENTE") 
                  : "Escanear Pasaporte"}
            </p>
            <p className="text-sm text-neutral-500 mt-1">
              {isID && !isCapturingBack && "Paso 1 de 2 — "}
              {isID && isCapturingBack && "Paso 2 de 2 — "}
              Toca para seleccionar o arrastra
            </p>
            {isDocument && (
              <p className="text-xs text-amber-500/70 mt-2">
                Modo Magic Color — contratos, actas, recibos
              </p>
            )}
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {!cameraActive && (
        <button
          onClick={startCamera}
          className={`mt-6 flex items-center gap-2 px-6 py-3 rounded-xl transition-colors ${
            isDocument ? "bg-amber-900/50 hover:bg-amber-900/70" : isID ? "bg-green-900/50 hover:bg-green-900/70" : "bg-neutral-800 hover:bg-neutral-700"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" />
          </svg>
          Usar Cámara
        </button>
      )}
    </div>
  );
}


