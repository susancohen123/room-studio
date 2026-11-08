"use client";
// Which AI features are connected, and the API keys saved in THIS browser only.
import { useEffect, useState } from "react";

const KEYS = { anthropic: "rs_anthropic_key", gemini: "rs_gemini_key" } as const;
export type Provider = keyof typeof KEYS;
const CHANGED = "rs-keys-changed";

export function getKey(p: Provider): string {
  try { return localStorage.getItem(KEYS[p]) ?? ""; } catch { return ""; }
}

export function setKey(p: Provider, value: string) {
  try {
    if (value.trim()) localStorage.setItem(KEYS[p], value.trim());
    else localStorage.removeItem(KEYS[p]);
  } catch {}
  window.dispatchEvent(new Event(CHANGED));
}

/** Headers that carry this browser's keys to the app's own server for a single request. */
export function keyHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const a = getKey("anthropic"), g = getKey("gemini");
  if (a) h["x-anthropic-key"] = a;
  if (g) h["x-gemini-key"] = g;
  return h;
}

let serverStatus: Promise<{ chat: boolean; pictures: boolean }> | null = null;
function loadServerStatus() {
  serverStatus ??= fetch("/api/status", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { chat: false, pictures: false }))
    .catch(() => ({ chat: false, pictures: false }));
  return serverStatus;
}

export function useSetup() {
  const [s, setS] = useState({ chat: false, pictures: false, loaded: false });
  useEffect(() => {
    let live = true;
    const refresh = () =>
      loadServerStatus().then((srv) => {
        if (live) setS({ chat: srv.chat || !!getKey("anthropic"), pictures: srv.pictures || !!getKey("gemini"), loaded: true });
      });
    refresh();
    window.addEventListener(CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => { live = false; window.removeEventListener(CHANGED, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  return s;
}

/** Opens the Settings screen from anywhere in the app. */
export function openSettings() {
  window.dispatchEvent(new Event("rs-open-settings"));
}
