#!/usr/bin/env node
/**
 * Create a high-resolution Windows desktop .ico from an image file.
 * Output includes 256, 128, 64, 48, 32, 24, 16 px for proper desktop/shortcut display.
 *
 * Usage:
 *   node scripts/make-desktop-icon.mjs <input-image> [output.ico]
 *
 * Examples:
 *   node scripts/make-desktop-icon.mjs my-logo.png
 *   node scripts/make-desktop-icon.mjs public/favicon.svg atom.ico
 *
 * Input: PNG, JPG, WebP, or SVG. For best quality use a source at least 256x256.
 */

import sharp from 'sharp';
import ico from 'sharp-ico';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, basename, extname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const inputPath = process.argv[2];
const outputArg = process.argv[3];

if (!inputPath) {
  console.error('Usage: node scripts/make-desktop-icon.mjs <input-image> [output.ico]');
  process.exit(1);
}

const resolvedInput = inputPath.startsWith('/') || /^[A-Za-z]:/.test(inputPath)
  ? inputPath
  : resolve(process.cwd(), inputPath);

if (!existsSync(resolvedInput)) {
  console.error('Input file not found:', resolvedInput);
  process.exit(1);
}

const base = basename(resolvedInput, extname(resolvedInput));
const defaultOutput = join(dirname(resolvedInput), `${base}.ico`);
const outputPath = outputArg
  ? (resolve(process.cwd(), outputArg))
  : defaultOutput;

// Desktop icon sizes: 256 is the main high-res size Windows uses for large icons
const SIZES = [256, 128, 64, 48, 32, 24, 16];

async function main() {
  const image = sharp(resolvedInput);
  const meta = await image.metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;

  if (w > 0 && h > 0 && (w < 48 || h < 48)) {
    console.warn(
      `Warning: source image is small (${w}x${h}). For a sharp desktop icon, use a source at least 256x256.`
    );
  }

  await ico.sharpsToIco(
    [image],
    outputPath,
    {
      sizes: SIZES,
      resizeOptions: { kernel: sharp.kernel.lanczos3 },
    }
  );

  console.log('Written:', outputPath);
  console.log('Sizes embedded:', SIZES.join(', '), 'px');

  // Also write a single 256x256 PNG for reference/high-res use
  const pngOut = outputPath.replace(/\.ico$/i, '-256.png');
  await sharp(resolvedInput)
    .resize(256, 256, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toFile(pngOut);
  console.log('Also written (256×256 PNG):', pngOut);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
