import { Monitor } from 'lucide-react';
import { Button } from '@thunikart/ui';
import { useView } from '../app/view';

/** Short notice on mobile for desktop first screens, with a link to switch view. */
export function DesktopOnlyNotice({ title, body }: { title: string; body: string }) {
  const { setPref } = useView();
  return (
    <div className="flex flex-col items-center gap-3 rounded border-2 border-navy-100 bg-mist p-6 text-center">
      <Monitor aria-hidden className="h-8 w-8 text-navy" />
      <h2 className="text-lg">{title}</h2>
      <p className="text-sm text-muted">{body}</p>
      <Button variant="primary" size="lg" onClick={() => setPref('desktop')}>Switch to desktop view</Button>
    </div>
  );
}
