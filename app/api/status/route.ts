import { requireAuth } from "@/lib/auth";
import { engine } from "@/lib/render";

export const dynamic = "force-dynamic";

/** Says whether keys are set on the server. Never returns the keys themselves. */
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  return Response.json({ chat: !!process.env.ANTHROPIC_API_KEY, pictures: engine() !== null });
}
