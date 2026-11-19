"use client";

import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { useEffect, useRef, useState } from "react";

type Props = {
  onScan: (value: string) => void | Promise<void>;
  placeholder?: string;
  compact?: boolean;
  autoFocus?: boolean;
};

export function BarcodeScanner({
  onScan,
  placeholder = "Scan barcode / QR code / enter SKU",
  compact = false,
  autoFocus = true,
}: Props) {
  const [value, setValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onScanRef = useRef(onScan);
  const busyRef = useRef(false);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (autoFocus && !cameraOpen) inputRef.current?.focus();
  }, [autoFocus, cameraOpen]);

  useEffect(() => {
    if (!cameraOpen || !videoRef.current) return;

    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    async function startDecoding() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access requires HTTPS (or localhost) and browser permission.");
        }

        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result) => {
            if (!result || cancelled || busyRef.current) return;
            const scannedValue = result.getText().trim();
            if (!scannedValue) return;

            const now = Date.now();
            if (
              lastScanRef.current?.value === scannedValue &&
              now - lastScanRef.current.at < 1800
            ) {
              return;
            }
            lastScanRef.current = { value: scannedValue, at: now };
            busyRef.current = true;
            void Promise.resolve(onScanRef.current(scannedValue))
              .catch((error: unknown) => {
                setCameraError(error instanceof Error ? error.message : "Unable to process scanned code.");
              })
              .finally(() => {
                busyRef.current = false;
              });
          },
        );

        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      } catch (error) {
        if (!cancelled) {
          setCameraError(
            error instanceof Error
              ? error.message
              : "Unable to start the camera. Check camera permission and try again.",
          );
          setCameraOpen(false);
        }
      } finally {
        if (!cancelled) setCameraStarting(false);
      }
    }

    setCameraStarting(true);
    void startDecoding();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [cameraOpen]);

  async function submit(raw: string) {
    const code = raw.trim();
    if (!code || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await onScanRef.current(code);
      setValue("");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function startCamera() {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access requires HTTPS (or localhost). Open KB ERP over HTTPS and allow camera permission.");
      return;
    }
    lastScanRef.current = null;
    setCameraOpen(true);
  }

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraOpen(false);
    setCameraStarting(false);
  }

  return (
    <section className={`rounded-xl border border-gray-200 bg-white ${compact ? "p-3" : "p-4"}`} aria-label="Barcode and QR scanner">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-52 flex-1 text-sm font-medium">
          Barcode / QR scanner
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit(value);
              }
            }}
            placeholder={placeholder}
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-gray-300 p-2.5 font-mono"
          />
        </label>
        <button
          type="button"
          disabled={busy || !value.trim()}
          onClick={() => void submit(value)}
          className="rounded-lg bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Looking up…" : "Find product"}
        </button>
        {!cameraOpen ? (
          <button type="button" onClick={startCamera} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold">
            Use camera
          </button>
        ) : (
          <button type="button" onClick={stopCamera} className="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700">
            Stop camera
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        USB scanners work as keyboard input: click the field, scan, and the scanner’s Enter suffix submits automatically.
      </p>
      {cameraError && <p role="alert" className="mt-2 text-sm text-red-700">{cameraError}</p>}
      {cameraOpen && (
        <div className="mt-3 max-w-xl overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} playsInline muted className="max-h-72 w-full object-cover" />
          <p className="bg-gray-900 px-3 py-2 text-xs text-white">
            {cameraStarting ? "Starting camera…" : "Point the camera at a barcode or QR code."}
          </p>
        </div>
      )}
    </section>
  );
}
