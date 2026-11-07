"use client";
import { useState } from "react";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    setBusy(false);
    if (r.ok) window.location.href = "/";
    else setErr((await r.json().catch(() => ({}))).error ?? "Couldn't sign in.");
  }

  return (
    <div className="login">
      <form className="modal stack" onSubmit={submit}>
        <div className="eyebrow">Private workspace</div>
        <h2>Room Studio</h2>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        </label>
        <div className="err" role="alert">{err}</div>
        <button className="btn primary" disabled={busy || !pw}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
