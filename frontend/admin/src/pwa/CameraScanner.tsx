import { useEffect, useRef, useState } from 'react';
import { BottomSheet, Button, Input } from '@thunikart/ui';

interface DetectorLike { detect(v: HTMLVideoElement): Promise<Array<{ rawValue: string }>> }
declare global { interface Window { BarcodeDetector?: new (o?: { formats: string[] }) => DetectorLike } }

/** Opens the phone camera and reads barcodes with the browser BarcodeDetector. Falls back to typing the code. */
export function CameraScanner({ open, onClose, onScan }: { open: boolean; onClose: () => void; onScan: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const supported = typeof window !== 'undefined' && !!window.BarcodeDetector;

  useEffect(() => {
    if (!open || !supported) return;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    setError(null);
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped || !video.current) return stream.getTracks().forEach((t) => t.stop());
        video.current.srcObject = stream;
        await video.current.play();
        const det = new window.BarcodeDetector!({ formats: ['code_128', 'ean_13', 'ean_8', 'upc_a', 'qr_code'] });
        timer = setInterval(async () => {
          if (!video.current) return;
          const found = await det.detect(video.current).catch(() => []);
          if (found[0]) onScan(found[0].rawValue);
        }, 300);
      } catch {
        setError('Camera is blocked or not available. Allow camera access, or type the code below.');
      }
    })();
    return () => { stopped = true; clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [open, supported, onScan]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Scan a barcode">
      <div className="flex flex-col gap-3">
        {supported ? (
          <div className="relative overflow-hidden rounded bg-navy">
            <video ref={video} muted playsInline className="aspect-[4/3] w-full object-cover" aria-label="Camera view" />
            <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 bg-orange" />
          </div>
        ) : <p className="rounded border-2 border-navy-100 bg-mist p-3 text-sm">This browser cannot scan with the camera. Type the code instead.</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <form onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { onScan(manual.trim()); setManual(''); } }} className="flex gap-2">
          <Input aria-label="Type a code" placeholder="Type the code" value={manual} onChange={(e) => setManual(e.target.value)} className="min-h-12" />
          <Button type="submit" variant="primary" className="min-h-12">Find</Button>
        </form>
      </div>
    </BottomSheet>
  );
}
