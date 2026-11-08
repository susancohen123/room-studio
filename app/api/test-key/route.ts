import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { requireAuth } from "@/lib/auth";

/** Checks a key with a free "list models" call. The key is used once and not stored. */
export async function POST(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { provider } = (await req.json().catch(() => ({}))) as { provider?: string };
  try {
    if (provider === "anthropic") {
      const apiKey = req.headers.get("x-anthropic-key") || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return Response.json({ ok: false, error: "No key entered yet." });
      await new Anthropic({ apiKey }).models.list({ limit: 1 });
      return Response.json({ ok: true });
    }
    if (provider === "gemini") {
      const apiKey = req.headers.get("x-gemini-key") || process.env.GEMINI_API_KEY;
      if (!apiKey) return Response.json({ ok: false, error: "No key entered yet." });
      const pager = await new GoogleGenAI({ apiKey }).models.list({ config: { pageSize: 1 } });
      void pager;
      return Response.json({ ok: true });
    }
    return Response.json({ ok: false, error: "Unknown service." }, { status: 400 });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ ok: false, error: "That key wasn't accepted. Check that you copied all of it." });
    if (e instanceof Anthropic.APIError) return Response.json({ ok: false, error: `Anthropic said: ${e.message}` });
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    return Response.json({ ok: false, error: /API key not valid|API_KEY_INVALID|401|403/i.test(msg) ? "That key wasn't accepted. Check that you copied all of it." : msg.slice(0, 200) });
  }
}
