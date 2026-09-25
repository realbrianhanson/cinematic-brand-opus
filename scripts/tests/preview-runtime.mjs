import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

assert.notEqual(
  process.platform,
  "win32",
  "The runtime smoke test requires macOS or Linux for process-group cleanup",
);

// Reserve an available loopback port, then let the real preview command use it.
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const { port } = reservation.address();
await new Promise((resolve, reject) =>
  reservation.close((error) => (error ? reject(error) : resolve())),
);

const child = spawn(
  "npm",
  [
    "run",
    "preview",
    "--",
    "--port",
    String(port),
    "--inspector-port",
    "0",
    "--log-level",
    "error",
  ],
  {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      BROWSER: "none",
      // Exercise static-brand fallback without contacting the configured backend.
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
      CLOUDFLARE_INCLUDE_PROCESS_ENV: "false",
    },
  },
);
let output = "";
let startupError;
child.on("error", (error) => {
  startupError = error;
});
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-16_000);
  });
}
const closed = once(child, "close").catch(() => undefined);
const origin = `http://127.0.0.1:${port}`;

async function stop() {
  if (!child.pid) return;
  const signal = (value) => {
    try {
      process.kill(-child.pid, value);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  signal("SIGTERM");
  const stopped = await Promise.race([
    closed.then(() => true),
    delay(3_000).then(() => false),
  ]);
  if (!stopped) signal("SIGKILL");
}

try {
  const deadline = Date.now() + 45_000;
  let response;
  while (Date.now() < deadline) {
    if (startupError) throw startupError;
    assert.equal(child.exitCode, null, "Preview exited before serving a page");
    assert.equal(
      child.signalCode,
      null,
      "Preview was terminated during startup",
    );
    try {
      response = await fetch(`${origin}/admin/login`, {
        redirect: "manual",
        signal: AbortSignal.timeout(Math.min(5_000, deadline - Date.now())),
      });
      break;
    } catch {
      await delay(200);
    }
  }
  assert.ok(response, "Preview did not respond within 45 seconds");
  assert.equal(response.status, 200, "Login SSR must return HTTP 200");
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  const html = await response.text();
  assert.match(html, /<input\b[^>]*\bid="admin-email"/);
  assert.match(html, /<input\b[^>]*\bid="admin-password"/);
  assert.match(html, />Sign In</);

  const scriptPath = html.match(
    /<script\b[^>]*\bsrc="(\/assets\/[^"<>]+\.js)"/,
  );
  assert.ok(scriptPath, "Rendered login must include a compiled app script");
  const asset = await fetch(new URL(scriptPath[1], origin), {
    redirect: "manual",
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(asset.status, 200, "Compiled app script must be served");
  assert.match(asset.headers.get("content-type") ?? "", /javascript/);
  await asset.body?.cancel();
  console.log(
    "PASS: local production worker renders login and serves its app script",
  );
} catch (error) {
  if (output) console.error(output);
  throw error;
} finally {
  await stop();
}
