// A file handed over with no type and no telling name is known by its first bytes
// (src/lib/media-client.ts sniffKind, 2026-10-29). Run: npx tsx tests/sniff.test.ts
import assert from "node:assert/strict";
import { sniffKind } from "../src/lib/media-client";

const bytes = (...parts: (number[] | string)[]) => new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const ftyp = (brand: string) => bytes([0, 0, 0, 24], "ftyp", brand, [0, 0, 0, 0]);

assert.equal(sniffKind(bytes([0xff, 0xd8, 0xff, 0xe1], [0, 0, 0, 0])), "photo", "jpeg");
assert.equal(sniffKind(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "photo", "png");
assert.equal(sniffKind(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ")), "photo", "webp");
assert.equal(sniffKind(bytes("GIF89a")), "photo", "gif");
assert.equal(sniffKind(ftyp("heic")), "photo", "iPhone heic");
assert.equal(sniffKind(ftyp("mif1")), "photo", "heif");
assert.equal(sniffKind(ftyp("avif")), "photo", "avif");
assert.equal(sniffKind(ftyp("isom")), "video", "mp4");
assert.equal(sniffKind(ftyp("qt  ")), "video", "iPhone mov");
assert.equal(sniffKind(bytes([0x1a, 0x45, 0xdf, 0xa3])), "video", "webm");
assert.equal(sniffKind(bytes("%PDF-1.7")), null, "not a picture or a video");
assert.equal(sniffKind(new Uint8Array(0)), null, "empty");
console.log("sniff ✓ (12 checks)");
