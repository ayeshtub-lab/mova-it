// A picture's fingerprint (2026-11-10, «خطة زاومو الذهبية»): the same photo sent again, or one nearly
// the same (a second press of the shutter), is told apart from a new angle before it goes up.
// A difference hash: the picture made 9×8 and grey, each pixel compared with its right neighbour —
// 64 bits that change little when a photo is compressed, resized or renamed, and a lot when the
// angle or the zoom changes. Written as 16 hex digits. Made on the phone for new shots
// (src/lib/media-client.ts) and on the server for older ones (src/server/dhash.ts), the same way.

export const DHASH_W = 9;
export const DHASH_H = 8;

// `grey`: DHASH_W × DHASH_H values, row by row.
export function dhashFromGrey(grey: ArrayLike<number>): string {
  let hex = "";
  let nibble = 0;
  let bits = 0;
  for (let y = 0; y < DHASH_H; y++) {
    for (let x = 0; x < DHASH_W - 1; x++) {
      nibble = (nibble << 1) | (grey[y * DHASH_W + x] > grey[y * DHASH_W + x + 1] ? 1 : 0);
      if (++bits === 4) {
        hex += nibble.toString(16);
        nibble = 0;
        bits = 0;
      }
    }
  }
  return hex;
}

// The phone and the server both first make the picture 32×32 in grey (each their own way — close, not
// identical), then THIS same averaging makes the 9×8 the fingerprint is read from: the same code on
// both sides keeps a photo's two fingerprints close (measured 2026-11-10).
export const MID = 32;
export function dhashFrom32(grey32: ArrayLike<number>): string {
  const small: number[] = [];
  for (let y = 0; y < DHASH_H; y++) {
    const y0 = Math.floor((y * MID) / DHASH_H);
    const y1 = Math.floor(((y + 1) * MID) / DHASH_H);
    for (let x = 0; x < DHASH_W; x++) {
      const x0 = Math.floor((x * MID) / DHASH_W);
      const x1 = Math.floor(((x + 1) * MID) / DHASH_W);
      let sum = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += grey32[yy * MID + xx];
      small.push(sum / ((y1 - y0) * (x1 - x0)));
    }
  }
  return dhashFromGrey(small);
}

// RGBA pixels (a canvas's ImageData) → grey, as the eye weighs the colours.
export function greyFromRgba(rgba: ArrayLike<number>): number[] {
  const grey: number[] = [];
  for (let i = 0; i < rgba.length; i += 4) grey.push(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
  return grey;
}

export const isDhash = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{16}$/.test(value);

// How many of the 64 bits differ.
export function hamming(a: string, b: string) {
  let n = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      n += x & 1;
      x >>= 1;
    }
  }
  return n;
}

// The same photo (re-saved, resized, renamed) stays within a few bits; a burst of the same view a
// little more; a real new angle or zoom far more.
export const SAME_PHOTO_BITS = 6;
export const TOO_CLOSE_BITS = 10;
