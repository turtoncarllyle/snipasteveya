import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const tauri = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
const macos = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.macos.conf.json"), "utf8"));
const windows = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.windows.conf.json"), "utf8"));
const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
const packageScripts = packageJson.scripts;
const cargoVersion = readFileSync(resolve(root, "src-tauri/Cargo.toml"), "utf8").match(/^\[package\][\s\S]*?^version = "([^"]+)"/m)?.[1];
const cargoLockVersion = readFileSync(resolve(root, "src-tauri/Cargo.lock"), "utf8").match(/^name = "snipasteveya"\r?\nversion = "([^"]+)"/m)?.[1];

assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
for (const version of [tauri.version, lock.version, lock.packages[""].version, cargoVersion, cargoLockVersion]) {
  assert.equal(version, packageJson.version, "Release versions must agree");
}
assert.equal(tauri.productName, "SnipasteVeya");
assert.ok(tauri.bundle.targets.includes("nsis"));
assert.match(packageScripts["tauri:build:windows"], /--config\s+src-tauri\/tauri\.windows\.conf\.json/);
assert.match(packageScripts["tauri:build:macos"], /--config\s+src-tauri\/tauri\.macos\.conf\.json/);
assert.ok(macos.bundle.targets.includes("dmg"));
assert.equal(macos.bundle.macOS.minimumSystemVersion, "13.3");
assert.ok(macos.app.macOSPrivateApi, "Transparent pins require the macOS Tauri feature");
assert.ok(macos.bundle.macOS.frameworks.includes("runtime-macos/libonnxruntime.dylib"));
assert.ok(existsSync(resolve(root, "src-tauri/icons/icon.icns")), "macOS bundles need an ICNS icon");
assert.equal(tauri.bundle.windows.webviewInstallMode.type, "fixedRuntime");
assert.match(tauri.bundle.windows.webviewInstallMode.path, /^WebView2\/[^/]+$/);
assert.equal(windows.bundle.resources["runtime/"], ".", "Native runtime DLLs must be installed next to the executable");
assert.equal(windows.bundle.resources["resources/ocr/"], "resources/ocr/", "Windows bundles must include OCR models");
assert.equal(macos.bundle.resources["resources/ocr/"], "resources/ocr/", "macOS bundles must include OCR models");
assert.match(readFileSync(resolve(root, "README.md"), "utf8"), /F1/);
assert.match(readFileSync(resolve(root, "README.en.md"), "utf8"), /F3/);
assert.match(readFileSync(resolve(root, "README.md"), "utf8"), /macOS/);
assert.match(readFileSync(resolve(root, "README.en.md"), "utf8"), /macOS/);
assert.match(readFileSync(resolve(root, ".github/workflows/desktop-packages.yml"), "utf8"), /aarch64-apple-darwin/);
console.log("release contract passed");
