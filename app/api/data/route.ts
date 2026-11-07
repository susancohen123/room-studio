import { requireAuth } from "@/lib/auth";
import { loadWorkspaceRaw, saveWorkspaceRaw } from "@/lib/storage";
import { emptyWorkspace } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  const raw = await loadWorkspaceRaw();
  return new Response(raw ?? JSON.stringify(emptyWorkspace()), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function PUT(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const text = await req.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return Response.json({ error: "Could not read the data." }, { status: 400 });
  }
  const ws = parsed as { version?: number; clients?: unknown };
  if (ws?.version !== 1 || !Array.isArray(ws.clients)) {
    return Response.json({ error: "Unexpected data shape." }, { status: 400 });
  }
  await saveWorkspaceRaw(text);
  return Response.json({ ok: true });
}
