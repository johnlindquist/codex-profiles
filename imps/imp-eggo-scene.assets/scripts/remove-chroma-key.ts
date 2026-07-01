#!/usr/bin/env bun
import { inflateSync, deflateSync } from "node:zlib";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

type RgbaImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

type Args = {
  input: string;
  out: string;
  keyColor?: [number, number, number];
  autoKey: "none" | "corners" | "border";
  transparentThreshold: number;
  opaqueThreshold: number;
  tolerance: number;
  softMatte: boolean;
  edgeContract: number;
  despill: boolean;
  borderConnectedOnly: boolean;
  removeEnclosedKey: boolean;
  protectNeutrals: boolean;
  force: boolean;
};

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function usage(): never {
  console.error(`Usage: bun remove-chroma-key.ts --input in.png --out out.png [options]

Options:
  --key-color #00ff00
  --auto-key none|corners|border  default: border
  --soft-matte                    smooth alpha edge
  --transparent-threshold N       default: 12
  --opaque-threshold N            default: 80
  --tolerance N                   default: 18
  --edge-contract N               default: 0
  --despill                       reduce key-color spill
  --border-connected-only         remove only key-like pixels connected to image border
  --remove-enclosed-key           also remove strongly key-colored enclosed holes/halos
  --protect-neutrals              keep low-saturation whites/grays fully opaque
  --force                         overwrite output`);
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    input: "",
    out: "",
    autoKey: "border",
    transparentThreshold: 12,
    opaqueThreshold: 80,
    tolerance: 18,
    softMatte: false,
    edgeContract: 0,
    despill: false,
    borderConnectedOnly: false,
    removeEnclosedKey: false,
    protectNeutrals: false,
    force: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => argv[++i] ?? usage();
    if (arg === "--input") args.input = value();
    else if (arg === "--out") args.out = value();
    else if (arg === "--key-color") args.keyColor = parseHexColor(value());
    else if (arg === "--auto-key") {
      const mode = value();
      if (mode !== "none" && mode !== "corners" && mode !== "border") usage();
      args.autoKey = mode;
    } else if (arg === "--transparent-threshold") args.transparentThreshold = Number(value());
    else if (arg === "--opaque-threshold") args.opaqueThreshold = Number(value());
    else if (arg === "--tolerance") args.tolerance = Number(value());
    else if (arg === "--edge-contract") args.edgeContract = Number(value());
    else if (arg === "--soft-matte") args.softMatte = true;
    else if (arg === "--despill" || arg === "--spill-cleanup") args.despill = true;
    else if (arg === "--border-connected-only") args.borderConnectedOnly = true;
    else if (arg === "--remove-enclosed-key") args.removeEnclosedKey = true;
    else if (arg === "--protect-neutrals") args.protectNeutrals = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--help" || arg === "-h") usage();
    else usage();
  }

  if (!args.input || !args.out) usage();
  if (!existsSync(args.input)) die(`Input image not found: ${args.input}`);
  if (existsSync(args.out) && !args.force) die(`Output already exists: ${args.out} (use --force)`);
  if (!Number.isFinite(args.transparentThreshold) || !Number.isFinite(args.opaqueThreshold)) die("Thresholds must be numbers.");
  if (args.transparentThreshold >= args.opaqueThreshold) die("--transparent-threshold must be lower than --opaque-threshold.");
  if (!args.out.toLowerCase().endsWith(".png")) die("--out must end in .png.");

  return args;
}

function die(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseHexColor(raw: string): [number, number, number] {
  const match = raw.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!match) die("key color must look like #00ff00");
  const hex = match[1];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function readPng(path: string): RgbaImage {
  const file = readFileSync(path);
  if (!file.subarray(0, 8).equals(PNG_SIGNATURE)) die("Input is not a PNG.");

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];

  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.subarray(offset + 4, offset + 8).toString("ascii");
    const data = file.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8) die(`Unsupported PNG bit depth ${bitDepth}; expected 8.`);
  if (colorType !== 2 && colorType !== 6) die(`Unsupported PNG color type ${colorType}; expected RGB or RGBA.`);
  if (interlace !== 0) die("Interlaced PNGs are not supported.");

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const rows = unfilter(raw, width, height, channels);
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = y * stride + x * channels;
      const dst = (y * width + x) * 4;
      rgba[dst] = rows[src];
      rgba[dst + 1] = rows[src + 1];
      rgba[dst + 2] = rows[src + 2];
      rgba[dst + 3] = channels === 4 ? rows[src + 3] : 255;
    }
  }

  return { width, height, data: rgba };
}

