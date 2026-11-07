// Sends the current design picture to the AI image service and saves the result.
import Replicate from "replicate";
import { saveFile } from "@/lib/storage";

export class SetupNeeded extends Error {}

export async function aiEditImage(imageDataUrl: string, instruction: string): Promise<string> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new SetupNeeded("The AI image service isn't connected yet. Add your Replicate key to the settings file.");
  const model = (process.env.REPLICATE_MODEL || "black-forest-labs/flux-kontext-pro") as `${string}/${string}`;
  const replicate = new Replicate({ auth: token });
  const prompt =
    `${instruction.trim()}\n\n` +
    "This is an interior design visualization of a real room. Keep the room's architecture, camera angle, " +
    "windows, doors, ceiling and proportions exactly the same. Make every surface and piece of furniture look " +
    "photorealistic, with natural shadows, reflections and light that matches the room.";
  const out: unknown = await replicate.run(model, {
    input: { prompt, input_image: imageDataUrl, output_format: "png", safety_tolerance: 2 },
  });
  const first = Array.isArray(out) ? out[0] : out;
  let url: string;
  if (typeof first === "string") url = first;
  else if (first && typeof (first as { url?: () => URL }).url === "function") url = String((first as { url: () => URL }).url());
  else url = String(first);
  if (!/^https:\/\//.test(url)) throw new Error("The AI service didn't return an image.");
  const r = await fetch(url);
  if (!r.ok) throw new Error("Couldn't download the finished image.");
  return saveFile("renders", "png", Buffer.from(await r.arrayBuffer()), "image/png");
}
