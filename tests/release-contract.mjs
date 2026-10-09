import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const tauri = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
const cargoVersion = readFileSync(resolve(root, "src-tauri/Cargo.toml"), "utf8").match(/^\[package\][\s\S]*?^version = "([^"]+)"/m)?.[1];
const cargoLockVersion = readFileSync(resolve(root, "src-tauri/Cargo.lock"), "utf8").match(/^name = "snipasteveya"\r?\nversion = "([^"]+)"/m)?.[1];

assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
for (const version of [tauri.version, lock.version, lock.packages[""].version, cargoVersion, cargoLockVersion]) {
  assert.equal(version, packageJson.version, "Release versions must agree");
}
assert.equal(tauri.productName, "SnipasteVeya");
assert.equal(tauri.bundle.windows.webviewInstallMode.type, "fixedRuntime");
assert.match(tauri.bundle.windows.webviewInstallMode.path, /^WebView2\/[^/]+$/);
assert.equal(tauri.bundle.resources["runtime/"], ".", "Native runtime DLLs must be installed next to the executable");
assert.match(readFileSync(resolve(root, "README.md"), "utf8"), /F1/);
assert.match(readFileSync(resolve(root, "README.en.md"), "utf8"), /F3/);
console.log("release contract passed");
