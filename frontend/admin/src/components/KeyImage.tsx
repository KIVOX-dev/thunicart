import { ImageOff } from 'lucide-react';
import { useImageUrl } from '../features/store/use-products';

/** A photo from the media bucket, looked up by its key. A picture just uploaded in this browser can be passed as `local` to show it at once. */
export function KeyImage({ k, alt, local, className = '' }: { k: string | null | undefined; alt: string; local?: string; className?: string }) {
  const q = useImageUrl(local ? null : k);
  const src = local ?? q.data;
  if (src) return <img src={src} alt={alt} loading="lazy" className={`h-full w-full object-cover ${className}`} />;
  return <span className={`flex h-full w-full items-center justify-center text-muted ${className}`} role="img" aria-label={q.isError ? `${alt} (could not load)` : alt}><ImageOff aria-hidden size={18} /></span>;
}
