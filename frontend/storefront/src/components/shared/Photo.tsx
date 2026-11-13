import type { ImgHTMLAttributes } from 'react';
import { MOCK_MODE } from '@/lib/config';

/** The pictures the API draws itself (garment outlines and posters) instead of real photos. With real data only real photos are shown. */
export function isDrawnArt(src?: string | null): boolean {
  return !MOCK_MODE && !!src && /\/(media\/(art|poster)|api\/img)\//.test(src);
}
/** Keeps only real photos. In mock mode everything is kept, so the demo store still has pictures. */
export const realPhotos = (list: string[]): string[] => list.filter((s) => !isDrawnArt(s));

/** An image that never shows drawn art: in its place is a plain empty tile of the same size. */
export function Photo({ src, alt = '', className, width, height, ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  if (isDrawnArt(typeof src === 'string' ? src : undefined)) return <span role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} className={`${className ?? ''} block bg-mist`} style={{ width: undefined, aspectRatio: width && height ? `${width} / ${height}` : undefined }} />;
  return <img src={src} alt={alt} className={className} width={width} height={height} {...rest} />;
}
