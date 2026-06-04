export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';

export async function POST(request: Request) {
  const body = await request.text();

  const backendResponse = await fetch(`${BACKEND_BASE}/api/v1/agent/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    body,
    signal: request.signal,
  });

  if (!backendResponse.ok || !backendResponse.body) {
    return new Response(
      JSON.stringify({ error: `Backend error: ${backendResponse.status}` }),
      { status: backendResponse.status || 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
