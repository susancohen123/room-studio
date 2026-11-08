"use client";
import { useEffect, useRef, useState } from "react";
import type { DesignOption, Room, Workspace } from "@/lib/types";
import { fmtIn } from "./ui";
import { keyHeaders, openSettings, useSetup } from "@/lib/setup";

interface Line { who: "me" | "ai"; text: string; sources?: { url: string; title: string }[] }

const STARTERS = [
  "Paint the outlined wall a warm greige",
  "Show this with a large jute rug and linen curtains",
  "Find Benjamin Moore's most popular whites and save three to my library",
  "Make it evening with the lamps on",
];

// Conversation memory per option, kept while the app is open.
const memory = new Map<string, { lines: Line[]; history: unknown[] }>();

export default function Chat({ ws, room, opt, designImage, onAction }: {
  ws: Workspace; room: Room; opt: DesignOption;
  designImage: (maxW: number, type?: "image/png" | "image/jpeg") => Promise<string>;
  onAction: (name: string, input: Record<string, unknown>) => void;
}) {
  const saved = memory.get(opt.id);
  const [lines, setLines] = useState<Line[]>(saved?.lines ?? []);
  const history = useRef<unknown[]>(saved?.history ?? []);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState("");
  const conn = useSetup();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { memory.set(opt.id, { lines, history: history.current }); end.current?.scrollIntoView({ block: "nearest" }); }, [lines, opt.id]);

  function context() {
    const pieces = opt.pieces.map((p) => ws.pieces.find((x) => x.id === p.pieceId)?.name).filter(Boolean);
    const paints = ws.paints.slice(0, 80).map((p) => `${p.brand} ${p.name} ${p.code} ${p.hex}`.trim());
    return [
      `Room: ${room.name}, ${fmtIn(room.widthIn)} wide x ${fmtIn(room.depthIn)} deep, ${fmtIn(room.heightIn)} ceiling.${room.notes ? ` Notes: ${room.notes}` : ""}`,
      `Option: ${opt.name}. Wall finish: ${opt.finish?.name ?? "none"}. Area marked for the finish: ${opt.strokes.some((s) => !s.erase) ? "yes" : "no (the designer must outline or brush it before paint shows)"}.`,
      `Pieces placed: ${pieces.length ? pieces.join(", ") : "none"}.`,
      `Saved paint colors: ${paints.length ? paints.join("; ") : "none yet"}.`,
    ].join("\n");
  }

  async function send(msg: string) {
    const t = msg.trim();
    if (!t || busy || !conn.chat) return;
    setText("");
    setBusy(true);
    setSetup("");
    setLines((l) => [...l, { who: "me", text: t }]);
    try {
      let image: string | undefined;
      try { image = await designImage(1024, "image/jpeg"); } catch {}
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json", ...keyHeaders() },
        body: JSON.stringify({ history: history.current, text: t, image, context: context() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.setup) setSetup(j.error);
        setLines((l) => [...l, { who: "ai", text: j.error ?? "Something went wrong. Try again." }]);
        return;
      }
      history.current = j.history ?? history.current;
      setLines((l) => [...l, { who: "ai", text: j.reply, sources: j.sources }]);
      for (const a of j.actions ?? []) onAction(a.name, a.input ?? {});
    } catch {
      setLines((l) => [...l, { who: "ai", text: "I couldn't reach the assistant. Check your connection and try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat">
      {conn.loaded && !conn.chat ? (
        <div className="warn stack" style={{ gap: 6 }}>
          <b>Chat isn't connected yet.</b>
          <span>Add your Anthropic API key in Settings to turn on the chat assistant.</span>
          <button className="btn sm primary" style={{ alignSelf: "flex-start" }} onClick={openSettings}>Go to Settings</button>
        </div>
      ) : setup ? <div className="warn">{setup} <button className="linkbtn" onClick={openSettings}>Go to Settings →</button></div> : null}
      {!lines.length && conn.chat && (
        <>
          <p className="sub" style={{ margin: 0, fontSize: 13 }}>Describe a change in your own words and it&apos;s applied to this option. You can also ask me to find paint colors, products or stores.</p>
          <div className="chips">{STARTERS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>
        </>
      )}
      <div className="msgs" aria-live="polite">
        {lines.map((l, i) => (
          <div key={i} className={`msg ${l.who}`}>
            {l.text}
            {!!l.sources?.length && (
              <div style={{ marginTop: 6, fontSize: 12 }}>
                {l.sources.slice(0, 6).map((s) => <div key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></div>)}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="msg ai">Thinking…</div>}
        <div ref={end} />
      </div>
      <form className="row" style={{ flexWrap: "nowrap" }} onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Try: make the walls Sherwin-Williams Sea Salt" style={{ flex: 1, minHeight: 44 }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} aria-label="Message the design assistant" />
        <button className="btn primary" disabled={busy || !text.trim() || !conn.chat}>Send</button>
      </form>
    </div>
  );
}
