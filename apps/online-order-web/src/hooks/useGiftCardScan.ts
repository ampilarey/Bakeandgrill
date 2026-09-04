import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Read a gift card with the camera, using only what the browser already has.
 *
 * Deliberately no scanning library. This is the customer app: every kilobyte
 * is downloaded over a phone connection by someone who wants a burger, and a
 * decoder is a large dependency to ship to everyone for a feature few will
 * use. `BarcodeDetector` is built into Chrome and Android WebView, costs
 * nothing, and where it is missing the button simply does not appear —
 * typing and pasting the SMS link still work everywhere.
 */
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function detectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

  return typeof ctor === "function" ? ctor : null;
}

/** Whether to offer scanning at all. False on iOS Safari, which has no detector. */
export function canScanGiftCard(): boolean {
  return detectorCtor() !== null
    && typeof navigator !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia;
}

export function useGiftCardScan(onCode: (value: string) => void) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const doneRef = useRef(false);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  const close = useCallback(() => {
    setOpen(false);
    setError("");
  }, []);

  useEffect(() => {
    if (!open) return;
    const Ctor = detectorCtor();
    if (!Ctor) {
      setError("This browser cannot scan. Type the code or paste the link from your SMS.");

      return;
    }

    doneRef.current = false;
    let stream: MediaStream | null = null;
    let frame = 0;
    let cancelled = false;

    const stop = () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };

    void (async () => {
      try {
        // The rear camera is the one pointed at the card.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const detector = new Ctor({
          // A gift card may be printed as either; asking for both costs nothing.
          formats: ["qr_code", "code_128"],
        });

        const tick = async () => {
          if (cancelled || doneRef.current) return;
          try {
            const found = await detector.detect(video);
            const value = found.find((c) => c.rawValue?.trim())?.rawValue?.trim();
            if (value) {
              doneRef.current = true;
              stop();
              setOpen(false);
              onCodeRef.current(value);

              return;
            }
          } catch {
            // A single failed frame is normal — keep looking.
          }
          frame = requestAnimationFrame(() => void tick());
        };
        frame = requestAnimationFrame(() => void tick());
      } catch (e) {
        const name = (e as { name?: string })?.name ?? "";
        setError(
          name === "NotAllowedError"
            ? "Camera access was refused. Allow the camera, or type the code instead."
            : name === "NotFoundError"
              ? "No camera found. Type the code or paste the link from your SMS."
              : "The camera could not start. Type the code instead.",
        );
      }
    })();

    return stop;
  }, [open]);

  return { open, setOpen, close, error, videoRef };
}
