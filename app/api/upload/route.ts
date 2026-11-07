import { requireAuth } from "@/lib/auth";
import { saveFile } from "@/lib/storage";

const OK: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX = 15 * 1024 * 1024;

export async function POST(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const form = await req.formData();
  const file = form.get("file");
  const folder = String(form.get("folder") ?? "uploads").replace(/[^a-z0-9-]/gi, "") || "uploads";
  if (!(file instanceof File)) return Response.json({ error: "No file received." }, { status: 400 });
  const ext = OK[file.type];
  if (!ext) return Response.json({ error: "Please use a JPG, PNG or WebP image." }, { status: 400 });
  if (file.size > MAX) return Response.json({ error: "That image is over 15 MB." }, { status: 400 });
  const url = await saveFile(folder, ext, Buffer.from(await file.arrayBuffer()), file.type);
  return Response.json({ url });
}
