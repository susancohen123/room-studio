import { requireAuth } from "@/lib/auth";
import { readFile } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { key } = await params;
  const f = await readFile(key.join("/"));
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: { "content-type": f.contentType, "cache-control": "private, max-age=31536000, immutable" },
  });
}
