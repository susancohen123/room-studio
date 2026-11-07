// Saves files and the workspace document.
// On your computer: a private ".data" folder next to the app.
// Online (Vercel): Vercel Blob storage, used automatically when BLOB_READ_WRITE_TOKEN is set.
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const LOCAL_ROOT = path.join(process.cwd(), ".data");
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

function safeKey(key: string): string {
  const clean = key.replace(/\\/g, "/").split("/").filter((p) => p && p !== "." && p !== "..");
  if (!clean.length) throw new Error("Bad file name");
  return clean.join("/");
}

export async function saveFile(folder: string, ext: string, data: Buffer, contentType: string): Promise<string> {
  const key = safeKey(`${folder}/${randomUUID()}.${ext.replace(/[^a-z0-9]/gi, "") || "bin"}`);
  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    await put(key, data, { access: "public", contentType, addRandomSuffix: false });
  } else {
    const full = path.join(LOCAL_ROOT, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }
  return `/api/files/${key}`;
}

export async function readFile(key: string): Promise<{ data: Buffer; contentType: string } | null> {
  const k = safeKey(key);
  const ext = k.split(".").pop()?.toLowerCase() ?? "";
  const types: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", json: "application/json" };
  const contentType = types[ext] ?? "application/octet-stream";
  if (useBlob()) {
    const { head } = await import("@vercel/blob");
    try {
      const meta = await head(k);
      const r = await fetch(meta.url, { cache: "no-store" });
      if (!r.ok) return null;
      return { data: Buffer.from(await r.arrayBuffer()), contentType };
    } catch {
      return null;
    }
  }
  try {
    return { data: await fs.readFile(path.join(LOCAL_ROOT, k)), contentType };
  } catch {
    return null;
  }
}

const WORKSPACE_KEY = "data/workspace.json";

export async function loadWorkspaceRaw(): Promise<string | null> {
  const f = await readFile(WORKSPACE_KEY);
  return f ? f.data.toString("utf8") : null;
}

export async function saveWorkspaceRaw(json: string): Promise<void> {
  const data = Buffer.from(json, "utf8");
  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    await put(WORKSPACE_KEY, data, { access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  const full = path.join(LOCAL_ROOT, WORKSPACE_KEY);
  await fs.mkdir(path.dirname(full), { recursive: true });
  // Keep the previous save as a backup, then write the new one.
  try { await fs.copyFile(full, full + ".bak"); } catch {}
  await fs.writeFile(full, data);
}
