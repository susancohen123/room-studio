// Sends the current design picture to an AI image service and saves the result.
// Engine "google" = Nano Banana (Gemini API). Engine "replicate" = models hosted on Replicate.
import Replicate from "replicate";
import { GoogleGenAI } from "@google/genai";
import { readFile, saveFile } from "@/lib/storage";

export class SetupNeeded extends Error {}

export interface Reference {
  url: string; // an /api/files/... address from this app
  label: string; // e.g. "Sofa: Test Sofa, 84 in wide"
}

const LOOK =
  "This is an interior design visualization of a real room. Keep the room's architecture, camera angle, " +
  "windows, doors, ceiling and proportions exactly the same. Make every surface and piece of furniture look " +
  "photorealistic, with natural shadows, reflections and light that matches the room.";

export function engine(geminiKey?: string): "google" | "replicate" | null {
  if (geminiKey) return "google";
  const pick = (process.env.IMAGE_ENGINE || "").toLowerCase();
  if (pick === "google" && process.env.GEMINI_API_KEY) return "google";
  if (pick === "replicate" && process.env.REPLICATE_API_TOKEN) return "replicate";
  if (process.env.GEMINI_API_KEY) return "google";
  if (process.env.REPLICATE_API_TOKEN) return "replicate";
  return null;
}

export async function aiEditImage(imageDataUrl: string, instruction: string, refs: Reference[] = [], geminiKey?: string): Promise<string> {
  const which = engine(geminiKey);
  if (!which) {
    throw new SetupNeeded("AI pictures aren't set up yet. Add your Google (Gemini) key in Settings, or use \"Send to Gemini\" below with your Gemini subscription.");
  }
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(imageDataUrl);
  if (!m) throw new Error("The design picture couldn't be read.");
  const png = which === "google" ? await withGoogle(m[1], m[2], instruction, refs, geminiKey || process.env.GEMINI_API_KEY || "") : await withReplicate(imageDataUrl, instruction);
  return saveFile("renders", "png", png, "image/png");
}

/** Closest aspect ratio Google supports, so the result matches the room photo's shape. */
async function aspectOf(base64: string): Promise<string> {
  const b = Buffer.from(base64.slice(0, 4000), "base64");
  let w = 0, h = 0;
  if (b[0] === 0x89) { w = b.readUInt32BE(16); h = b.readUInt32BE(20); }
  else {
    for (let i = 2; i < b.length - 9; i++) {
      if (b[i] === 0xff && b[i + 1] >= 0xc0 && b[i + 1] <= 0xc2) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); break; }
    }
  }
  if (!w || !h) return "4:3";
  const options = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
  const r = w / h;
  return options.reduce((best, o) => {
    const [a, c] = o.split(":").map(Number);
    const [ba, bc] = best.split(":").map(Number);
    return Math.abs(a / c - r) < Math.abs(ba / bc - r) ? o : best;
  });
}

async function withGoogle(mime: string, base64: string, instruction: string, refs: Reference[], apiKey: string): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1";

  type Block = { type: "text"; text: string } | { type: "image"; mime_type: string; data: string };
  const input: Block[] = [
    { type: "text", text: "Image 1 is the designer's current design for a client's room (the photo with the chosen finishes and furniture placed in it)." },
    { type: "image", mime_type: mime, data: base64 },
  ];

  // Up to 10 product/material photos, so the AI uses the real items instead of guessing.
  const used: Reference[] = [];
  for (const ref of refs.slice(0, 10)) {
    const key = ref.url.replace(/^\/api\/files\//, "");
    if (key === ref.url) continue;
    const f = await readFile(key);
    if (!f) continue;
    used.push(ref);
    input.push({ type: "text", text: `Image ${used.length + 1}: reference photo of the exact item to use: ${ref.label}.` });
    input.push({ type: "image", mime_type: f.contentType, data: f.data.toString("base64") });
  }

  input.push({
    type: "text",
    text:
      `${instruction.trim()}\n\n${LOOK}` +
      (used.length
        ? " Where Image 1 shows a pasted-in item, replace it with a realistic version of the matching reference item, keeping its exact design, color, material and proportions, at the same position and size."
        : ""),
  });

  const interaction = await ai.interactions.create({
    model,
    input,
    response_format: { type: "image", aspect_ratio: await aspectOf(base64), image_size: "2K" },
  });
  const out = interaction.output_image;
  if (!out?.data) throw new Error("Google didn't return a picture. Try rewording the request.");
  return Buffer.from(out.data, "base64");
}

async function withReplicate(imageDataUrl: string, instruction: string): Promise<Buffer> {
  const model = (process.env.REPLICATE_MODEL || "black-forest-labs/flux-kontext-pro") as `${string}/${string}`;
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  const out: unknown = await replicate.run(model, {
    input: { prompt: `${instruction.trim()}\n\n${LOOK}`, input_image: imageDataUrl, output_format: "png", safety_tolerance: 2 },
  });
  const first = Array.isArray(out) ? out[0] : out;
  let url: string;
  if (typeof first === "string") url = first;
  else if (first && typeof (first as { url?: () => URL }).url === "function") url = String((first as { url: () => URL }).url());
  else url = String(first);
  if (!/^https:\/\//.test(url)) throw new Error("The AI service didn't return an image.");
  const r = await fetch(url);
  if (!r.ok) throw new Error("Couldn't download the finished image.");
  return Buffer.from(await r.arrayBuffer());
}
