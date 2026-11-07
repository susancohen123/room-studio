import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const COOKIE = "rs_session";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET is missing. Add it to .env.local.");
  return s;
}

export function sessionToken(): string {
  return createHmac("sha256", secret()).update("room-studio-session-v1").digest("hex");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passwordMatches(input: string): boolean {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return false;
  return same(input, pw);
}

export async function isSignedIn(): Promise<boolean> {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value;
  return !!v && same(v, sessionToken());
}

/** Use at the top of every API route. Returns a 401 response when signed out. */
export async function requireAuth(): Promise<Response | null> {
  if (await isSignedIn()) return null;
  return Response.json({ error: "Please sign in." }, { status: 401 });
}