function unfilter(raw: Buffer, width: number, height: number, channels: number): Uint8Array {
  const stride = width * channels;
  const out = new Uint8Array(stride * height);
  let input = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[input++];
    const rowStart = y * stride;
    const prevStart = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[rowStart + x - channels] : 0;
      const b = y > 0 ? out[prevStart + x] : 0;
      const c = y > 0 && x >= channels ? out[prevStart + x - channels] : 0;
      const value = raw[input++];
      let decoded: number;
      if (filter === 0) decoded = value;
      else if (filter === 1) decoded = value + a;
      else if (filter === 2) decoded = value + b;
      else if (filter === 3) decoded = value + Math.floor((a + b) / 2);
      else if (filter === 4) decoded = value + paeth(a, b, c);
      else die(`Unsupported PNG filter ${filter}.`);
      out[rowStart + x] = decoded & 255;
    }
  }

  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function writePng(path: string, image: RgbaImage) {
  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y++) {
    const row = y * (stride + 1);
    raw[row] = 0;
    Buffer.from(image.data.buffer, image.data.byteOffset + y * stride, stride).copy(raw, row + 1);
  }

  const chunks = [
    chunk("IHDR", ihdr(image.width, image.height)),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ];
  writeFileSync(path, Buffer.concat([PNG_SIGNATURE, ...chunks]));
}

function ihdr(width: number, height: number): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return out;
}

