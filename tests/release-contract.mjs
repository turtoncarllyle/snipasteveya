import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const tauri = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));

assert.equal(packageJson.version, "0.1.0");
assert.equal(tauri.version, "0.1.0");
assert.equal(tauri.productName, "SnipasteVeya");
assert.match(readFileSync(resolve(root, "README.md"), "utf8"), /F1/);
assert.match(readFileSync(resolve(root, "README.en.md"), "utf8"), /F3/);
console.log("release contract passed");
