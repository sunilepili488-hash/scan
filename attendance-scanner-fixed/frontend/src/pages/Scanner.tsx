import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { scanAndMatch, endSession } from "../lib/api";
import { playSuccessSound, playErrorSound } from "../lib/sounds";

type ScanState = "idle" | "capturing" | "matched" | "already_marked" | "no_match" | "not_scanned";

const CAPTURE_WINDOW_MS = 6000;
const FRAME_INTERVAL_MS = 500;

export default function Scanner() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const navigate = useNavigate();

  const [state, setState] = useState<ScanState>("idle");
  const [scannedCount, setScannedCount] = useState(0);
  const [lastResult, setLastResult] = useState<{ name?: string | null; roll_no?: string | null } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const [cameraError, setCameraError] = useState("");

  useEffect(() => {
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      trackRef.current = stream.getVideoTracks()[0] || null;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraError("Could not access the camera. Please allow camera permission and reload.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  async function setTorch(on: boolean) {
    try {
      const track = trackRef.current;
      if (!track) return;
      const capabilities = (track.getCapabilities?.() as any) || {};
      if (capabilities.torch) {
        await track.applyConstraints({ advanced: [{ torch: on }] } as any);
      }
    } catch {
      // torch not supported — fail silently
    }
  }

  function captureFrame(): string | null {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  function estimateBrightness(): number {
    const canvas = canvasRef.current;
    if (!canvas) return 255;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 255;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 160) {
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      count++;
    }
    return count ? sum / count : 255;
  }

  async function runCaptureSession() {
    if (busy || cameraError || !sessionId) return;
    setBusy(true);
    setState("capturing");

    const frames: string[] = [];
    const start = Date.now();

    captureFrame();
    const brightness = estimateBrightness();
    const torchOn = brightness < 60;
    if (torchOn) await setTorch(true);

    while (Date.now() - start < CAPTURE_WINDOW_MS) {
      const frame = captureFrame();
      if (frame) frames.push(frame);
      await new Promise((r) => setTimeout(r, FRAME_INTERVAL_MS));
      if (frames.length >= 4 && Date.now() - start > 1500) break;
    }

    if (torchOn) await setTorch(false);

    try {
      const result = await scanAndMatch(sessionId, frames);
      setScannedCount(result.scanned_count);

      if (result.status === "matched" || result.status === "already_marked") {
        setLastResult({ name: result.student_name, roll_no: result.student_roll_no });
        setState(result.status);
        playSuccessSound();
      } else if (result.status === "no_match") {
        setState("no_match");
        playErrorSound();
      } else {
        setState("not_scanned");
        playErrorSound();
      }
    } catch {
      setState("not_scanned");
      playErrorSound();
    }

    setTimeout(() => {
      setState("idle");
      setBusy(false);
    }, 2000);
  }

  useEffect(() => {
    if (state !== "idle" || busy || cameraError) return;
    const t = setTimeout(runCaptureSession, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cameraError]);

  async function handleStop() {
    if (!sessionId) return;
    stopCamera();
    setEnding(true);
    try {
      await endSession(sessionId);
    } finally {
      navigate("/");
    }
  }

  const isPositive = state === "matched" || state === "already_marked";
  const isNegative = state === "no_match" || state === "not_scanned";

  return (
    <div className="fixed inset-0 bg-black">
      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />

      <div className="absolute left-0 right-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-4 pt-6 pb-10 text-center">
        <p className="text-sm text-white/90">Place the card on a flat, plain surface for best results</p>
      </div>

      <div className="absolute right-4 top-20 rounded-full bg-black/50 px-3 py-1 text-sm font-medium text-white">
        {scannedCount} scanned
      </div>

      {cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black px-6 text-center text-white">
          {cameraError}
        </div>
      )}

      {(isPositive || isNegative) && !cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
          {isPositive && (
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <p className="font-display text-2xl font-bold text-success">
                {state === "already_marked" ? "Already Marked" : "Present"}
              </p>
              {lastResult?.name && <p className="text-indigo">{lastResult.name}</p>}
              {lastResult?.roll_no && <p className="text-sm text-indigo/60">Roll No. {lastResult.roll_no}</p>}
            </>
          )}
          {isNegative && (
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-danger">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </div>
              <p className="font-display text-2xl font-bold text-danger">
                {state === "no_match" ? "No Match Found" : "ID Not Scanned"}
              </p>
            </>
          )}
        </div>
      )}

      <button
        onClick={handleStop}
        disabled={ending}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-6 py-3 text-sm font-semibold text-indigo shadow-lg"
      >
        {ending ? "Ending…" : "Stop Scanning"}
      </button>
    </div>
  );
}