let crcTable: Uint32Array | undefined;
function crc32(buffer: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function sampleKey(image: RgbaImage, mode: Args["autoKey"], fallback: [number, number, number]): [number, number, number] {
  if (mode === "none") return fallback;

  const samples: [number, number, number][] = [];
  const push = (x: number, y: number) => {
    const i = (y * image.width + x) * 4;
    samples.push([image.data[i], image.data[i + 1], image.data[i + 2]]);
  };

  if (mode === "corners") {
    push(0, 0);
    push(image.width - 1, 0);
    push(0, image.height - 1);
    push(image.width - 1, image.height - 1);
  } else {
    const stepX = Math.max(1, Math.floor(image.width / 80));
    const stepY = Math.max(1, Math.floor(image.height / 80));
    for (let x = 0; x < image.width; x += stepX) {
      push(x, 0);
      push(x, image.height - 1);
    }
    for (let y = 0; y < image.height; y += stepY) {
      push(0, y);
      push(image.width - 1, y);
    }
  }

  return [median(samples.map((s) => s[0])), median(samples.map((s) => s[1])), median(samples.map((s) => s[2]))];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function channelDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

function smoothstep(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  return v * v * (3 - 2 * v);
}

function keyDominanceAlpha(rgb: [number, number, number], key: [number, number, number]): number {
  const max = Math.max(...key);
  if (max < 128) return 255;
  const keyChannels = [0, 1, 2].filter((i) => key[i] >= max - 16 && key[i] >= 128);
  const otherChannels = [0, 1, 2].filter((i) => !keyChannels.includes(i));
  const keyStrength = Math.min(...keyChannels.map((i) => rgb[i]));
  const otherStrength = Math.max(0, ...otherChannels.map((i) => rgb[i]));
  const dominance = keyStrength - otherStrength;
  // Background pixels strongly dominate the non-key channels. Subject greens
  // such as muted props, paper shadows, or reflected tones usually do not.
  // Keeping mild green dominance opaque prevents speckled holes in textured art.
  if (dominance < 56) return 255;
  const denominator = Math.max(1, max - otherStrength);
  return clamp(Math.round((1 - Math.min(1, dominance / denominator)) * 255));
}

function isProtectedNeutral(rgb: [number, number, number], key: [number, number, number], args: Args): boolean {
  if (!args.protectNeutrals) return false;
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  const saturation = max - min;
  const brightness = (rgb[0] + rgb[1] + rgb[2]) / 3;
  if (brightness < 96 || saturation > 24) return false;
  return channelDistance(rgb, key) > Math.max(6, Math.floor(args.tolerance / 2));
}

function keyCandidate(rgb: [number, number, number], key: [number, number, number], args: Args): boolean {
  if (isProtectedNeutral(rgb, key, args)) return false;
  if (strongKeyDominance(rgb, key)) return true;
  if (channelDistance(rgb, key) > args.tolerance) return false;
  return keyDominanceAlpha(rgb, key) <= 8;
}

function keyish(data: Uint8Array, offset: number, key: [number, number, number], tolerance: number): boolean {
  return channelDistance([data[offset], data[offset + 1], data[offset + 2]], key) <= tolerance;
}

function strongKeyDominance(rgb: [number, number, number], key: [number, number, number]): boolean {
  const max = Math.max(...key);
  if (max < 128) return false;
  const keyChannels = [0, 1, 2].filter((i) => key[i] >= max - 16 && key[i] >= 128);
  if (keyChannels.length !== 1) return false;
  const keyIndex = keyChannels[0];
  const other = [0, 1, 2].filter((i) => i !== keyIndex);
  const keyValue = rgb[keyIndex];
  const otherMax = Math.max(rgb[other[0]], rgb[other[1]]);
  const otherMin = Math.min(rgb[other[0]], rgb[other[1]]);
  return keyValue >= 128 && keyValue - otherMax >= 36 && keyValue > otherMax * 1.18 && keyValue - otherMin >= 48;
}

function borderConnectedMask(image: RgbaImage, key: [number, number, number], args: Args): Uint8Array {
  const { width, height, data } = image;
  const mask = new Uint8Array(width * height);
  const queue: number[] = [];

  const tryPush = (x: number, y: number) => {
    const p = y * width + x;
    if (mask[p]) return;
    const i = p * 4;
    const rgb: [number, number, number] = [data[i], data[i + 1], data[i + 2]];
    if (!keyCandidate(rgb, key, args)) return;
    mask[p] = 1;
    queue.push(p);
  };

  for (let x = 0; x < width; x++) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }

  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    const x = p % width;
    const y = Math.floor(p / width);
    if (x > 0) tryPush(x - 1, y);
    if (x < width - 1) tryPush(x + 1, y);
    if (y > 0) tryPush(x, y - 1);
    if (y < height - 1) tryPush(x, y + 1);
  }

  return mask;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function removeKey(image: RgbaImage, args: Args): {
  key: [number, number, number];
  transparentPixels: number;
  alphaPixels: number;
  opaqueBbox?: { x: number; y: number; width: number; height: number };
  opaqueBboxPct?: { x: number; y: number; width: number; height: number };
  marginPct: { top: number; right: number; bottom: number; left: number };
  subjectCoveragePct: number;
  greenFringePct: number;
  geometryGate: { safeMarginPass: boolean; subjectCoveragePass: boolean; greenFringePass: boolean };
  bandCoverage: [number, number, number];
} {
  const key = sampleKey(image, args.autoKey, args.keyColor ?? [0, 255, 0]);
  const backgroundMask = args.borderConnectedOnly ? borderConnectedMask(image, key, args) : undefined;
  let transparentPixels = 0;
  let alphaPixels = 0;

  for (let i = 0; i < image.data.length; i += 4) {
    const rgb: [number, number, number] = [image.data[i], image.data[i + 1], image.data[i + 2]];
    const distance = channelDistance(rgb, key);
    let alpha = 255;
    const pixel = i / 4;
    const isKeyCandidate = keyCandidate(rgb, key, args);
    const canRemove = !backgroundMask || backgroundMask[pixel] === 1 || (args.removeEnclosedKey && isKeyCandidate);
    if (canRemove && args.softMatte && !isProtectedNeutral(rgb, key, args)) {
      if (distance <= args.transparentThreshold) alpha = 0;
      else if (distance < args.opaqueThreshold) {
        const ratio = (distance - args.transparentThreshold) / (args.opaqueThreshold - args.transparentThreshold);
        alpha = clamp(Math.round(255 * smoothstep(ratio)));
      }
      alpha = Math.min(alpha, keyDominanceAlpha(rgb, key));
    } else if (canRemove && isKeyCandidate) {
      alpha = 0;
    }
    alpha = Math.round(alpha * (image.data[i + 3] / 255));

    if (alpha <= 8) {
      image.data[i] = 0;
      image.data[i + 1] = 0;
      image.data[i + 2] = 0;
      image.data[i + 3] = 0;
      transparentPixels++;
    } else {
      if (args.despill && alpha < 255) {
        image.data[i + 1] = Math.min(image.data[i + 1], Math.max(image.data[i], image.data[i + 2]));
      }
      image.data[i + 3] = alpha;
      if (alpha < 255) alphaPixels++;
    }
  }

  if (args.edgeContract > 0) contractAlpha(image, args.edgeContract);
  if (args.despill) despillBoundary(image, key);
  const stats = alphaStats(image, key);
  return {
    key,
    transparentPixels,
    alphaPixels,
    opaqueBbox: stats.opaqueBbox,
    opaqueBboxPct: stats.opaqueBboxPct,
    marginPct: stats.marginPct,
    subjectCoveragePct: stats.subjectCoveragePct,
    greenFringePct: stats.greenFringePct,
    geometryGate: stats.geometryGate,
    bandCoverage: stats.bandCoverage,
  };
}

function despillBoundary(image: RgbaImage, key: [number, number, number]) {
  const { width, height, data } = image;
  const max = Math.max(...key);
  if (max < 128) return;
  const keyChannels = [0, 1, 2].filter((i) => key[i] >= max - 16 && key[i] >= 128);
  if (keyChannels.length !== 1) return;
  const keyIndex = keyChannels[0];
  const other = [0, 1, 2].filter((i) => i !== keyIndex);
  const next = new Uint8Array(data);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] <= 8 || !touchesTransparent(image, x, y)) continue;
      const keyValue = data[i + keyIndex];
      const otherMax = Math.max(data[i + other[0]], data[i + other[1]]);
      if (keyValue - otherMax < 18) continue;
      next[i + keyIndex] = Math.min(keyValue, otherMax);
    }
  }

  data.set(next);
}

