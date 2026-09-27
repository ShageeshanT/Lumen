// Subscribes to /v1/ws on the test control plane and prints every event with
// its latency (receive time minus the event's `at`, which is when the change
// was written). Usage: node watch-ws.mjs <env-dir> <topic> <seconds>
// Uses Node's built-in WebSocket; the test CA is trusted via NODE_EXTRA_CA_CERTS.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [envDir, topic, seconds = "60"] = process.argv.slice(2);
const token = readFileSync(resolve(envDir, "admin.token"), "utf8").trim();
const ws = new WebSocket("wss://localhost:4204/v1/ws", ["lumen.v1", `auth.${token}`]);
ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ type: "subscribe", topics: [topic] }));
});
ws.addEventListener("message", (m) => {
  const msg = JSON.parse(String(m.data));
  if (msg.type !== "event") {
    return;
  }
  const e = msg.event;
  const now = Date.now();
  const extra =
    e.status ?? e.agent_update?.status ?? (e.sample ? `disk_low=${String(e.sample.disk_low)}` : "");
  console.log(
    `${new Date(now).toISOString().slice(11, 23)}  ${e.type.padEnd(16)} ${String(extra).padEnd(10)} latency ${String(now - Date.parse(e.at))} ms`,
  );
});
ws.addEventListener("error", (e) => {
  console.error("ws error", e.message ?? e);
});
setTimeout(() => process.exit(0), Number(seconds) * 1000);
