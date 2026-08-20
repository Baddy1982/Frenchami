import { build } from "esbuild";
import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.join(root, ".test-dist");
const output = path.join(outdir, "learningProgress.test.mjs");

await rm(outdir, { recursive: true, force: true });
await build({
  entryPoints: [path.join(root, "src/routes/learningProgress.test.ts")],
  outfile: output,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  external: ["express"],
});

const testProcess = spawn(process.execPath, ["--test", output], { stdio: "inherit" });
const exitCode = await new Promise((resolve) => testProcess.on("exit", (code) => resolve(code ?? 1)));
await rm(outdir, { recursive: true, force: true });
process.exitCode = exitCode;