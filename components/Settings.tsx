"use client";
import { useState } from "react";
import { getKey, keyHeaders, setKey, useSetup, type Provider } from "@/lib/setup";

const SECTIONS: { p: Provider; title: string; label: string; help: React.ReactNode; enables: string }[] = [
  {
    p: "gemini",
    title: "AI pictures (Google Nano Banana)",
    label: "Google Gemini API key",
    help: <>Get it at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com</a> → Get API key → Create API key. Needs billing turned on (about 3–5¢ per picture).</>,
    enables: "Turns on “Create picture” and the one-click presets (Make it realistic, Golden hour, …).",
  },
  {
    p: "anthropic",
    title: "Chat assistant (Claude)",
    label: "Anthropic API key",
    help: <>Get it at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a> → API keys → Create key. Add a little prepaid credit under Billing.</>,
    enables: "Turns on the Chat tab, where you describe changes in your own words.",
  },
];

function KeySection({ s, connected }: { s: (typeof SECTIONS)[number]; connected: boolean }) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(!!getKey(s.p));
  const [test, setTest] = useState<{ busy?: boolean; ok?: boolean; msg?: string }>({});

  async function runTest() {
    setTest({ busy: true });
    const r = await fetch("/api/test-key", { method: "POST", headers: { "content-type": "application/json", ...keyHeaders() }, body: JSON.stringify({ provider: s.p }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { ok: false, error: "Couldn't reach the app." };
    setTest({ ok: !!j.ok, msg: j.ok ? "Working ✓" : j.error ?? "That didn't work." });
  }

  return (
    <section className="settings-card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 className="section-title" style={{ margin: 0 }}>{s.title}</h2>
        <span className={connected ? "status-ok" : "status-off"}>{connected ? "Connected ✓" : "Not connected"}</span>
      </div>
      <p className="sub" style={{ margin: 0 }}>{s.enables}</p>
      <label>
        {s.label}
        <input type="password" autoComplete="off" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} placeholder={saved ? "•••••••• saved in this browser" : "Paste your key"} />
        <span className="help">{s.help}</span>
      </label>
      <div className="row">
        <button className="btn primary" disabled={!value.trim()} onClick={() => { setKey(s.p, value); setValue(""); setSaved(true); setTest({}); }}>Save</button>
        <button className="btn" disabled={test.busy || (!saved && !connected)} onClick={runTest}>{test.busy ? "Testing…" : "Test connection"}</button>
        {saved && <button className="btn ghost danger" onClick={() => { setKey(s.p, ""); setSaved(false); setTest({}); }}>Remove key</button>}
        {test.msg && <span className={test.ok ? "status-ok" : "err"} role="status">{test.msg}</span>}
      </div>
    </section>
  );
}

export default function Settings() {
  const setup = useSetup();
  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">Settings</div>
          <h1>Connect AI services</h1>
          <p className="sub">Both are optional. Without them, painting, furniture, pricing and “Send to Gemini” still work.</p>
        </div>
      </div>
      <div className="stack" style={{ gap: 20, maxWidth: 720 }}>
        {SECTIONS.map((s) => <KeySection key={s.p} s={s} connected={s.p === "gemini" ? setup.pictures : setup.chat} />)}
        <div className="note">
          Keys you save here stay in <b>this browser on this device</b> only. They aren&apos;t stored on the website, so other people who open the site can&apos;t use them.
          On another computer or your phone, enter them there too.
        </div>
      </div>
    </>
  );
}
