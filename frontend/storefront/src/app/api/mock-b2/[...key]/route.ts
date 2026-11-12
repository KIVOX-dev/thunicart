export const dynamic = 'force-dynamic';
/** Stands in for the storage upload URL in mock mode. It accepts the file and keeps nothing. */
export async function PUT(req: Request) { await req.arrayBuffer(); return new Response(null, { status: 200 }); }
