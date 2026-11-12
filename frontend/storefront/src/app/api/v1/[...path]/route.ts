import { NextResponse, type NextRequest } from 'next/server';
import { handle } from '@/mock/handlers';

export const dynamic = 'force-dynamic';

/** The mock API, used only while NEXT_PUBLIC_API_URL is a REPLACE_ME placeholder. */
async function run(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  let body: unknown;
  if (req.method !== 'GET' && req.method !== 'DELETE') body = await req.json().catch(() => ({}));
  const cookies = Object.fromEntries(req.cookies.getAll().map((c) => [c.name, c.value]));
  const res = await handle({ method: req.method, path, query: req.nextUrl.searchParams, body, cookies });
  const out = NextResponse.json(res.json, { status: res.status });
  for (const c of res.cookies ?? []) out.cookies.set(c.name, c.value, { httpOnly: c.httpOnly ?? false, maxAge: c.maxAge, path: '/', sameSite: 'lax' });
  return out;
}
export { run as GET, run as POST, run as PUT, run as DELETE };
