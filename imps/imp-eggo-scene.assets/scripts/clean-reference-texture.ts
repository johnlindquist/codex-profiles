#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

type RgbaImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

type Args = {
  input: string;
  out: string;
  force: boolean;
};

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function usage(): never {
  console.error(`Usage: bun clean-reference-texture.ts --input in.png --out out.png [--force]

Removes light pencil-grain texture from Eggo reference sheets while preserving
black linework, glasses, eyebrows, gesture marks, and darker cast shadows.`);
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { input: "", out: "", force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => argv[++i] ?? usage();
    if (arg === "--input") args.input = value();
    else if (arg === "--out") args.out = value();
    else if (arg === "--force") args.force = true;
    else if (arg === "--help" || arg === "-h") usage();
    else usage();
  }
  if (!args.input || !args.out) usage();
  if (!existsSync(args.input)) die(`Input image not found: ${args.input}`);
  if (existsSync(args.out) && !args.force) die(`Output already exists: ${args.out} (use --force)`);
  if (!args.out.toLowerCase().endsWith(".png")) die("--out must end in .png.");
  return args;
}

function die(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
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

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function cleanLightTexture(image: RgbaImage): number {
  let changed = 0;

  for (let i = 0; i < image.data.length; i += 4) {
    const alpha = image.data[i + 3];
    if (alpha === 0) continue;

    const r = image.data[i];
    const g = image.data[i + 1];
    const b = image.data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    const lightNeutralScratch = luminance >= 152 && chroma <= 42;
    const warmShellScratch = luminance >= 168 && chroma <= 72 && r >= g - 8 && g >= b - 18;
    if (!lightNeutralScratch && !warmShellScratch) continue;

    const strength = Math.min(1, Math.max(0, (luminance - 148) / 76));
    const target = luminance > 218 ? 255 : 244 + strength * 11;
    const preserve = luminance < 176 ? 0.35 : 0.12;

    image.data[i] = clamp(target * (1 - preserve) + r * preserve);
    image.data[i + 1] = clamp(target * (1 - preserve) + g * preserve);
    image.data[i + 2] = clamp(target * (1 - preserve) + b * preserve);
    changed++;
  }

  return changed;
}

const args = parseArgs(Bun.argv.slice(2));
const image = readPng(args.input);
const changed = cleanLightTexture(image);
writePng(args.out, image);
console.log(JSON.stringify({ input: args.input, out: args.out, width: image.width, height: image.height, changed }, null, 2));
