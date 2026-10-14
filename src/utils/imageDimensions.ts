import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Reserve the real image proportions before the browser downloads it.
export function imageDimensions(src?: string): { width?: number; height?: number } {
  if (!src?.startsWith('/images/') || !src.endsWith('.webp')) return {};
  const bytes = readFileSync(resolve('public', src.slice(1)));
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`Invalid WebP: ${src}`);
  const format = bytes.toString('ascii', 12, 16);
  if (format === 'VP8X') return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  if (format === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  if (format === 'VP8L') {
    const dimensions = bytes.readUInt32LE(21);
    return { width: (dimensions & 0x3fff) + 1, height: ((dimensions >>> 14) & 0x3fff) + 1 };
  }
  throw new Error(`Unsupported WebP: ${src}`);
}
