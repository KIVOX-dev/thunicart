import { useEffect, useState } from 'react';

/** Shown while the browser is offline. Forms keep their values, so nothing is lost on a dropped connection. */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  if (online) return null;
  return (
    <div role="status" className="bg-warning-bg px-4 py-2 text-center text-sm font-medium text-warning">
      You are offline. Changes will not save until the connection is back.
    </div>
  );
}
