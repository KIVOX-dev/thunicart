import { useRef, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { Button, Input } from '@thunikart/ui';
import { CameraScanner } from '../pwa/CameraScanner';
import { useKeyboardScanner } from '../pwa/use-keyboard-scanner';

/**
 * Search and scan box. Keyboard scanners work in this box (or with nothing focused), and the camera button opens the camera view.
 * Typing a code and pressing Enter does the same lookup.
 */
export function ScanBox({ onCode, large, autoFocus, placeholder = 'Scan or type a barcode or code' }: { onCode: (code: string) => void; large?: boolean; autoFocus?: boolean; placeholder?: string }) {
  const [value, setValue] = useState('');
  const [camera, setCamera] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const emit = (code: string) => { onCode(code); setValue(''); };
  // A scanner finishes with Enter. If the box is focused the fast typing also landed in it, so clear it.
  useKeyboardScanner((code) => emit(code));
  return (
    <div className="flex gap-2">
      <form className="flex-1" onSubmit={(e) => { e.preventDefault(); if (value.trim().length) emit(value.trim()); }} role="search">
        <Input ref={ref} aria-label="Scan or search" autoFocus={autoFocus} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} autoComplete="off" className={large ? 'min-h-14 text-lg' : ''} />
      </form>
      <Button variant="primary" onClick={() => setCamera(true)} aria-label="Scan with camera" className={large ? 'min-h-14 min-w-14' : 'min-w-11'}><ScanLine aria-hidden size={22} /></Button>
      <CameraScanner open={camera} onClose={() => setCamera(false)} onScan={(c) => { setCamera(false); emit(c); }} />
    </div>
  );
}
