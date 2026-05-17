'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

type BarcodeScannerProps = {
  onDetected: (code: string) => void;
  onError?: (message: string) => void;
  active: boolean;
};

export function BarcodeScanner({ onDetected, onError, active }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [starting, setStarting] = useState(false);
  const handledRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    handledRef.current = false;

    let reader: BrowserMultiFormatReader | null = null;
    let cancelled = false;

    const start = async () => {
      setStarting(true);
      try {
        reader = new BrowserMultiFormatReader();
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const back =
          devices.find((d) => /back|rear|environment/i.test(d.label))?.deviceId ??
          devices[0]?.deviceId;

        if (!videoRef.current) return;

        await reader.decodeFromVideoDevice(back, videoRef.current, (result) => {
          if (cancelled || handledRef.current) return;
          if (result) {
            const digits = result.getText()?.replace(/\D/g, '') ?? '';
            if (digits.length >= 8 && digits.length <= 14) {
              handledRef.current = true;
              onDetected(digits);
            }
          }
        });
      } catch (e) {
        if (!cancelled) {
          onError?.(
            e instanceof Error
              ? e.message
              : 'Could not open the camera. Enter the barcode manually or allow camera access.'
          );
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    };

    void start();

    return () => {
      cancelled = true;
      reader?.reset();
    };
  }, [active, onDetected, onError]);

  return (
    <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-black">
      <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden
      >
        <div
          className="w-[70%] max-w-xs aspect-[2/1] rounded-lg border-2 border-white/80"
          style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }}
        />
      </div>
      {starting && (
        <p
          className="absolute bottom-3 left-0 right-0 text-center text-white text-xs font-semibold"
          style={{ textShadow: '0 1px 4px #000' }}
        >
          Starting camera…
        </p>
      )}
    </div>
  );
}
