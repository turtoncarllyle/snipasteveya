import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = "1.22.0";
const runtimeVariants = {
  arm64: {
    archiveHash: "cab6dcbd77e7ec775390e7b73a8939d45fec3379b017c7cb74f5b204c1a1cc07",
    libraryHash: "2b885992d3d6fa4130d39ec84a80d7504ff52750027c547bb22c86165f19406a",
  },
  x64: {
    archiveHash: "e4ec94a7696de74fb1b12846569aa94e499958af6ffa186022cfde16c9d617f0",
    libraryHash: "283e595e61cf65df7a6b1d59a1616cbd35c8b6399dd90d799d99b71a3ff83160",
  },
};
const requestedArch = process.env.SNIPASTEVeya_MAC_ARCH ?? process.arch;
const arch = requestedArch === "arm64" ? "arm64" : requestedArch === "x64" ? "x64" : null;
if (!arch) throw new Error(`Unsupported macOS runtime architecture: ${requestedArch}`);
const name = `onnxruntime-osx-${arch}-${version}`;
const { archiveHash, libraryHash } = runtimeVariants[arch];
const directory = join(root, "src-tauri", "runtime-macos");

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifyMacRuntime() {
  if (await sha256(join(directory, "libonnxruntime.dylib")) !== libraryHash) {
    throw new Error("Bundled macOS ONNX Runtime checksum mismatch. Run npm run prepare:runtime.");
  }
  for (const file of ["LICENSE", "ThirdPartyNotices.txt"]) {
    if (!(await readFile(join(directory, file), "utf8")).trim()) throw new Error(`Missing ${file}`);
  }
}

export async function prepareMacRuntime() {
  const cache = join(root, ".tooling", "downloads");
  const archive = join(cache, `${name}.tgz`);
  await mkdir(cache, { recursive: true });
  try {
    await verifyMacRuntime();
    console.log(`Verified bundled macOS ONNX Runtime ${version} (${arch}).`);
    return;
  } catch { /* Stage from the verified archive below. */ }
  if (!(await stat(archive).catch(() => null))) {
    const url = `https://github.com/microsoft/onnxruntime/releases/download/v1.22.0/${name}.tgz`;
    const response = await fetch(url, { signal: AbortSignal.timeout(600_000) });
    if (!response.ok || !response.body) throw new Error(`ONNX Runtime download failed: ${response.status}`);
    const pending = `${archive}.partial`;
    await pipeline(Readable.fromWeb(response.body), createWriteStream(pending));
    if (await sha256(pending) !== archiveHash) throw new Error("ONNX Runtime archive checksum mismatch");
    await rename(pending, archive);
  }
  if (await sha256(archive) !== archiveHash) throw new Error("Cached ONNX Runtime archive checksum mismatch");
  const members = ["lib/libonnxruntime.1.22.0.dylib", "LICENSE", "ThirdPartyNotices.txt"];
  execFileSync("tar", ["-xzf", archive, "-C", cache, ...members.map(file => `${name}/${file}`)], { stdio: "inherit" });
  await mkdir(directory, { recursive: true });
  await copyFile(join(cache, name, members[0]), join(directory, "libonnxruntime.dylib"));
  for (const file of members.slice(1)) await copyFile(join(cache, name, file), join(directory, file));
  await verifyMacRuntime();
  console.log(`Prepared macOS ONNX Runtime ${version} (${arch}) with licenses; no user download is needed.`);
}
