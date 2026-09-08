import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { scanAndMatch, endSession } from "../lib/api";
import { playSuccessSound, playErrorSound } from "../lib/sounds";

type ScanState = "idle" | "capturing" | "matched" | "already_marked" | "no_match" | "not_scanned";

const MAX_WAIT_MS = 2500; // hard safety cap — never wait longer than this
const FRAME_INTERVAL_MS = 120; // poll fast so a sharp frame is caught almost instantly
const SHARPNESS_EXIT_THRESHOLD = 14; // tuned for a JPEG @0.8 downscaled frame; raise if it exits too early on blurry frames, lower if it never exits early
const MAX_CAPTURE_WIDTH = 1000; // downscaling cuts both upload time and OCR time server-side

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
  // Track when camera is truly ready (videoWidth > 0)
  const [cameraReady, setCameraReady] = useState(false);

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

        // Wait for video metadata to load before marking camera as ready
        // This ensures videoWidth/videoHeight are non-zero before we try to capture
        await new Promise<void>((resolve) => {
          const video = videoRef.current!;
          if (video.readyState >= 1 && video.videoWidth > 0) {
            resolve();
          } else {
            video.addEventListener("loadedmetadata", () => resolve(), { once: true });
          }
        });

        await videoRef.current.play();
        setCameraReady(true); // Mark ready only AFTER metadata is loaded
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

    // Guard against zero dimensions — this was the crash source
    if (!video.videoWidth || !video.videoHeight) return null;

    // Downscale: sending a smaller frame cuts upload time AND server-side
    // OCR time, with no real accuracy loss (a card only needs ~800-1000px
    // of width to OCR cleanly).
    const scale = Math.min(1, MAX_CAPTURE_WIDTH / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  }

  function estimateBrightness(): number {
    const canvas = canvasRef.current;
    if (!canvas) return 255;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 255;

    // Guard against zero canvas size before getImageData
    if (!canvas.width || !canvas.height) return 255;

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 160) {
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      count++;
    }
    return count ? sum / count : 255;
  }

  // Cheap proxy for "is this frame in focus" — average local brightness
  // gradient sampled on a stride so it stays fast even on every frame.
  // Runs on the canvas that captureFrame() just drew, so no extra decode.
  function estimateSharpness(): number {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const ctx = canvas.getContext("2d");
    if (!ctx || !canvas.width || !canvas.height) return 0;

    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let edgeSum = 0;
    let count = 0;
    const rowStep = Math.max(1, Math.floor(height / 60));
    const colStep = 4;
    for (let y = 0; y < height; y += rowStep) {
      const rowStart = y * width * 4;
      for (let x = 0; x < width - colStep; x += colStep) {
        const i = rowStart + x * 4;
        const j = rowStart + (x + colStep) * 4;
        const g1 = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const g2 = (data[j] + data[j + 1] + data[j + 2]) / 3;
        edgeSum += Math.abs(g1 - g2);
        count++;
      }
    }
    return count ? edgeSum / count : 0;
  }

  async function runCaptureSession() {
    // Don't start scanning until camera is truly ready
    if (busy || cameraError || !sessionId || !cameraReady) return;
    setBusy(true);
    setState("capturing");

    const start = Date.now();
    let bestFrame: string | null = null;
    let bestScore = -1;

    // Quick brightness check on the first frame to decide about torch.
    captureFrame();
    const brightness = estimateBrightness();
    const torchOn = brightness < 60;
    if (torchOn) await setTorch(true);

    // Poll fast and exit the MOMENT a sharp-enough frame shows up — this is
    // what makes it feel instant instead of waiting out a fixed window.
    while (Date.now() - start < MAX_WAIT_MS) {
      const frame = captureFrame();
      if (frame) {
        const score = estimateSharpness();
        if (score > bestScore) {
          bestScore = score;
          bestFrame = frame;
        }
        if (score >= SHARPNESS_EXIT_THRESHOLD) {
          break;
        }
      }
      await new Promise((r) => setTimeout(r, FRAME_INTERVAL_MS));
    }

    if (torchOn) await setTorch(false);

    if (!bestFrame) {
      setState("not_scanned");
      playErrorSound();
      setTimeout(() => {
        setState("idle");
        setBusy(false);
      }, 1500);
      return;
    }

    try {
      // Send just the single best frame — smaller upload, less server-side
      // work, and the server no longer has to pick-among-many either.
      const result = await scanAndMatch(sessionId, [bestFrame]);
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
    } catch (error: any) {
      console.error("SCAN ERROR:", error);
      console.error("SCAN RESPONSE:", error?.response?.data);
      console.error("SCAN STATUS:", error?.response?.status);

      setState("not_scanned");
      playErrorSound();
    }

    setTimeout(() => {
      setState("idle");
      setBusy(false);
    }, 1500);
  }

  useEffect(() => {
    // cameraReady in dependency — triggers scan only once camera is ready
    if (state !== "idle" || busy || cameraError || !cameraReady) return;
    const t = setTimeout(runCaptureSession, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cameraError, cameraReady]);

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

      {/* Show loading indicator while camera initializes */}
      {!cameraReady && !cameraError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-white/70 text-sm">Starting camera…</p>
        </div>
      )}

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
