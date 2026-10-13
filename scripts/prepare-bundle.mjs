import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

if (process.platform === "win32") {
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    join(root, "scripts", "prepare-bundle.ps1"),
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
} else if (process.platform === "darwin") {
  const { verifyMacRuntime } = await import("./prepare-macos-runtime.mjs");
  await verifyMacRuntime();
} else {
  throw new Error(`Unsupported packaging host: ${process.platform}. Use Windows or macOS.`);
}
