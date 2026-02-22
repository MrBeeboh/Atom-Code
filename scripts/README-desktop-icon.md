# Desktop icon from image

Creates a **high-resolution Windows .ico** (and a 256×256 PNG) from any image so it looks sharp as a desktop/shortcut icon.

## One-time setup

From the repo root (`atom-code`):

```bash
npm install
```

## Usage

```bash
# From atom-code folder
npm run make-desktop-icon -- <path-to-image> [output.ico]
```

**Examples:**

- Use your source image (PNG, JPG, WebP, or SVG); output goes next to it as `name.ico`:
  ```bash
  npm run make-desktop-icon -- C:\Path\To\my-logo.png
  ```
- Specify output path:
  ```bash
  npm run make-desktop-icon -- my-logo.png C:\Users\You\Desktop\ATOM.ico
  ```
- From the ATOM favicon (SVG):
  ```bash
  npm run make-desktop-icon -- public/favicon.svg public/atom.ico
  ```

**Tip:** For best quality, use a source image that’s at least **256×256** (or a vector SVG). If the source is very small, the script will warn you.

The script writes:

- **`.ico`** – multi-size icon (256, 128, 64, 48, 32, 24, 16 px) for Windows.
- **`-256.png`** – single 256×256 PNG for other uses.

Then set your shortcut icon: right‑click shortcut → Properties → Change Icon → Browse to the new `.ico`.
