"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Image as KImage, Transformer, Line } from "react-konva";
import type Konva from "konva";
import type { DesignOption, Finish, Piece, Room, Stroke, Workspace } from "@/lib/types";
import { compositeFinish, download, fileName, flatten, loadImage, prepPhoto, uploadBlob } from "@/lib/imaging";
import { money, optionCost } from "@/lib/pricing";
import type { Update } from "./Studio";
import { Modal, fmtIn, uid } from "./ui";
import { PieceForm } from "./Library";
import Chat from "./Chat";
import ColorField from "./ColorField";
import { keyHeaders, openSettings, useSetup } from "@/lib/setup";

type Tool = "arrange" | "brush" | "erase" | "outline";
type PanelTab = "finish" | "pieces" | "price" | "ai" | "chat";

const PRESETS: { label: string; text: string }[] = [
  { label: "Make it realistic", text: "Make this design look like a real professional interior photograph." },
  { label: "Bright daytime", text: "Show the room in bright natural daylight coming through the windows." },
  { label: "Golden hour", text: "Show the room at sunset with warm golden light coming through the windows." },
  { label: "Evening, lamps on", text: "Show the room in the evening with all lamps and light fixtures turned on, warm and cozy." },
  { label: "Night", text: "Show the room at night: dark outside the windows, interior lit only by the lamps and fixtures." },
  { label: "Declutter", text: "Remove clutter and personal items, keep the furniture and finishes." },
];

// Pictures already in memory (including ones just uploaded), so they show instantly.
const imgCache = new Map<string, HTMLImageElement>();

function useImg(src: string | undefined) {
  const [img, setImg] = useState<HTMLImageElement | null>(() => (src && imgCache.get(src)) || null);
  useEffect(() => {
    let live = true;
    const hit = src ? imgCache.get(src) : undefined;
    setImg(hit ?? null);
    if (src && !hit) loadImage(src).then((i) => { imgCache.set(src, i); if (live) setImg(i); }).catch(() => {});
    return () => { live = false; };
  }, [src]);
  return img;
}

