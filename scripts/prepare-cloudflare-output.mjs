import { cpSync, existsSync, rmSync } from "node:fs";

// Cloudflare's deploy command in this project expects dist/server/wrangler.json.
// Newer builds already emit dist/*; older/cloud CI builds may emit .output/*.
// Keep both cases working without changing the Cloudflare deploy command.
if (!existsSync("dist/server/wrangler.json") && existsSync(".output/server/wrangler.json")) {
  rmSync("dist", { recursive: true, force: true });
  cpSync(".output", "dist", { recursive: true });
}

if (!existsSync("dist/server/wrangler.json")) {
  throw new Error("Cloudflare config was not generated at dist/server/wrangler.json");
}