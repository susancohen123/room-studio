import { requireAuth } from "@/lib/auth";
import { aiEditImage, SetupNeeded, type Reference } from "@/lib/render";

export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { image, instruction, references } = (await req.json().catch(() => ({}))) as {
    image?: string; instruction?: string; references?: Reference[];
  };
  if (!image?.startsWith("data:image/") || !instruction) {
    return Response.json({ error: "Missing picture or instructions." }, { status: 400 });
  }
  const refs = (Array.isArray(references) ? references : [])
    .filter((r) => typeof r?.url === "string" && r.url.startsWith("/api/files/") && typeof r.label === "string")
    .map((r) => ({ url: r.url, label: r.label.slice(0, 200) }));
  try {
    const url = await aiEditImage(image, instruction, refs);
    return Response.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    console.error("render failed:", msg);
    return Response.json({ error: msg, setup: e instanceof SetupNeeded }, { status: e instanceof SetupNeeded ? 501 : 500 });
  }
}
