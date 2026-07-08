// Preload shim: give Node 20 a global WebSocket so @supabase/realtime-js
// initializes. Purely a test-harness convenience; production runs Node 22.
import ws from 'ws';
if (!globalThis.WebSocket) {
  globalThis.WebSocket = ws;
}
