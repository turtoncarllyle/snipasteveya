import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const directory = resolve(process.argv[2] ?? "release-assets");
const expectedNames = ["win-x64-setup.exe", "win-x64-portable.zip", "macos-x64.dmg", "macos-arm64.dmg"]
  .map(suffix => `SnipasteVeya-${version}-${suffix}`);
const manifest = new Map();
for (const file of ["SHA256SUMS.txt", "SHA256SUMS-x64.txt", "SHA256SUMS-arm64.txt"]) {
  for (const line of readFileSync(resolve(directory, file), "utf8").trim().split(/\r?\n/)) {
    const entry = line.match(/^([a-f\d]{64})\s{2}([^/\\]+)$/i);
    assert.ok(entry, `Invalid checksum in ${file}`);
    assert.ok(expectedNames.includes(entry[2]), `Unexpected asset ${entry[2]}`);
    assert.ok(!manifest.has(entry[2]), `Duplicate asset ${entry[2]}`);
    manifest.set(entry[2], entry[1].toLowerCase());
  }
}
const lines = [];
for (const name of expectedNames) {
  const digest = createHash("sha256");
  for await (const bytes of createReadStream(resolve(directory, name))) digest.update(bytes);
  const hash = digest.digest("hex");
  assert.equal(hash, manifest.get(name), `Checksum mismatch: ${name}`);
  lines.push(`${hash}  ${name}`);
}
writeFileSync(resolve(directory, "SHA256SUMS.txt"), `${lines.join("\n")}\n`, "utf8");
console.log("All four desktop packages verified; wrote combined SHA256SUMS.txt.");
