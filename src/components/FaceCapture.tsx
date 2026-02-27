import { useState, useRef, useEffect, useCallback } from "react";
import { useFaceRecognition, FaceDetectionResult } from "@/hooks/useFaceRecognition";
import { useLanguage } from "@/hooks/useLanguage";
import { Camera, Loader2, RefreshCw, CheckCircle2, AlertTriangle, ScanFace } from "lucide-react";

interface FaceCaptureProps {
  onCapture: (result: FaceDetectionResult) => void;
  onCancel?: () => void;
  mode?: "enroll" | "verify";
  autoStart?: boolean;
}

export default function FaceCapture({ onCapture, onCancel, mode = "enroll", autoStart = false }: FaceCaptureProps) {
  const { lang } = useLanguage();
  const { isModelLoading, modelReady, error, setError, loadModels, startCamera, stopCamera, detectFace } = useFaceRecognition();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const capturedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = {
    loadingModels: lang === "es" ? "Cargando reconocimiento facial..." : "Loading face recognition...",
    startCamera: lang === "es" ? "Iniciar cámara" : "Start camera",
    capture: lang === "es" ? "Capturar rostro" : "Capture face",
    retake: lang === "es" ? "Reintentar" : "Retake",
    cancel: lang === "es" ? "Cancelar" : "Cancel",
    lookAtCamera: lang === "es" ? "Mira directamente a la cámara" : "Look directly at the camera",
    enrollTitle: lang === "es" ? "Registro facial" : "Face enrollment",
    verifyTitle: lang === "es" ? "Verificación facial" : "Face verification",
    processing: lang === "es" ? "Procesando..." : "Processing...",
    captured: lang === "es" ? "Rostro capturado" : "Face captured",
    scanning: lang === "es" ? "Escaneando..." : "Scanning...",
    hint: lang === "es" ? "Asegúrate de que tu rostro sea visible" : "Make sure your face is visible",
  };

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  useEffect(() => {
    if (modelReady && autoStart && videoRef.current && !cameraReady) {
      handleStartCamera();
    }
  }, [modelReady, autoStart]);

  // Auto-detection loop
  useEffect(() => {
    if (!cameraReady || capturedRef.current || capturedImage) return;

    setScanning(true);
    setHintVisible(false);

    // Show hint after 10s
    hintTimerRef.current = setTimeout(() => setHintVisible(true), 10000);

    intervalRef.current = setInterval(async () => {
      if (capturedRef.current) return;
      const result = await detectFace();
      if (result && result.descriptor && !capturedRef.current) {
        capturedRef.current = true;
        setScanning(false);
        setCapturedImage(result.imageDataUrl);
        stopCamera();
        setCameraReady(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        onCapture(result);
      }
    }, 500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      setScanning(false);
    };
  }, [cameraReady, capturedImage, detectFace, onCapture, stopCamera]);

  const handleStartCamera = async () => {
    if (videoRef.current) {
      capturedRef.current = false;
      await startCamera(videoRef.current);
      setCameraReady(true);
    }
  };

  // Manual fallback
  const handleCapture = async () => {
    if (capturedRef.current) return;
    setError(null);
    const result = await detectFace();
    if (result) {
      capturedRef.current = true;
      setScanning(false);
      setCapturedImage(result.imageDataUrl);
      stopCamera();
      setCameraReady(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      onCapture(result);
    }
  };

  const handleRetake = async () => {
    setCapturedImage(null);
    setError(null);
    capturedRef.current = false;
    setHintVisible(false);
    if (videoRef.current) {
      await startCamera(videoRef.current);
      setCameraReady(true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ScanFace className="w-4 h-4 text-primary" />
        {mode === "enroll" ? t.enrollTitle : t.verifyTitle}
      </div>

      {/* Video / Image display */}
      <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-muted border border-border">
        {capturedImage ? (
          <img src={capturedImage} alt="Captured face" className="w-full h-full object-cover" />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${cameraReady ? "" : "hidden"}`}
          />
        )}

        {!cameraReady && !capturedImage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            {isModelLoading ? (
              <>
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">{t.loadingModels}</p>
              </>
            ) : modelReady ? (
              <button
                onClick={handleStartCamera}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition"
              >
                <Camera className="w-4 h-4" />
                {t.startCamera}
              </button>
            ) : null}
          </div>
        )}

        {/* Scanning overlay */}
        {scanning && cameraReady && !capturedImage && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/80 text-primary-foreground text-xs font-bold animate-pulse">
            <ScanFace className="w-3 h-3" />
            {t.scanning}
          </div>
        )}

        {/* Hint after 10s */}
        {hintVisible && scanning && cameraReady && !capturedImage && (
          <div className="absolute bottom-12 inset-x-4 text-center">
            <span className="inline-block px-3 py-1.5 rounded-full bg-warning/90 text-warning-foreground text-xs font-semibold">
              {t.hint}
            </span>
          </div>
        )}

        {capturedImage && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/90 text-white text-xs font-bold">
            <CheckCircle2 className="w-3 h-3" />
            {t.captured}
          </div>
        )}

        {cameraReady && !capturedImage && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-4">
            <p className="text-white text-xs text-center">{t.lookAtCamera}</p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && !scanning && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-xs font-medium">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {cameraReady && !capturedImage && (
          <button
            onClick={handleCapture}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-muted text-foreground text-sm font-semibold hover:bg-muted/80 transition"
          >
            <Camera className="w-4 h-4" />
            {t.capture}
          </button>
        )}

        {capturedImage && (
          <button
            onClick={handleRetake}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-muted text-foreground text-sm font-semibold hover:bg-muted/80 transition"
          >
            <RefreshCw className="w-4 h-4" />
            {t.retake}
          </button>
        )}

        {onCancel && (
          <button
            onClick={() => { stopCamera(); onCancel(); }}
            className="px-4 py-2.5 rounded-full bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80 transition"
          >
            {t.cancel}
          </button>
        )}
      </div>
    </div>
  );
}
