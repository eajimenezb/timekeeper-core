import { useState, useRef, useCallback, useEffect } from "react";

// face-api.js model URLs (loaded from CDN)
const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model";

let faceApiLoaded = false;
let faceApiLoading = false;
let faceApiPromise: Promise<void> | null = null;

async function loadFaceApi(): Promise<void> {
  if (faceApiLoaded) return;
  if (faceApiLoading && faceApiPromise) return faceApiPromise;
  faceApiLoading = true;
  faceApiPromise = (async () => {
    // Dynamically import face-api.js
    const faceapi = await import("@vladmandic/face-api");
    
    // Load required models
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);

    faceApiLoaded = true;
    faceApiLoading = false;
  })();
  return faceApiPromise;
}

export type FaceDetectionResult = {
  descriptor: Float32Array;
  imageDataUrl: string;
};

export function useFaceRecognition() {
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelReady, setModelReady] = useState(faceApiLoaded);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load face-api.js models
  const loadModels = useCallback(async () => {
    if (faceApiLoaded) {
      setModelReady(true);
      return;
    }
    setIsModelLoading(true);
    setError(null);
    try {
      await loadFaceApi();
      setModelReady(true);
    } catch (e) {
      setError(`Failed to load face recognition models: ${(e as Error).message}`);
    } finally {
      setIsModelLoading(false);
    }
  }, []);

  // Start camera
  const startCamera = useCallback(async (videoElement: HTMLVideoElement) => {
    videoRef.current = videoElement;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      videoElement.srcObject = stream;
      streamRef.current = stream;
      await videoElement.play();
    } catch (e) {
      setError(`Camera access denied: ${(e as Error).message}`);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Detect face and extract 128-dim descriptor
  const detectFace = useCallback(async (): Promise<FaceDetectionResult | null> => {
    if (!videoRef.current || !faceApiLoaded) {
      setError("Camera or models not ready");
      return null;
    }

    const faceapi = await import("@vladmandic/face-api");
    const detection = await faceapi
      .detectSingleFace(videoRef.current)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      setError("No face detected. Please look at the camera.");
      return null;
    }

    setError(null);

    // Capture image snapshot
    const canvas = canvasRef.current || document.createElement("canvas");
    canvasRef.current = canvas;
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(videoRef.current, 0, 0);
    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.8);

    return {
      descriptor: detection.descriptor,
      imageDataUrl,
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    isModelLoading,
    modelReady,
    error,
    setError,
    loadModels,
    startCamera,
    stopCamera,
    detectFace,
  };
}
