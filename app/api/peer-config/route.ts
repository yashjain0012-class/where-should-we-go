/**
 * Where live rooms find each other. By default this is empty, which means PeerJS's free public broker.
 * To use your own PeerJS server (or a local one in tests), set PEER_HOST (and optionally PEER_PORT,
 * PEER_PATH, PEER_SECURE) on the server: no rebuild is needed, because this is read on each request.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const host = process.env.PEER_HOST?.trim();
  if (!host || !/^[A-Za-z0-9.-]{1,253}$/.test(host)) {
    return Response.json({}, { headers: { "Cache-Control": "no-store" } });
  }
  const port = Number(process.env.PEER_PORT);
  const path = process.env.PEER_PATH?.trim();
  return Response.json(
    {
      host,
      ...(Number.isInteger(port) && port > 0 && port < 65536 ? { port } : {}),
      ...(path && /^\/[A-Za-z0-9/_-]{0,64}$/.test(path) ? { path } : {}),
      secure: process.env.PEER_SECURE === "true",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