function touchesTransparent(image: RgbaImage, x: number, y: number): boolean {
  const { width, height, data } = image;
  for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy++) {
    for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) {
      if (xx === x && yy === y) continue;
      if (data[(yy * width + xx) * 4 + 3] <= 8) return true;
    }
  }
  return false;
}

function alphaStats(image: RgbaImage, key: [number, number, number]): {
  opaqueBbox?: { x: number; y: number; width: number; height: number };
  opaqueBboxPct?: { x: number; y: number; width: number; height: number };
  marginPct: { top: number; right: number; bottom: number; left: number };
  subjectCoveragePct: number;
  greenFringePct: number;
  geometryGate: { safeMarginPass: boolean; subjectCoveragePass: boolean; greenFringePass: boolean };
  bandCoverage: [number, number, number];
} {
  const { width, height, data } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let opaqueCount = 0;
  let greenFringePixels = 0;
  const bandOpaque = [0, 0, 0];
  const bandTotal = [0, 0, 0];

  for (let y = 0; y < height; y++) {
    const band = Math.min(2, Math.floor((y / height) * 3));
    for (let x = 0; x < width; x++) {
      bandTotal[band]++;
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 8) {
        opaqueCount++;
        bandOpaque[band]++;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        if (touchesTransparent(image, x, y) && keyish(data, (y * width + x) * 4, key, 64)) greenFringePixels++;
      }
    }
  }

  const bandCoverage = bandOpaque.map((count, i) => Number((count / Math.max(1, bandTotal[i])).toFixed(4))) as [number, number, number];
  const subjectCoveragePct = Number(((opaqueCount / Math.max(1, width * height)) * 100).toFixed(2));
  const greenFringePct = Number(((greenFringePixels / Math.max(1, opaqueCount)) * 100).toFixed(3));
  if (maxX < minX || maxY < minY) {
    return {
      marginPct: { top: 100, right: 100, bottom: 100, left: 100 },
      subjectCoveragePct,
      greenFringePct,
      geometryGate: { safeMarginPass: false, subjectCoveragePass: false, greenFringePass: greenFringePct <= 0.35 },
      bandCoverage,
    };
  }
  const opaqueBbox = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const opaqueBboxPct = {
    x: pct(minX, width),
    y: pct(minY, height),
    width: pct(opaqueBbox.width, width),
    height: pct(opaqueBbox.height, height),
  };
  const marginPct = {
    top: pct(minY, height),
    right: pct(width - maxX - 1, width),
    bottom: pct(height - maxY - 1, height),
    left: pct(minX, width),
  };
  return {
    opaqueBbox,
    opaqueBboxPct,
    marginPct,
    subjectCoveragePct,
    greenFringePct,
    geometryGate: {
      safeMarginPass: marginPct.left >= 4 && marginPct.right >= 4 && marginPct.top >= 4 && marginPct.bottom >= 4,
      subjectCoveragePass: subjectCoveragePct >= 12 && subjectCoveragePct <= 78,
      greenFringePass: greenFringePct <= 0.35,
    },
    bandCoverage,
  };
}

function pct(value: number, total: number): number {
  return Number(((value / Math.max(1, total)) * 100).toFixed(2));
}

function contractAlpha(image: RgbaImage, iterations: number) {
  const { width, height, data } = image;
  for (let iter = 0; iter < iterations; iter++) {
    const next = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let min = 255;
        for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy++) {
          for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) {
            min = Math.min(min, data[(yy * width + xx) * 4 + 3]);
          }
        }
        next[y * width + x] = min;
      }
    }
    for (let i = 0; i < next.length; i++) data[i * 4 + 3] = next[i];
  }
}

const args = parseArgs(process.argv.slice(2));
const image = readPng(args.input);
const result = removeKey(image, args);
writePng(args.out, image);

console.log(JSON.stringify({
  input: args.input,
  out: args.out,
  width: image.width,
  height: image.height,
  key: `#${result.key.map((v) => v.toString(16).padStart(2, "0")).join("")}`,
  transparentPixels: result.transparentPixels,
  alphaPixels: result.alphaPixels,
  opaqueBbox: result.opaqueBbox,
  opaqueBboxPct: result.opaqueBboxPct,
  marginPct: result.marginPct,
  subjectCoveragePct: result.subjectCoveragePct,
  greenFringePct: result.greenFringePct,
  geometryGate: result.geometryGate,
  bandCoverage: result.bandCoverage,
  borderConnectedOnly: args.borderConnectedOnly,
  removeEnclosedKey: args.removeEnclosedKey,
  protectNeutrals: args.protectNeutrals,
}));
