import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

function decodeRgbaPng(png: Buffer): Uint8Array {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString();
    if (type === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = new Uint8Array(stride * height);
  const paeth = (a: number, b: number, c: number) => {
    const prediction = a + b - c;
    const distanceA = Math.abs(prediction - a);
    const distanceB = Math.abs(prediction - b);
    const distanceC = Math.abs(prediction - c);
    return distanceA <= distanceB && distanceA <= distanceC ? a : distanceB <= distanceC ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + x + 1];
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const above = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      const predictor = filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : filter === 4 ? paeth(left, above, upperLeft) : 0;
      pixels[y * stride + x] = (value + predictor) & 255;
    }
  }
  return pixels;
}

describe("logo asset", () => {
  it("uses a PNG color type with transparency", () => {
    const png = readFileSync(new URL("../public/dsrd-logo.png", import.meta.url));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([4, 6]).toContain(png[25]);
  });

  it("contains no white pixels that can bleed through transparent logo edges", () => {
    const pixels = decodeRgbaPng(readFileSync(new URL("../public/dsrd-logo.png", import.meta.url)));
    let whiteArtifacts = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const [red, green, blue, alpha] = pixels.subarray(index, index + 4);
      const hiddenWhite = alpha === 0 && red > 220 && green > 220 && blue > 220;
      const visibleWhite = alpha > 0 && Math.max(red, green, blue) - Math.min(red, green, blue) < 35 && red > 180;
      if (hiddenWhite || visibleWhite) whiteArtifacts++;
    }
    expect(whiteArtifacts).toBe(0);
  });
});