export default function RoomEditor(props: {
  ws: Workspace; room: Room; path: [string, string, string]; clientName: string; homeName: string; update: Update;
  toast: (m: string) => void; onEditRoom: () => void; onDeleteRoom: () => void;
}) {
  const { ws, room, path, update, toast } = props;
  const [optId, setOptId] = useState<string | null>(room.options[0]?.id ?? null);
  const [tool, setTool] = useState<Tool>("arrange");
  const setup = useSetup();
  const [tab, setTab] = useState<PanelTab>("finish");
  const [brush, setBrush] = useState(40);
  const [selected, setSelected] = useState<string | null>(null);
  const [live, setLive] = useState<Stroke | null>(null);
  const [outline, setOutline] = useState<number[]>([]);
  const [busy, setBusy] = useState("");
  const [modal, setModal] = useState<React.ReactNode>(null);
  const [aiText, setAiText] = useState("");
  const [setupMsg, setSetupMsg] = useState("");
  const [saving, setSaving] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [gemPreset, setGemPreset] = useState(PRESETS[0].text);
  const [gemText, setGemText] = useState("");
  const [copied, setCopied] = useState(false);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [boxW, setBoxW] = useState(0);
  const closeModal = () => setModal(null);

  const opt: DesignOption | undefined = room.options.find((o) => o.id === optId) ?? room.options[0];
  const photo = room.photos.find((p) => p.id === opt?.photoId) ?? room.photos[0];

  const updRoom = useCallback((fn: (r: Room) => void) => update((w) => {
    const r = w.clients.find((c) => c.id === path[0])?.homes.find((h) => h.id === path[1])?.rooms.find((x) => x.id === path[2]);
    if (r) fn(r);
  }), [update, path]);
  const updOpt = useCallback((fn: (o: DesignOption) => void) => {
    if (!opt) return;
    updRoom((r) => { const o = r.options.find((x) => x.id === opt.id); if (o) fn(o); });
  }, [updRoom, opt]);

  // Every room with a photo gets a first option automatically.
  useEffect(() => {
    if (room.photos.length && !room.options.length) {
      const o = newOption("Option A", room.photos[0].id);
      updRoom((r) => { if (!r.options.length) r.options.push(o); });
      setOptId(o.id);
    }
  }, [room.photos.length, room.options.length, updRoom]);

  // Measure the picture area whenever it appears (e.g. right after the first photo is added).
  const roRef = useRef<ResizeObserver | null>(null);
  const boxRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    roRef.current = ro;
    setBoxW(el.clientWidth);
  }, []);

  // Stage size: fit width, but not taller than ~72% of the window.
  const aspect = photo ? photo.h / photo.w : 0.66;
  const maxH = typeof window !== "undefined" ? window.innerHeight * 0.72 : 600;
  const W = Math.max(200, Math.min(boxW, maxH / aspect));
  const H = W * aspect;

  const base = useImg(photo?.url);
  const material = opt?.finish && opt.finish.kind !== "paint" ? ws.materials.find((m) => m.id === opt.finish!.materialId) : undefined;
  const texture = useImg(material?.imageUrl);

  const pieceImgs = useRef(new Map<string, HTMLImageElement>());
  const [, bump] = useState(0);
  useEffect(() => {
    for (const p of opt?.pieces ?? []) {
      const piece = ws.pieces.find((x) => x.id === p.pieceId);
      if (piece?.imageUrl && !pieceImgs.current.has(piece.imageUrl)) {
        loadImage(piece.imageUrl).then((img) => { pieceImgs.current.set(piece.imageUrl, img); bump((n) => n + 1); }).catch(() => {});
      }
    }
  }, [opt?.pieces, ws.pieces]);

  const strokes = useMemo(() => [...(opt?.strokes ?? []), ...(live ? [live] : [])], [opt?.strokes, live]);
  const composite = useMemo(() => {
    if (!base) return null;
    const cw = Math.min(base.width, Math.round(W * (window.devicePixelRatio || 1)), 1600);
    return compositeFinish(base, cw, cw * (base.height / base.width), strokes, opt?.finish ?? null, texture);
  }, [base, W, strokes, opt?.finish, texture]);

  // Attach resize handles to the selected piece.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selected && tool === "arrange" ? stageRef.current?.findOne(`#p-${selected}`) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selected, tool, opt?.pieces]);

  // ---------- drawing ----------
  const pos = () => {
    const p = stageRef.current?.getPointerPosition();
    return p ? [Math.min(1, Math.max(0, p.x / W)), Math.min(1, Math.max(0, p.y / H))] : null;
  };
  function down(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (tool === "arrange") { if (e.target === e.target.getStage() || e.target.name() === "photo") setSelected(null); return; }
    const p = pos();
    if (!p) return;
    if (tool === "outline") {
      if (outline.length >= 6 && Math.hypot((p[0] - outline[0]) * W, (p[1] - outline[1]) * H) < 14) return finishOutline();
      setOutline([...outline, ...p]);
      return;
    }
    setLive({ pts: p, size: brush / W, erase: tool === "erase" });
  }
  function move() {
    if (!live) return;
    const p = pos();
    if (p) setLive({ ...live, pts: [...live.pts, ...p] });
  }
  function up() {
    if (!live) return;
    const s = live;
    setLive(null);
    updOpt((o) => { o.strokes.push(s); });
  }
  function finishOutline() {
    if (outline.length >= 6) {
      const pts = outline;
      updOpt((o) => { o.strokes.push({ pts, size: 0, poly: true }); });
      if (!opt?.finish) toast("Area outlined. Now pick a paint, wallpaper or tile.");
    }
    setOutline([]);
  }

  // ---------- design image for export / AI ----------
  const designImage = useCallback(async (maxW: number, type: "image/png" | "image/jpeg" = "image/png") => {
    if (!base || !opt) throw new Error("Add a photo first.");
    const full = compositeFinish(base, Math.min(base.width, 1600), Math.min(base.width, 1600) * (base.height / base.width), opt.strokes, opt.finish, texture);
    const items = [];
    for (const p of opt.pieces) {
      const piece = ws.pieces.find((x) => x.id === p.pieceId);
      if (!piece?.imageUrl) continue;
      const img = pieceImgs.current.get(piece.imageUrl) ?? (await loadImage(piece.imageUrl));
      items.push({ p, img });
    }
    return flatten(full, items, maxW).toDataURL(type, 0.9);
  }, [base, opt, texture, ws.pieces]);

  async function runRender(instruction: string, label: string) {
    if (!opt) return;
    if (!setup.pictures) {
      toast("AI pictures aren't set up yet. Add your Gemini key in Settings, or use “Send to Gemini” below.");
      setSetupMsg("AI pictures aren't set up yet.");
      return;
    }
    setBusy("Creating the picture… this takes about a minute");
    setSetupMsg("");
    try {
      const image = await designImage(1536, "image/jpeg");
      // Send photos of the real products and materials, so the AI uses the exact items.
      const references: { url: string; label: string }[] = [];
      for (const id of new Set(opt.pieces.map((p) => p.pieceId))) {
        const p = ws.pieces.find((x) => x.id === id);
        if (p?.imageUrl) references.push({ url: p.imageUrl, label: [p.category || "Item", p.name, p.vendor, p.widthIn ? `${p.widthIn} in wide` : "", p.heightIn ? `${p.heightIn} in tall` : ""].filter(Boolean).join(", ") });
      }
      if (material) references.push({ url: material.imageUrl, label: `${material.kind === "tile" ? "Tile" : "Wallpaper"} for the marked wall area: ${material.name}${material.vendor ? `, ${material.vendor}` : ""}` });
      const r = await fetch("/api/render", { method: "POST", headers: { "content-type": "application/json", ...keyHeaders() }, body: JSON.stringify({ image, instruction, references }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { if (j.setup) setSetupMsg(j.error); else toast(j.error ?? "That didn't work. Try again."); return; }
      const optionId = opt.id;
      updRoom((rm) => { rm.options.find((o) => o.id === optionId)?.renders.unshift({ id: uid(), url: j.url, prompt: label, created: Date.now() }); });
      setTab("ai");
      toast("New picture ready.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy("");
    }
  }

  // ---------- Send to Gemini (uses the designer's own Gemini subscription) ----------
  function referenceItems() {
    const items: { url: string; label: string }[] = [];
    for (const id of new Set(opt?.pieces.map((p) => p.pieceId) ?? [])) {
      const p = ws.pieces.find((x) => x.id === id);
      if (p?.imageUrl) items.push({ url: p.imageUrl, label: [p.name, p.vendor, p.widthIn ? `${fmtIn(p.widthIn)} wide` : "", p.heightIn ? `${fmtIn(p.heightIn)} tall` : ""].filter(Boolean).join(", ") });
    }
    if (material) items.push({ url: material.imageUrl, label: `${material.kind === "tile" ? "Tile" : "Wallpaper"} for the marked wall: ${material.name}` });
    return items;
  }

  /** One image showing every product, numbered, so Gemini gets just two uploads. */
  async function referenceSheet(items: { url: string; label: string }[]): Promise<string | null> {
    if (!items.length) return null;
    const cols = Math.min(3, items.length), rows = Math.ceil(items.length / cols);
    const cw = 420, ch = 440;
    const c = document.createElement("canvas");
    c.width = cols * cw; c.height = rows * ch;
    const x = c.getContext("2d")!;
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < items.length; i++) {
      const img = await loadImage(items[i].url);
      const ox = (i % cols) * cw, oy = Math.floor(i / cols) * ch;
      const s = Math.min(380 / img.width, 340 / img.height);
      x.drawImage(img, ox + (cw - img.width * s) / 2, oy + 20 + (340 - img.height * s) / 2, img.width * s, img.height * s);
      x.fillStyle = "#222"; x.font = "bold 22px sans-serif";
      x.fillText(`${i + 1}`, ox + 14, oy + 32);
      x.font = "17px sans-serif";
      const words = items[i].label.split(" "); let line = "", ly = oy + 390;
      for (const w of words) { if (x.measureText(line + w).width > cw - 30) { x.fillText(line, ox + 14, ly); line = ""; ly += 22; } line += w + " "; }
      x.fillText(line, ox + 14, ly);
    }
    return c.toDataURL("image/png");
  }

  async function sendToGemini() {
    if (!opt) return;
    setBusy("Preparing files for Gemini…");
    try {
      const items = referenceItems();
      download(await designImage(2048), fileName(room.name, opt.name, "design for Gemini"));
      const sheet = await referenceSheet(items);
      if (sheet) download(sheet, fileName(room.name, opt.name, "products for Gemini"));
      const text = [
        `Image 1 is my interior design mockup of a client's room (a real photo with the new finishes and furniture pasted in).`,
        items.length ? `Image 2 is a numbered sheet of the exact products to use: ${items.map((it, i) => `${i + 1}) ${it.label}`).join("; ")}.` : "",
        `Task: ${gemPreset}`,
        `Keep the room's architecture, camera angle, windows, doors, ceiling and proportions exactly the same.`,
        items.length ? `Replace each pasted-in item with a realistic version of the matching product from Image 2, keeping its exact design, color, material and proportions, in the same position and size.` : "",
        `Make everything photorealistic with natural light and shadows. Return one image in the same proportions as Image 1.`,
      ].filter(Boolean).join("\n\n");
      setGemText(text);
      setCopied(false);
      try { await navigator.clipboard.writeText(text); setCopied(true); } catch {}
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't prepare the files.");
    } finally {
      setBusy("");
    }
  }

  async function addGeminiPictures(files: FileList | null) {
    if (!files?.length || !opt) return;
    setBusy("Adding picture…");
    try {
      const added: { id: string; url: string; prompt: string; created: number }[] = [];
      for (const f of Array.from(files)) {
        const { blob } = await prepPhoto(f, 2400);
        added.push({ id: uid(), url: await uploadBlob(blob, "renders", f.name), prompt: `From Gemini: ${PRESETS.find((p) => p.text === gemPreset)?.label ?? "picture"}`, created: Date.now() });
      }
      const optionId = opt.id;
      updRoom((rm) => { rm.options.find((o) => o.id === optionId)?.renders.unshift(...added); });
      toast(added.length > 1 ? `${added.length} pictures added.` : "Picture added.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy("");
    }
  }

  async function addPhotos(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    let done = 0;
    setSaving(`Saving ${list.length > 1 ? `${list.length} photos` : "photo"}…`);
    let first = true;
    // Shrink and upload up to 3 at a time; the first photo shows right away while it saves.
    const one = async (f: File) => {
      const { blob, w, h } = await prepPhoto(f);
      const local = URL.createObjectURL(blob);
      const img = await loadImage(local);
      if (first) { first = false; setPreview(local); }
      const url = await uploadBlob(blob, "photos", f.name);
      imgCache.set(url, img);
      const id = uid();
      updRoom((r) => { r.photos.push({ id, url, name: f.name, w, h }); });
      if (done === 0 && opt) updOpt((o) => { o.photoId = id; });
      done++;
      if (list.length > 1) setSaving(`Saved ${done} of ${list.length} photos…`);
    };
    try {
      const queue = [...list];
      await Promise.all([0, 1, 2].map(async () => { while (queue.length) await one(queue.shift()!); }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setSaving("");
      setPreview((p) => { if (p) URL.revokeObjectURL(p); return null; });
    }
  }

  function setFinish(f: Finish) {
    const hadFinish = !!opt?.finish;
    updOpt((o) => { o.finish = f; });
    // Only nudge once (not on every color change while dragging the picker).
    if (!hadFinish && !opt?.strokes.some((s) => !s.erase)) {
      setTool("outline");
      toast("Now outline the wall (click its corners), or switch to Brush and paint over it.");
    }
  }

  function placePiece(p: Piece) {
    if (!p.imageUrl) {
      toast(`“${p.name}” has no photo yet. Click Edit next to it to add one.`);
      return;
    }
    // Size it from real dimensions when the room width is known.
    const w = room.widthIn && p.widthIn ? Math.min(0.9, Math.max(0.05, p.widthIn / room.widthIn)) : 0.25;
    const u = uid();
    updOpt((o) => { o.pieces.push({ uid: u, pieceId: p.id, x: 0.5 - w / 2, y: 0.5, w, rotation: 0 }); });
    setTool("arrange");
    setSelected(u);
  }

  // ---------- empty states ----------
  const header = (
    <div className="head">
      <div>
        <div className="eyebrow">{props.clientName} · {props.homeName}</div>
        <h1>{room.name}</h1>
        <p className="sub">{room.widthIn > 0 && room.depthIn > 0
          ? <>{fmtIn(room.widthIn)} wide × {fmtIn(room.depthIn)} deep · {fmtIn(room.heightIn)} ceiling</>
          : <><button className="dim-prompt" onClick={props.onEditRoom}>Add room dimensions →</button>{room.heightIn > 0 && <> · {fmtIn(room.heightIn)} ceiling</>}</>}</p>
      </div>
      <div className="row">
        <label className="btn" style={{ flexDirection: "row", color: "inherit" }}>
          + Photos or drawings
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
        </label>
        <button className="btn ghost" onClick={props.onEditRoom}>Edit room</button>
        <button className="btn ghost danger" onClick={props.onDeleteRoom}>Delete</button>
      </div>
    </div>
  );

  if (!room.photos.length || !opt || !photo) {
    if (preview) {
      return (
        <>
          {header}
          <div className="stagebox"><img alt="" src={preview} style={{ width: "100%", display: "block" }} /><span className="hint">{saving || "Opening…"}</span></div>
        </>
      );
    }
    return (
      <>
        {header}
        <label className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addPhotos(e.dataTransfer.files); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
          <strong>Add a photo of your room to get started</strong>
          <span>A photo of the space, a rendering, or a line drawing from your cabinet maker all work. Click here or drop pictures in.</span>
          <span className="btn primary" style={{ color: "var(--accent-ink)" }}>{saving || "Upload photo"}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
        </label>
      </>
    );
  }

  const cost = optionCost(opt, ws);
  const sortedPaints = [...ws.paints].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite));
  const hint = tool === "brush" ? "Paint over the area to change" : tool === "erase" ? "Erase parts of the area" : tool === "outline" ? (outline.length ? "Click more corners; click the first point to finish" : "Click the corners of the wall") : "Drag pieces to move · corners to resize and turn";

  // ---------- render ----------
  return (
    <>
      {header}
      <div className="studio">
        <div className="stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="seg" role="tablist" aria-label="Design options">
              {room.options.map((o) => (
                <button key={o.id} aria-pressed={o.id === opt.id} onClick={() => { setOptId(o.id); setSelected(null); }}>{o.favorite ? "★ " : ""}{o.name}</button>
              ))}
            </div>
            <div className="row">
              <button className="btn sm" onClick={() => {
                const id = uid();
                const name = `Option ${String.fromCharCode(65 + room.options.length)}`;
                updRoom((r) => { const copy: DesignOption = { ...structuredClone(opt), id, name, renders: [], favorite: false, created: Date.now() }; r.options.push(copy); });
                setOptId(id);
                toast(`${name} started as a copy of ${opt.name}.`);
              }}>+ New option</button>
              <button className="btn sm" onClick={() => setModal(<CompareModal room={room} ws={ws} onClose={closeModal} onOpen={(id) => { setOptId(id); closeModal(); }} />)} disabled={room.options.length < 1}>Compare</button>
            </div>
          </div>

          <div className="row">
            <input className="optname" aria-label="Option name (click to rename)" title="Click to rename" value={opt.name} onChange={(e) => updOpt((o) => { o.name = e.target.value; })} />
            <button className="star" aria-label={opt.favorite ? "Remove from favorites" : "Add to favorites"} onClick={() => updOpt((o) => { o.favorite = !o.favorite; })}>{opt.favorite ? "★" : "☆"}</button>
            <span className="spacer" />
            <div className="seg" role="group" aria-label="Tools">
              {(["arrange", "outline", "brush", "erase"] as Tool[]).map((t) => (
                <button key={t} aria-pressed={tool === t} onClick={() => { setTool(t); setOutline([]); }}>{{ arrange: "Arrange", outline: "Outline wall", brush: "Brush", erase: "Erase" }[t]}</button>
              ))}
            </div>
            {(tool === "brush" || tool === "erase") && <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>Size<input type="range" min={6} max={160} value={brush} onChange={(e) => setBrush(Number(e.target.value))} /></label>}
            {tool === "outline" && outline.length >= 6 && <button className="btn sm primary" onClick={finishOutline}>Finish shape</button>}
            <button className="btn sm ghost" disabled={!opt.strokes.length} onClick={() => updOpt((o) => { o.strokes.pop(); })}>Undo</button>
          </div>

          <div className="stagebox" ref={boxRef}>
            {composite && boxW > 0 ? (
              <Stage ref={stageRef} width={W} height={H} style={{ cursor: tool === "arrange" ? "default" : "crosshair", touchAction: "none" }}
                onMouseDown={down} onTouchStart={down} onMouseMove={move} onTouchMove={move} onMouseUp={up} onTouchEnd={up} onMouseLeave={up}>
                <Layer>
                  <KImage name="photo" image={composite} width={W} height={H} />
                </Layer>
                <Layer>
                  {opt.pieces.map((p) => {
                    const piece = ws.pieces.find((x) => x.id === p.pieceId);
                    const img = piece?.imageUrl ? pieceImgs.current.get(piece.imageUrl) : undefined;
                    if (!img) return null;
                    const w = p.w * W;
                    return (
                      <KImage key={p.uid} id={`p-${p.uid}`} image={img} x={p.x * W} y={p.y * H} width={w} height={w * (img.height / img.width)} rotation={p.rotation}
                        draggable={tool === "arrange"} listening={tool === "arrange"}
                        onMouseDown={() => setSelected(p.uid)} onTouchStart={() => setSelected(p.uid)}
                        onDragEnd={(e) => { const n = e.target; updOpt((o) => { const q = o.pieces.find((x) => x.uid === p.uid); if (q) { q.x = n.x() / W; q.y = n.y() / H; } }); }}
                        onTransformEnd={(e) => {
                          const n = e.target;
                          const nw = n.width() * n.scaleX();
                          n.scaleX(1); n.scaleY(1);
                          updOpt((o) => { const q = o.pieces.find((x) => x.uid === p.uid); if (q) { q.x = n.x() / W; q.y = n.y() / H; q.w = nw / W; q.rotation = n.rotation(); } });
                        }} />
                    );
                  })}
                  <Transformer ref={trRef} keepRatio enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]} rotationSnaps={[0, 90, 180, 270]} />
                  {outline.length >= 2 && <Line points={outline.map((v, i) => (i % 2 ? v * H : v * W))} stroke="#fff" strokeWidth={2} dash={[6, 4]} />}
                  {live && !live.erase && <Line points={live.pts.map((v, i) => (i % 2 ? v * H : v * W))} stroke="rgba(255,255,255,.35)" strokeWidth={live.size * W} lineCap="round" lineJoin="round" listening={false} />}
                </Layer>
              </Stage>
            ) : <p className="status" style={{ padding: 40 }}>Loading picture…</p>}
            <span className="hint">{saving || hint}</span>
            {busy && <div className="busy">{busy}</div>}
          </div>

          <div className="strip" aria-label="Room pictures">
            {room.photos.map((p) => (
              <button key={p.id} aria-pressed={p.id === photo.id} title={p.name} onClick={() => updOpt((o) => { o.photoId = p.id; })}><img alt={p.name} src={p.url} /></button>
            ))}
          </div>
          {selected && tool === "arrange" && (() => {
            const placed = opt.pieces.find((p) => p.uid === selected);
            const piece = ws.pieces.find((x) => x.id === placed?.pieceId);
            if (!placed || !piece) return null;
            return (
              <div className="item">
                {piece.imageUrl && <img alt="" src={piece.imageUrl} />}
                <div className="grow"><div className="t">{piece.name}</div><div className="m">{fitText(piece, room)}</div></div>
                <button className="btn sm ghost" onClick={() => updOpt((o) => { const q = o.pieces.find((x) => x.uid === selected); if (q) { const i = o.pieces.indexOf(q); o.pieces.splice(i, 1); o.pieces.push(q); } })}>Bring forward</button>
                <button className="btn sm ghost danger" onClick={() => { updOpt((o) => { o.pieces = o.pieces.filter((x) => x.uid !== selected); }); setSelected(null); }}>Remove</button>
              </div>
            );
          })()}
        </div>

        <aside className="panel">
          <div className="tabs" role="tablist">
            {([["finish", "Walls"], ["pieces", "Pieces"], ["price", "Price"], ["ai", "AI & export"], ["chat", "Chat"]] as [PanelTab, string][]).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          {tab === "finish" && (
            <div className="stack">
              {!opt.strokes.some((s) => !s.erase) && <div className="note">First mark the area: use <b>Outline wall</b> to click its corners, or <b>Brush</b> to paint over it. Click <b>Finish shape</b> in the toolbar to close the outline when you&apos;re done. Then pick a finish below.</div>}
              {opt.finish && (
                <div className="item">
                  <div style={{ width: 40, height: 40, borderRadius: 6, background: opt.finish.kind === "paint" ? opt.finish.hex : `url(${material?.imageUrl}) center/cover` }} />
                  <div className="grow"><div className="t">{opt.finish.name}</div><div className="m">{opt.finish.kind === "paint" ? "Paint" : opt.finish.kind === "tile" ? "Tile" : "Wallpaper"}</div></div>
                  <button className="btn sm ghost" onClick={() => updOpt((o) => { o.finish = null; })}>Clear</button>
                </div>
              )}
              {opt.finish && (
                <>
                  <label>Strength<input type="range" min={0.3} max={1} step={0.05} value={opt.finish.strength} onChange={(e) => updOpt((o) => { if (o.finish) o.finish.strength = Number(e.target.value); })} /></label>
                  {opt.finish.kind !== "paint" && <label>Pattern size<input type="range" min={0.03} max={0.6} step={0.01} value={opt.finish.scale} onChange={(e) => updOpt((o) => { if (o.finish) o.finish.scale = Number(e.target.value); })} /></label>}
                </>
              )}
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>Paint</h3>
              {sortedPaints.length ? (
                <div className="swatches">
                  {sortedPaints.slice(0, 60).map((p) => (
                    <button key={p.id} className="swatch" aria-pressed={opt.finish?.paintId === p.id} title={`${p.brand} ${p.name} ${p.code}`}
                      onClick={() => setFinish({ kind: "paint", paintId: p.id, hex: p.hex, name: `${p.brand} ${p.name}${p.code ? ` (${p.code})` : ""}`.trim(), strength: opt.finish?.strength ?? 0.9, scale: 0.15 })}>
                      <div className="chip" style={{ background: p.hex }} /><span>{p.favorite ? "★ " : ""}{p.name}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="sub" style={{ fontSize: 13 }}>No saved paints yet. Add them in the Library, or ask the chat assistant to find a color.</p>}
              <ColorField
                value={opt.finish?.kind === "paint" && opt.finish.hex ? opt.finish.hex : "#c8c2b4"}
                onChange={(hex) => setFinish({ kind: "paint", hex, name: `Custom ${hex.toUpperCase()}`, strength: opt.finish?.strength ?? 0.9, scale: 0.15 })}
              />
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>Wallpaper & tile</h3>
              {ws.materials.length ? (
                <div className="swatches">
                  {ws.materials.map((m) => (
                    <button key={m.id} className="swatch" aria-pressed={opt.finish?.materialId === m.id} title={m.name}
                      onClick={() => setFinish({ kind: m.kind, materialId: m.id, name: m.name, strength: opt.finish?.strength ?? 0.9, scale: opt.finish?.scale ?? 0.15 })}>
                      <div className="chip" style={{ backgroundImage: `url(${m.imageUrl})` }} /><span>{m.name}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="sub" style={{ fontSize: 13 }}>Add wallpaper and tile swatches in the Library.</p>}
              <WallArea opt={opt} room={room} updOpt={updOpt} />
              {opt.strokes.length > 0 && <button className="btn sm ghost danger" onClick={() => updOpt((o) => { o.strokes = []; })}>Clear marked area</button>}
            </div>
          )}

          {tab === "pieces" && (
            <div className="stack">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="sub" style={{ margin: 0, fontSize: 13 }}>{room.widthIn ? "Pieces are sized from their real width compared with the room." : "Add the room width (Edit room) to size pieces automatically."}</span>
                <button className="btn sm primary" onClick={() => setModal(<Modal onClose={closeModal}><PieceForm update={update} close={closeModal} toast={toast} /></Modal>)}>+ New piece</button>
              </div>
              {opt.pieces.length > 0 && <><h3 style={{ fontSize: 15, fontWeight: 700 }}>In this option</h3>
                <div className="list">
                  {opt.pieces.map((p) => { const piece = ws.pieces.find((x) => x.id === p.pieceId); return piece && (
                    <div key={p.uid} className="item">
                      {piece.imageUrl && <img alt="" src={piece.imageUrl} />}
                      <div className="grow"><div className="t">{piece.name}</div><div className="m">{fitText(piece, room)}</div></div>
                      <button className="btn sm ghost danger" onClick={() => updOpt((o) => { o.pieces = o.pieces.filter((x) => x.uid !== p.uid); })}>Remove</button>
                    </div>); })}
                </div></>}
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>Your library</h3>
              {ws.pieces.length ? (
                <div className="list">
                  {[...ws.pieces].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite)).map((p) => (
                    <div key={p.id} className="item">
                      {p.imageUrl ? <img alt="" src={p.imageUrl} /> : <div className="thumb-empty" title="No photo yet" />}
                      <div className="grow">
                        <div className="t">{p.favorite ? "★ " : ""}{p.name}</div>
                        <div className="m">{p.imageUrl ? <>{fmtIn(p.widthIn)} W{p.price ? ` · ${money(p.price)}` : ""}{p.vendor ? ` · ${p.vendor}` : ""}</> : <span className="badge-warn">Missing photo</span>}</div>
                      </div>
                      <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                        <button className="btn sm ghost" onClick={() => setModal(<Modal onClose={closeModal}><PieceForm update={update} close={closeModal} toast={toast} piece={p} focusPhoto={!p.imageUrl} /></Modal>)}>Edit</button>
                        <button className="btn sm" onClick={() => placePiece(p)}>Place</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="sub" style={{ fontSize: 13 }}>No pieces yet. Add a product photo and its size, and it becomes a cutout you can drag into the room.</p>}
            </div>
          )}

          {tab === "price" && (
            <div className="stack">
              <table className="totals"><tbody>
                {cost.lines.map((l, i) => <tr key={i}><td><b>{l.label}</b><br /><span className="sub" style={{ fontSize: 12 }}>{l.detail}</span></td><td>{money(l.amount)}</td></tr>)}
                <tr className="total"><td>Total for {opt.name}</td><td>{money(cost.total)}</td></tr>
              </tbody></table>
              {cost.missing.map((m, i) => <div key={i} className="warn">{m}</div>)}
              {!cost.lines.length && <p className="sub">Add a finish or pieces to see prices.</p>}
              <WallArea opt={opt} room={room} updOpt={updOpt} />
              <p className="sub" style={{ fontSize: 12 }}>Estimates before tax, delivery and labor. Paint assumes {2} coats at 350 sq ft per gallon; wallpaper adds 15% for pattern matching; tile adds 10%.</p>
            </div>
          )}

          {tab === "ai" && (
            <div className="stack">
              {setupMsg && <div className="warn">{setupMsg} <button className="linkbtn" onClick={openSettings}>Go to Settings →</button></div>}
              <p className="sub" style={{ margin: 0, fontSize: 13 }}>Turns your current design (photo, finish and pieces) into a realistic picture. Photos of the pieces and materials you used are sent too, so the real products appear. Each picture is saved below.</p>
              <div className="chips">{PRESETS.map((p) => <button key={p.label} className={setup.pictures ? "" : "setup-needed"} aria-disabled={!setup.pictures} disabled={!!busy} onClick={() => runRender(p.text, p.label)}>{p.label}</button>)}</div>
              <label>Or describe it<textarea value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="Swap the rug for a large jute rug and add linen curtains" /></label>
              <button className={`btn primary${setup.pictures ? "" : " setup-needed"}`} aria-disabled={!setup.pictures} disabled={!!busy || (setup.pictures && !aiText.trim())} onClick={() => { if (!aiText.trim() && setup.pictures) return; runRender(aiText, aiText.slice(0, 60)); if (setup.pictures) setAiText(""); }}>Create picture</button>
              {setup.loaded && !setup.pictures && <span className="setup-note">(Setup required) <button className="linkbtn" onClick={openSettings}>Add your Gemini key in Settings</button>, or use “Send to Gemini” below for free.</span>}
              <button className="btn" onClick={async () => download(await designImage(3000), fileName(room.name, opt.name))}>Download current design (PNG)</button>

              <div className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 12, gap: 8 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700 }}>Use your Gemini subscription (no extra cost)</h3>
                <label>What should Gemini do?
                  <select value={gemPreset} onChange={(e) => setGemPreset(e.target.value)}>
                    {PRESETS.map((p) => <option key={p.label} value={p.text}>{p.label}</option>)}
                    {aiText.trim() && <option value={aiText.trim()}>Your description: {aiText.trim().slice(0, 40)}</option>}
                  </select>
                </label>
                <button className="btn primary" disabled={!!busy} onClick={sendToGemini}>Send to Gemini</button>
                {gemText && (
                  <div className="note stack" style={{ gap: 6 }}>
                    <b>Ready. In Gemini:</b>
                    <span>1. Open Gemini and start a new chat.</span>
                    <span>2. Upload the {referenceItems().length ? "two pictures" : "picture"} just saved to your Downloads folder.</span>
                    <span>3. Paste the instructions (Ctrl+V){copied ? ". They're already copied" : ""}, and send.</span>
                    <span>4. Download Gemini&apos;s picture, then add it below.</span>
                    <div className="row">
                      <a className="btn sm primary" href="https://gemini.google.com/app" target="_blank" rel="noreferrer">Open Gemini</a>
                      <button className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(gemText); setCopied(true); toast("Instructions copied."); } catch { toast("Couldn't copy. Select the text below instead."); } }}>Copy instructions again</button>
                    </div>
                    <details><summary style={{ cursor: "pointer", fontSize: 13 }}>See the instructions</summary><textarea readOnly value={gemText} style={{ width: "100%", minHeight: 160, fontSize: 12 }} /></details>
                  </div>
                )}
                <label className="btn" style={{ flexDirection: "row", color: "inherit" }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); addGeminiPictures(e.dataTransfer.files); }}>
                  Add picture from Gemini (or drop it here)
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { addGeminiPictures(e.target.files); e.target.value = ""; }} />
                </label>
              </div>
              {opt.renders.length > 0 && <div className="renders">
                {opt.renders.map((r) => (
                  <figure key={r.id}>
                    <img alt={r.prompt} src={r.url} onClick={() => setModal(
                      <Modal wide onClose={closeModal}>
                        <img alt="" src={r.url} style={{ width: "100%", borderRadius: 8 }} />
                        <p className="sub">{r.prompt}</p>
                        <div className="row" style={{ marginTop: 10 }}>
                          <button className="btn primary" onClick={() => download(r.url, fileName(room.name, opt.name, r.prompt.slice(0, 40)))}>Download PNG</button>
                          <button className="btn" onClick={() => { const pid = uid(); updRoom((rm) => { rm.photos.push({ id: pid, url: r.url, name: `${opt.name} - ${r.prompt.slice(0, 30)}`, w: base?.width ?? 1600, h: base?.height ?? 1067 }); }); closeModal(); toast("Added to this room's pictures. Pick it below the stage to keep editing from it."); }}>Keep editing from this</button>
                          <button className="btn ghost danger" onClick={() => { updOpt((o) => { o.renders = o.renders.filter((x) => x.id !== r.id); }); closeModal(); }}>Remove</button>
                        </div>
                      </Modal>)} />
                    <figcaption>{r.prompt}</figcaption>
                  </figure>
                ))}
              </div>}
            </div>
          )}

          {tab === "chat" && (
            <Chat
              key={opt.id}
              ws={ws}
              room={room}
              opt={opt}
              designImage={designImage}
              onAction={(name, input) => {
                if (name === "set_wall_paint") setFinish({ kind: "paint", hex: String(input.hex), name: String(input.name), strength: opt.finish?.strength ?? 0.9, scale: 0.15 });
                else if (name === "ai_edit_picture") runRender(String(input.instruction), String(input.instruction).slice(0, 60));
                else if (name === "save_paint_color") update((w) => { w.paints.push({ id: uid(), brand: String(input.brand), name: String(input.name), code: String(input.code), hex: String(input.hex), pricePerGallon: 0 }); });
                else if (name === "save_product") update((w) => { w.pieces.push({ id: uid(), name: String(input.name), vendor: String(input.vendor), link: String(input.url), price: Number(input.price) || 0, category: "", widthIn: 0, depthIn: 0, heightIn: 0, imageUrl: "" }); });
              }}
            />
          )}
        </aside>
      </div>
      {modal}
    </>
  );
}

function newOption(name: string, photoId: string | null): DesignOption {
  return { id: uid(), name, photoId, finish: null, strokes: [], pieces: [], renders: [], wallAreaSqFt: 0, created: Date.now() };
}

function fitText(piece: Piece, room: Room) {
  const parts = [`${fmtIn(piece.widthIn)} W × ${fmtIn(piece.depthIn)} D × ${fmtIn(piece.heightIn)} H`];
  if (piece.widthIn && room.widthIn) {
    const spare = room.widthIn - piece.widthIn;
    parts.push(spare >= 0 ? `leaves ${fmtIn(spare)} of the room's width` : `${fmtIn(-spare)} wider than the room`);
  }
  if (piece.heightIn && room.heightIn && piece.heightIn > room.heightIn) parts.push("taller than the ceiling");
  return parts.join(" · ");
}

function WallArea({ opt, room, updOpt }: { opt: DesignOption; room: Room; updOpt: (fn: (o: DesignOption) => void) => void }) {
  const [wallFt, setWallFt] = useState("");
  return (
    <div className="stack" style={{ gap: 6 }}>
      <label>Area covered (sq ft)
        <input type="number" min={0} value={opt.wallAreaSqFt || ""} onChange={(e) => updOpt((o) => { o.wallAreaSqFt = Number(e.target.value); })} placeholder="e.g. 120" />
      </label>
      {room.heightIn > 0 && (
        <div className="row" style={{ fontSize: 13 }}>
          <span className="sub" style={{ margin: 0 }}>Or wall width</span>
          <input type="number" min={0} value={wallFt} onChange={(e) => setWallFt(e.target.value)} style={{ width: 70 }} aria-label="Wall width in feet" />
          <span className="sub" style={{ margin: 0 }}>ft × {fmtIn(room.heightIn)} ceiling</span>
          <button className="btn sm" disabled={!Number(wallFt)} onClick={() => updOpt((o) => { o.wallAreaSqFt = Math.round(Number(wallFt) * (room.heightIn / 12)); })}>Use</button>
        </div>
      )}
    </div>
  );
}

function CompareModal({ room, ws, onClose, onOpen }: { room: Room; ws: Workspace; onClose: () => void; onOpen: (id: string) => void }) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [useAi, setUseAi] = useState(true);
  useEffect(() => {
    let live = true;
    (async () => {
      for (const o of room.options) {
        const photo = room.photos.find((p) => p.id === o.photoId) ?? room.photos[0];
        if (!photo) continue;
        try {
          const base = await loadImage(photo.url);
          const mat = o.finish && o.finish.kind !== "paint" ? ws.materials.find((m) => m.id === o.finish!.materialId) : undefined;
          const tex = mat ? await loadImage(mat.imageUrl) : null;
          const full = compositeFinish(base, Math.min(900, base.width), Math.min(900, base.width) * (base.height / base.width), o.strokes, o.finish, tex);
          const items = [];
          for (const p of o.pieces) {
            const piece = ws.pieces.find((x) => x.id === p.pieceId);
            if (piece?.imageUrl) items.push({ p, img: await loadImage(piece.imageUrl) });
          }
          const url = flatten(full, items, 900).toDataURL("image/jpeg", 0.85);
          if (live) setThumbs((t) => ({ ...t, [o.id]: url }));
        } catch {}
      }
    })();
    return () => { live = false; };
  }, [room, ws]);
  return (
    <Modal wide onClose={onClose}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{room.name}: compare options</h2>
        <div className="row">
          <label style={{ flexDirection: "row", alignItems: "center", gap: 6, fontWeight: 500 }}><input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> Show AI pictures when available</label>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="compare">
        {room.options.map((o) => {
          const c = optionCost(o, ws);
          const src = (useAi && o.renders[0]?.url) || thumbs[o.id];
          return (
            <figure key={o.id}>
              {src ? <img alt={o.name} src={src} /> : <div className="thumb">Preparing…</div>}
              <figcaption>
                <div><b>{o.favorite ? "★ " : ""}{o.name}</b><div className="sub" style={{ margin: 0, fontSize: 13 }}>{o.finish?.name ?? "No finish"} · {o.pieces.length} pieces</div></div>
                <div style={{ textAlign: "right" }}><div className="money"><b>{money(c.total)}</b></div><button className="btn sm ghost" onClick={() => onOpen(o.id)}>Open</button></div>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </Modal>
  );
}
