// Saves files and the workspace document.
// On your computer: a private ".data" folder next to the app.
// Online (Vercel): a PRIVATE Vercel Blob store, used automatically when the store is connected.
// Private means files can only be read through this app after signing in; there are no public links.
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const LOCAL_ROOT = path.join(process.cwd(), ".data");
const useBlob = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

async function blobRead(key: string, fresh: boolean): Promise<Buffer | null> {
  const { get } = await import("@vercel/blob");
  const r = await get(key, { access: "private", useCache: !fresh });
  if (!r || r.statusCode !== 200) return null;
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}

function safeKey(key: string): string {
  const clean = key.replace(/\\/g, "/").split("/").filter((p) => p && p !== "." && p !== "..");
  if (!clean.length) throw new Error("Bad file name");
  return clean.join("/");
}

export async function saveFile(folder: string, ext: string, data: Buffer, contentType: string): Promise<string> {
  const key = safeKey(`${folder}/${randomUUID()}.${ext.replace(/[^a-z0-9]/gi, "") || "bin"}`);
  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    await put(key, data, { access: "private", contentType, addRandomSuffix: false });
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
    try {
      const data = await blobRead(k, k.endsWith(".json"));
      return data ? { data, contentType } : null;
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
    const { put, copy } = await import("@vercel/blob");
    // Keep the previous save as a backup, then write the new one.
    try { await copy(WORKSPACE_KEY, "data/workspace.backup.json", { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" }); } catch {}
    await put(WORKSPACE_KEY, data, { access: "private", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 });
    return;
  }
  const full = path.join(LOCAL_ROOT, WORKSPACE_KEY);
  await fs.mkdir(path.dirname(full), { recursive: true });
  // Keep the previous save as a backup, then write the new one.
  try { await fs.copyFile(full, full + ".bak"); } catch {}
  await fs.writeFile(full, data);
}
