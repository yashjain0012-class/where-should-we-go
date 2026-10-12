// A local PeerJS signalling server for the end-to-end tests of live rooms, so they never depend on the
// free public broker. Run by Playwright (see playwright.config.ts); `npm run peer-server` runs it by hand.
import { PeerServer } from "peer";

const port = Number(process.env.PEER_PORT ?? 9100);
PeerServer({ port, path: "/", allow_discovery: false });
console.log(`PeerJS test server on http://localhost:${port}`);
