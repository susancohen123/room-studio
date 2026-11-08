import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "@/lib/auth";

export const maxDuration = 300;

type Msg = Anthropic.Beta.BetaMessageParam;

const SYSTEM = `You are the design assistant inside Room Studio, a private workspace for a residential interior designer.
The designer is looking at one design option for a client's room. Each message includes the current picture of that option and a short summary of the room, the option, and the designer's saved paint colors.

You can change the picture and the workspace with tools:
- set_wall_paint: paint the area the designer has outlined or brushed with a color. Use it when they name a paint color or describe one. If you only know a color by description, choose a fitting hex value and say it is an approximation.
- ai_edit_picture: make a photorealistic edit to the whole picture from a written instruction (swap furniture, change flooring, add a rug, change lighting or time of day, declutter). Write the instruction as one clear, specific sentence or two describing only what should change.
- save_paint_color and save_product: add something to the designer's library, only when they ask or agree.
- web_search: find real products, paint collections, color codes, vendor pages and stores. When you give a link, it must come from a search result. Never invent links, prices, color codes or stock levels; if you cannot verify something, say so.

Keep replies short and plain, with no technical jargon. When you make a change, say in one sentence what you changed. If a request is unclear, make a sensible choice and offer one alternative rather than asking several questions.`;

const tools: Anthropic.Beta.BetaToolUnion[] = [
  { type: "web_search_20260209", name: "web_search", max_uses: 5 },
  {
    name: "set_wall_paint",
    description: "Apply a paint color to the wall area the designer has outlined or brushed in the current option.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        hex: { type: "string", description: "Color as #RRGGBB" },
        name: { type: "string", description: "Paint name, with brand and code if known" },
      },
      required: ["hex", "name"],
      additionalProperties: false,
    },
  },
  {
    name: "ai_edit_picture",
    description: "Create a new photorealistic version of the current picture with the described change. Takes about a minute.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { instruction: { type: "string", description: "What to change, specifically" } },
      required: ["instruction"],
      additionalProperties: false,
    },
  },
  {
    name: "save_paint_color",
    description: "Save a paint color to the designer's paint library.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        brand: { type: "string" },
        name: { type: "string" },
        code: { type: "string", description: "Manufacturer color code, or empty if unknown" },
        hex: { type: "string", description: "#RRGGBB" },
      },
      required: ["brand", "name", "code", "hex"],
      additionalProperties: false,
    },
  },
  {
    name: "save_product",
    description: "Save a product link to the designer's library so they can add a photo of it later.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        vendor: { type: "string" },
        url: { type: "string" },
        price: { type: "number", description: "Price in US dollars, or 0 if unknown" },
      },
      required: ["name", "vendor", "url", "price"],
      additionalProperties: false,
    },
  },
];

const CLIENT_TOOLS = new Set(["set_wall_paint", "ai_edit_picture", "save_paint_color", "save_product"]);

export async function POST(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const apiKey = req.headers.get("x-anthropic-key") || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "The chat assistant isn't connected yet. Go to Settings to add your Anthropic API key.", setup: true },
      { status: 501 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as { history?: Msg[]; text?: string; image?: string; context?: string };
  const text = (body.text ?? "").trim();
  if (!text) return Response.json({ error: "Type a message first." }, { status: 400 });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(body.image ?? "");
  if (m) content.push({ type: "image", source: { type: "base64", media_type: m[1] as "image/jpeg", data: m[2] } });
  content.push({ type: "text", text: `${body.context ? `[Current design]\n${body.context}\n\n` : ""}${text}` });

  const messages: Msg[] = [...(Array.isArray(body.history) ? body.history : []), { role: "user", content }];
  const actions: { name: string; input: Record<string, unknown> }[] = [];
  const replies: string[] = [];
  const sources = new Map<string, string>();
  const client = new Anthropic({ apiKey });

  try {
    for (let i = 0; i < 8; i++) {
      const resp = await client.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: SYSTEM,
        tools,
        messages,
      });

      if (resp.stop_reason === "refusal") {
        replies.push("Sorry, I can't help with that one.");
        messages.push({ role: "assistant", content: resp.content });
        break;
      }
      messages.push({ role: "assistant", content: resp.content });

      for (const block of resp.content) {
        if (block.type === "text") {
          if (block.text.trim()) replies.push(block.text.trim());
          for (const c of block.citations ?? []) {
            if ("url" in c && typeof c.url === "string") sources.set(c.url, ("title" in c && c.title) || c.url);
          }
        }
      }

      if (resp.stop_reason === "pause_turn") continue;
      if (resp.stop_reason !== "tool_use") break;

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const block of resp.content) {
        if (block.type !== "tool_use" || !CLIENT_TOOLS.has(block.name)) continue;
        const input = (block.input ?? {}) as Record<string, unknown>;
        actions.push({ name: block.name, input });
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: block.name === "ai_edit_picture" ? "Started. The new picture will appear in about a minute." : "Done.",
        });
      }
      if (!results.length) break;
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "Your Anthropic key wasn't accepted. Check it in Settings.", setup: true }, { status: 401 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "The assistant is busy. Try again in a moment." }, { status: 429 });
    }
    if (e instanceof Anthropic.APIError) {
      return Response.json({ error: `The assistant had a problem (${e.status}). Try again.` }, { status: 502 });
    }
    throw e;
  }

  return Response.json({
    reply: replies.join("\n\n") || "Done.",
    actions,
    sources: [...sources].map(([url, title]) => ({ url, title })),
    history: messages,
  });
}
