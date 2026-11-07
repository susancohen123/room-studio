"use client";
// Picture helpers that run in the browser: wall finishes, cutouts, exports.
import type { Finish, PlacedPiece, Stroke } from "./types";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load image"));
    img.src = src;
  });
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** White where the finish goes, transparent elsewhere. */
export function drawMask(strokes: Stroke[], w: number, h: number): HTMLCanvasElement {
  const c = canvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
    ctx.fillStyle = ctx.strokeStyle = "#fff";
    if (s.pts.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(s.pts[0] * w, s.pts[1] * h);
    for (let i = 2; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i] * w, s.pts[i + 1] * h);
    if (s.poly) {
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.lineWidth = Math.max(1, s.size * w);
      if (s.pts.length === 2) ctx.lineTo(s.pts[0] * w + 0.1, s.pts[1] * h);
      ctx.stroke();
    }
  }
  return c;
}

/**
 * Applies paint or a texture to the masked area while keeping the photo's own light and shadow,
 * so the new finish looks like it belongs in the room.
 */
export function compositeFinish(
  base: CanvasImageSource,
  w: number,
  h: number,
  strokes: Stroke[],
  finish: Finish | null,
  texture: HTMLImageElement | null,
): HTMLCanvasElement {
  const out = canvas(w, h);
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(base, 0, 0, out.width, out.height);
  if (!finish || !strokes.some((s) => !s.erase)) return out;

  const mask = drawMask(strokes, out.width, out.height).getContext("2d")!.getImageData(0, 0, out.width, out.height).data;
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;

  let fill: Uint8ClampedArray | null = null;
  let rgb: [number, number, number] | null = null;
  if (finish.kind === "paint") {
    rgb = hexToRgb(finish.hex ?? "") ?? [200, 200, 200];
  } else if (texture) {
    const t = canvas(out.width, out.height);
    const tctx = t.getContext("2d")!;
    const tileW = Math.max(8, (finish.scale || 0.15) * out.width);
    const tileH = tileW * (texture.height / texture.width);
    const tile = canvas(tileW, tileH);
    tile.getContext("2d")!.drawImage(texture, 0, 0, tile.width, tile.height);
    tctx.fillStyle = tctx.createPattern(tile, "repeat")!;
    tctx.fillRect(0, 0, t.width, t.height);
    fill = tctx.getImageData(0, 0, t.width, t.height).data;
  } else {
    return out;
  }

  // Average brightness of the area, so we keep relative light and shadow.
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) {
    if (mask[i + 3] > 127) { sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; }
  }
  const avg = n ? sum / n : 128;
  const strength = Math.min(1, Math.max(0, finish.strength ?? 0.9));

  for (let i = 0; i < d.length; i += 4) {
    const a = mask[i + 3] / 255;
    if (!a) continue;
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const f = Math.min(1.7, Math.max(0.3, lum / (avg || 1)));
    const r = (rgb ? rgb[0] : fill![i]) * f;
    const g = (rgb ? rgb[1] : fill![i + 1]) * f;
    const b = (rgb ? rgb[2] : fill![i + 2]) * f;
    const k = a * strength;
    d[i] = d[i] * (1 - k) + Math.min(255, r) * k;
    d[i + 1] = d[i + 1] * (1 - k) + Math.min(255, g) * k;
    d[i + 2] = d[i + 2] * (1 - k) + Math.min(255, b) * k;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Draws finish + furniture into one flat picture. */
export function flatten(
  finished: HTMLCanvasElement,
  pieces: { p: PlacedPiece; img: HTMLImageElement }[],
  maxW: number,
): HTMLCanvasElement {
  const scale = Math.min(1, maxW / finished.width);
  const c = canvas(finished.width * scale, finished.height * scale);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(finished, 0, 0, c.width, c.height);
  for (const { p, img } of pieces) {
    const w = p.w * c.width;
    const h = w * (img.height / img.width);
    ctx.save();
    ctx.translate(p.x * c.width, p.y * c.height);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();
  }
  return c;
}

/** Shrinks a photo before upload so uploads are quick even on slower internet. */
export async function prepPhoto(file: File, maxW = 1800): Promise<{ blob: Blob; w: number; h: number }> {
  let source: CanvasImageSource & { width: number; height: number };
  let url = "";
  try {
    // Fast path: the browser decodes and shrinks in one step.
    const probe = await createImageBitmap(file);
    const s = Math.min(1, maxW / probe.width);
    source = s < 1 ? await createImageBitmap(file, { resizeWidth: Math.round(probe.width * s), resizeQuality: "high" }) : probe;
  } catch {
    url = URL.createObjectURL(file);
    source = await loadImage(url);
  }
  try {
    const s = Math.min(1, maxW / source.width);
    const c = canvas(source.width * s, source.height * s);
    c.getContext("2d")!.drawImage(source, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.86));
    return { blob, w: c.width, h: c.height };
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

/**
 * Removes a plain (usually white) background from a product photo by flooding in from the edges,
 * then trims empty space. Works best on catalog-style photos.
 */
export async function cutout(file: File, tolerance = 40): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const s = Math.min(1, 1200 / Math.max(img.width, img.height));
    const c = canvas(img.width * s, img.height * s);
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const W = c.width, H = c.height;
    const data = ctx.getImageData(0, 0, W, H);
    const d = data.data;
    // Background color = average of the four corners.
    const corners = [0, W - 1, (H - 1) * W, H * W - 1];
    const bg = [0, 1, 2].map((k) => corners.reduce((t, p) => t + d[p * 4 + k], 0) / 4);
    const close = (p: number) => {
      const i = p * 4;
      return Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) < tolerance * 3 && d[i + 3] > 0;
    };
    const seen = new Uint8Array(W * H);
    const stack: number[] = [];
    for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
    while (stack.length) {
      const p = stack.pop()!;
      if (seen[p] || !close(p)) continue;
      seen[p] = 1;
      d[p * 4 + 3] = 0;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) stack.push(p - 1);
      if (x < W - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - W);
      if (y < H - 1) stack.push(p + W);
    }
    // Soften the edge by one pixel.
    for (let p = 0; p < W * H; p++) {
      if (seen[p]) continue;
      const x = p % W, y = (p / W) | 0;
      if ((x > 0 && seen[p - 1]) || (x < W - 1 && seen[p + 1]) || (y > 0 && seen[p - W]) || (y < H - 1 && seen[p + W])) d[p * 4 + 3] = 170;
    }
    ctx.putImageData(data, 0, 0);
    // Trim.
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
    const t = canvas(x1 - x0 + 1, y1 - y0 + 1);
    t.getContext("2d")!.drawImage(c, x0, y0, t.width, t.height, 0, 0, t.width, t.height);
    return await new Promise<Blob>((r) => t.toBlob((b) => r(b!), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadBlob(blob: Blob, folder: string, name = "image"): Promise<string> {
  const fd = new FormData();
  fd.append("file", new File([blob], name, { type: blob.type }));
  fd.append("folder", folder);
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Upload failed");
  return j.url as string;
}

export function download(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** "Room - Description - YYYY-MM-DD.png", with characters Windows dislikes removed. */
export function fileName(...parts: string[]) {
  const date = new Date().toISOString().slice(0, 10);
  return [...parts, date].map((p) => p.replace(/[\\/:*?"<>|]/g, "").trim()).filter(Boolean).join(" - ") + ".png";
}
