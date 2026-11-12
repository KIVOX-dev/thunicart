import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
const PALETTE = ['#0B1B54', '#7A1F2B', '#0BBBB4', '#D9A21B', '#E58AA3', '#6B7A3A', '#F67025', '#5B6482'];
const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

/** Placeholder pictures in the brand colours, so the store looks right before real photos are uploaded. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params;
  const key = slug[0] ?? 'x';
  const n = Number(slug[1] ?? 1);
  const w = Number(req.nextUrl.searchParams.get('w') ?? 600);
  const h = Number(req.nextUrl.searchParams.get('h') ?? 800);
  const base = PALETTE[hash(key) % PALETTE.length]!;
  const alt = PALETTE[(hash(key) + n * 3) % PALETTE.length]!;
  const label = key.replace(/^(cat|occ|look|blog|banner)-?/, '').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${base}"/><stop offset="1" stop-color="${alt}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><g fill="#fff" fill-opacity="0.16"><circle cx="${w * 0.8}" cy="${h * 0.2}" r="${h * 0.22}"/><circle cx="${w * 0.15}" cy="${h * 0.85}" r="${h * 0.3}"/></g><path d="M${w * 0.35} ${h * 0.55}c${w * 0.1} -${h * 0.2} ${w * 0.2} -${h * 0.2} ${w * 0.3} 0" stroke="#F67025" stroke-width="${Math.max(3, w / 120)}" fill="none"/><text x="50%" y="${h * 0.5}" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="${Math.max(16, w / 14)}" font-weight="600" fill="#fff" letter-spacing="3">${label.slice(0, 14)}</text><text x="50%" y="${h * 0.58}" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="${Math.max(11, w / 26)}" fill="#fff" fill-opacity="0.85">View ${n}</text></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}
