import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const envFile = join(root, ".env");
const args = [
  join(root, "node_modules/wrangler/bin/wrangler.js"),
  "dev",
  "--local",
  "--config",
  ".output/server/wrangler.json",
  "--ip",
  "127.0.0.1",
];
// Wrangler resolves relative env paths from the generated config directory.
if (
  process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV !== "false" &&
  existsSync(envFile)
) {
  args.push("--env-file", envFile);
}
const child = spawn(process.execPath, [...args, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
