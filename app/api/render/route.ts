import { requireAuth } from "@/lib/auth";
import { aiEditImage, SetupNeeded } from "@/lib/render";

export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { image, instruction } = (await req.json().catch(() => ({}))) as { image?: string; instruction?: string };
  if (!image?.startsWith("data:image/") || !instruction) {
    return Response.json({ error: "Missing picture or instructions." }, { status: 400 });
  }
  try {
    const url = await aiEditImage(image, instruction);
    return Response.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    return Response.json({ error: msg, setup: e instanceof SetupNeeded }, { status: e instanceof SetupNeeded ? 501 : 500 });
  }
}
