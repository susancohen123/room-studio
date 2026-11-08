"use client";
import { useEffect, useState } from "react";
import type { Material, Paint, Piece, Workspace } from "@/lib/types";
import { cutout, hexToRgb, uploadBlob, prepPhoto } from "@/lib/imaging";
import { money } from "@/lib/pricing";
import type { Update } from "./Studio";
import { FtIn, Modal, fmtIn, uid } from "./ui";

type Tab = "paints" | "materials" | "pieces";

export default function Library({ ws, update, toast }: { ws: Workspace; update: Update; toast: (m: string) => void }) {
  const [tab, setTab] = useState<Tab>("paints");
  const [modal, setModal] = useState<React.ReactNode>(null);
  const [q, setQ] = useState("");
  const close = () => setModal(null);
  const match = (...s: string[]) => !q || s.join(" ").toLowerCase().includes(q.toLowerCase());

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Shared across every client</div><h1>Library</h1><p className="sub">Your paints, wallpapers, tiles and pieces. Star the ones you reach for most.</p></div>
        <div className="row">
          <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the library" />
          {tab === "paints" && <><button className="btn" onClick={() => setModal(<Modal onClose={close}><ImportPaints ws={ws} update={update} close={close} toast={toast} /></Modal>)}>Import a color list</button>
            <button className="btn primary" onClick={() => setModal(<Modal onClose={close}><PaintForm update={update} close={close} /></Modal>)}>+ Paint color</button></>}
          {tab === "materials" && <button className="btn primary" onClick={() => setModal(<Modal onClose={close}><MaterialForm update={update} close={close} toast={toast} /></Modal>)}>+ Wallpaper or tile</button>}
          {tab === "pieces" && <button className="btn primary" onClick={() => setModal(<Modal onClose={close}><PieceForm update={update} close={close} toast={toast} /></Modal>)}>+ Piece</button>}
        </div>
      </div>
      <div className="tabs" role="tablist">
        {([["paints", `Paint (${ws.paints.length})`], ["materials", `Wallpaper & tile (${ws.materials.length})`], ["pieces", `Furniture & decor (${ws.pieces.length})`]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "paints" && (ws.paints.length ? (
        <div className="swatches" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
          {[...ws.paints].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite)).filter((p) => match(p.brand, p.name, p.code)).map((p) => (
            <div key={p.id} className="swatch">
              <div className="chip" style={{ background: p.hex, height: 70 }} />
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", whiteSpace: "normal" }}>
                <span style={{ padding: 0 }}><b>{p.name}</b><br />{p.brand} {p.code}{p.pricePerGallon ? ` · ${money(p.pricePerGallon)}/gal` : ""}</span>
                <span className="row" style={{ gap: 0, flexWrap: "nowrap" }}>
                  <button className="star" aria-label={p.favorite ? "Unstar" : "Star"} onClick={() => update((w) => { const x = w.paints.find((k) => k.id === p.id)!; x.favorite = !x.favorite; })}>{p.favorite ? "★" : "☆"}</button>
                  <button className="btn ghost sm" onClick={() => setModal(<Modal onClose={close}><PaintForm update={update} close={close} paint={p} /></Modal>)}>Edit</button>
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : <div className="empty"><strong>No paint colors yet</strong>Add colors one at a time, or import a list from Sherwin-Williams, Benjamin Moore or any brand. The chat assistant in a room can also look colors up for you.</div>)}

      {tab === "materials" && (ws.materials.length ? (
        <div className="grid">
          {ws.materials.filter((m) => match(m.name, m.vendor)).map((m) => (
            <div key={m.id} className="card">
              <div className="thumb" style={{ backgroundImage: `url(${m.imageUrl})`, backgroundSize: "120px" }} />
              <div className="body">
                <h3 style={{ fontSize: 18 }}>{m.name}</h3>
                <div className="meta">{m.kind === "wallpaper" ? "Wallpaper" : "Tile"}{m.vendor ? ` · ${m.vendor}` : ""} · {money(m.price)}{m.kind === "wallpaper" ? `/roll (${m.coverageSqFt} sq ft)` : "/sq ft"}</div>
                <div className="row">
                  {m.link && <a href={m.link} target="_blank" rel="noreferrer" className="btn ghost sm">Product page</a>}
                  <button className="btn ghost sm danger" onClick={() => update((w) => { w.materials = w.materials.filter((k) => k.id !== m.id); })}>Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="empty"><strong>No wallpapers or tiles yet</strong>Upload a flat swatch image (a straight-on photo of the pattern) with its price.</div>)}

      {tab === "pieces" && (ws.pieces.length ? (
        <div className="grid">
          {ws.pieces.filter((p) => match(p.name, p.vendor, p.category)).map((p) => (
            <div key={p.id} className="card piece-card">
              <button className="thumb thumb-btn" style={{ background: "var(--sunk)" }} aria-label={p.imageUrl ? `Edit ${p.name}` : `Add a photo to ${p.name}`}
                onClick={() => setModal(<Modal onClose={close}><PieceForm update={update} close={close} toast={toast} piece={p} focusPhoto={!p.imageUrl} /></Modal>)}>
                {p.imageUrl ? <img alt="" src={p.imageUrl} style={{ objectFit: "contain" }} /> : <span className="addphoto">+ Add a photo</span>}
              </button>
              <div className="body">
                {!p.imageUrl && <span className="badge-warn">Missing photo</span>}
                <button className="titlebtn" onClick={() => setModal(<Modal onClose={close}><PieceForm update={update} close={close} toast={toast} piece={p} /></Modal>)}><h3 style={{ fontSize: 18 }}>{p.name}</h3></button>
                <div className="meta">{[p.vendor, p.category].filter(Boolean).join(" · ")}{p.price ? ` · ${money(p.price)}` : ""}</div>
                <div className="meta">{fmtIn(p.widthIn)} W × {fmtIn(p.depthIn)} D × {fmtIn(p.heightIn)} H</div>
                <div className="row">
                  <button className="btn ghost sm" onClick={() => setModal(<Modal onClose={close}><PieceForm update={update} close={close} toast={toast} piece={p} /></Modal>)}>Edit</button>
                  {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="btn ghost sm">Product page</a>}
                  <button className="star" aria-label={p.favorite ? "Unstar" : "Star"} onClick={() => update((w) => { const x = w.pieces.find((k) => k.id === p.id)!; x.favorite = !x.favorite; })}>{p.favorite ? "★" : "☆"}</button>
                  <button className="btn ghost sm danger piece-delete" onClick={() => setModal(
                    <Modal onClose={close}>
                      <h2>Remove “{p.name}” from your library?</h2>
                      <p className="sub">It will also disappear from any design options it was placed in. This can&apos;t be undone.</p>
                      <div className="row" style={{ marginTop: 16 }}>
                        <button className="btn danger" onClick={() => { update((w) => { w.pieces = w.pieces.filter((k) => k.id !== p.id); }); toast("Piece removed."); close(); }}>Remove</button>
                        <button className="btn ghost" onClick={close}>Keep it</button>
                      </div>
                    </Modal>)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="empty"><strong>No pieces yet</strong>Add a product photo (catalog photos on a white background work best) and the background is removed for you.</div>)}
      {modal}
    </>
  );
}

function PaintForm({ update, close, paint }: { update: Update; close: () => void; paint?: Paint }) {
  const [d, setD] = useState<Omit<Paint, "id">>({ brand: paint?.brand ?? "", name: paint?.name ?? "", code: paint?.code ?? "", hex: paint?.hex ?? "#d9d4c7", pricePerGallon: paint?.pricePerGallon ?? 0 });
  return (
    <form className="stack" onSubmit={(e) => {
      e.preventDefault();
      if (!d.name.trim() || !hexToRgb(d.hex)) return;
      update((w) => { if (paint) Object.assign(w.paints.find((k) => k.id === paint.id)!, d); else w.paints.push({ id: uid(), ...d }); });
      close();
    }}>
      <h2>{paint ? "Edit paint color" : "New paint color"}</h2>
      <div className="two">
        <label>Brand<input value={d.brand} onChange={(e) => setD({ ...d, brand: e.target.value })} placeholder="Benjamin Moore" /></label>
        <label>Color code<input value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} placeholder="OC-17" /></label>
      </div>
      <label>Color name<input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="White Dove" autoFocus /></label>
      <div className="two">
        <label>Color<span className="row"><input type="color" value={hexToRgb(d.hex) ? d.hex : "#cccccc"} onChange={(e) => setD({ ...d, hex: e.target.value })} style={{ width: 52, padding: 2 }} /><input value={d.hex} onChange={(e) => setD({ ...d, hex: e.target.value })} style={{ flex: 1 }} aria-label="Hex code" /></span></label>
        <label>Price per gallon ($)<input type="number" min={0} step={0.01} value={d.pricePerGallon || ""} onChange={(e) => setD({ ...d, pricePerGallon: Number(e.target.value) })} /></label>
      </div>
      <p className="sub" style={{ fontSize: 13 }}>Screen colors are approximate. Always confirm with a physical sample.</p>
      <div className="row">
        <button className="btn primary">Save</button>
        {paint && <button type="button" className="btn ghost danger" onClick={() => { update((w) => { w.paints = w.paints.filter((k) => k.id !== paint.id); }); close(); }}>Remove</button>}
        <button type="button" className="btn ghost" onClick={close}>Cancel</button>
      </div>
    </form>
  );
}

function ImportPaints({ ws, update, close, toast }: { ws: Workspace; update: Update; close: () => void; toast: (m: string) => void }) {
  const [text, setText] = useState("");
  const [brand, setBrand] = useState("");
  const rows = text.split(/\r?\n/).map((l) => l.split(/[,\t;]/).map((s) => s.trim())).flatMap((cells) => {
    const hexI = cells.findIndex((c) => /^#?[0-9a-f]{6}$/i.test(c));
    if (hexI < 0) return [];
    const hex = cells[hexI].startsWith("#") ? cells[hexI] : `#${cells[hexI]}`;
    const rest = cells.filter((_, i) => i !== hexI && cells[i]);
    const code = rest.find((c) => /\d/.test(c) && c.length <= 12) ?? "";
    const name = rest.find((c) => c !== code && !/^\$?\d+(\.\d+)?$/.test(c)) ?? code;
    return [{ name, code, hex }];
  });
  return (
    <div className="stack">
      <h2>Import a color list</h2>
      <p className="sub">Paste a list with one color per line: name, code and hex value (like <code>Agreeable Gray, SW 7029, #D1CBC1</code>). Spreadsheet rows work too. Paint brands publish downloadable color lists for designers on their websites.</p>
      <label>Brand<input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Sherwin-Williams" /></label>
      <label>Colors<textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 180 }} /></label>
      <div className="note">{rows.length} colors found{rows.length ? `, for example ${rows[0].name} ${rows[0].hex}` : ""}.</div>
      <div className="row">
        <button className="btn primary" disabled={!rows.length || !brand.trim()} onClick={() => {
          const have = new Set(ws.paints.map((p) => `${p.brand}|${p.code || p.name}`.toLowerCase()));
          const add = rows.filter((r) => !have.has(`${brand.trim()}|${r.code || r.name}`.toLowerCase()));
          update((w) => { for (const r of add) w.paints.push({ id: uid(), brand: brand.trim(), ...r, pricePerGallon: 0 }); });
          toast(`Added ${add.length} colors${rows.length - add.length ? ` (${rows.length - add.length} were already there)` : ""}.`);
          close();
        }}>Import</button>
        <button className="btn ghost" onClick={close}>Cancel</button>
      </div>
    </div>
  );
}

function MaterialForm({ update, close, toast }: { update: Update; close: () => void; toast: (m: string) => void }) {
  const [d, setD] = useState<Omit<Material, "id" | "imageUrl">>({ kind: "wallpaper", name: "", vendor: "", price: 0, coverageSqFt: 28, link: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      if (!d.name.trim() || !file) return;
      setBusy(true);
      try {
        const { blob } = await prepPhoto(file, 1200);
        const imageUrl = await uploadBlob(blob, "materials", "swatch.jpg");
        update((w) => { w.materials.push({ id: uid(), ...d, coverageSqFt: d.kind === "tile" ? 1 : d.coverageSqFt, imageUrl }); });
        close();
      } catch (err) { toast(err instanceof Error ? err.message : "Upload failed"); setBusy(false); }
    }}>
      <h2>New wallpaper or tile</h2>
      <div className="seg" role="group">
        {(["wallpaper", "tile"] as const).map((k) => <button type="button" key={k} aria-pressed={d.kind === k} onClick={() => setD({ ...d, kind: k })}>{k === "wallpaper" ? "Wallpaper" : "Tile"}</button>)}
      </div>
      <label>Swatch image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      <div className="two">
        <label>Name<input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
        <label>Vendor<input value={d.vendor} onChange={(e) => setD({ ...d, vendor: e.target.value })} /></label>
      </div>
      <div className="two">
        <label>{d.kind === "wallpaper" ? "Price per roll ($)" : "Price per sq ft ($)"}<input type="number" min={0} step={0.01} value={d.price || ""} onChange={(e) => setD({ ...d, price: Number(e.target.value) })} /></label>
        {d.kind === "wallpaper" && <label>Sq ft per roll<input type="number" min={1} value={d.coverageSqFt || ""} onChange={(e) => setD({ ...d, coverageSqFt: Number(e.target.value) })} /></label>}
      </div>
      <label>Product link<input type="url" value={d.link} onChange={(e) => setD({ ...d, link: e.target.value })} placeholder="https://" /></label>
      <div className="row"><button className="btn primary" disabled={busy || !file || !d.name.trim()}>{busy ? "Uploading…" : "Save"}</button><button type="button" className="btn ghost" onClick={close}>Cancel</button></div>
    </form>
  );
}

export function PieceForm({ update, close, toast, piece, focusPhoto }: { update: Update; close: () => void; toast: (m: string) => void; piece?: Piece; focusPhoto?: boolean }) {
  const [d, setD] = useState<Omit<Piece, "id" | "imageUrl">>({
    name: piece?.name ?? "", vendor: piece?.vendor ?? "", category: piece?.category ?? "", price: piece?.price ?? 0, link: piece?.link ?? "",
    widthIn: piece?.widthIn ?? 0, depthIn: piece?.depthIn ?? 0, heightIn: piece?.heightIn ?? 0,
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeBg, setRemoveBg] = useState(true);
  const [busy, setBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const [nameErr, setNameErr] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const hasPhoto = !!file || !!piece?.imageUrl;

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  return (
    <form className="stack" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const noName = !d.name.trim();
      setNameErr(noName ? "Give this piece a name." : "");
      setPhotoErr(hasPhoto ? "" : "Upload a product photo before saving — it's required to place this piece in a room.");
      if (noName || !hasPhoto) return;
      setBusy(true);
      try {
        let imageUrl = piece?.imageUrl ?? "";
        if (file) {
          const blob = removeBg ? await cutout(file) : (await prepPhoto(file, 1200)).blob;
          imageUrl = await uploadBlob(blob, "pieces", removeBg ? "piece.png" : "piece.jpg");
        }
        update((w) => {
          if (piece) Object.assign(w.pieces.find((k) => k.id === piece.id)!, d, { imageUrl });
          else w.pieces.push({ id: uid(), ...d, imageUrl });
        });
        toast(piece ? "Piece updated." : "Piece saved to your library.");
        close();
      } catch (err) { toast(err instanceof Error ? err.message : "Upload failed"); setBusy(false); }
    }}>
      <h2>{piece ? "Edit piece" : "New piece"}</h2>
      <label>
        <span>Product photo <span className="req">(required)</span>{piece?.imageUrl ? " — leave empty to keep the current one" : ""}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" autoFocus={focusPhoto}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setPhotoErr("");
            setPreview(f ? URL.createObjectURL(f) : null);
          }} />
        <span className="help">Required. Upload a product photo to place this piece in a room. Catalog photos on a plain background work best.</span>
        {photoErr && <span className="err" role="alert">{photoErr}</span>}
      </label>
      {(preview || piece?.imageUrl) && <img className="formpreview" alt="Photo preview" src={preview ?? piece!.imageUrl} />}
      <label style={{ flexDirection: "row", alignItems: "center", gap: 8, fontWeight: 500 }}><input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} /> Remove the plain background</label>
      <div className="two">
        <label>Name<input value={d.name} onChange={(e) => { setD({ ...d, name: e.target.value }); setNameErr(""); }} placeholder="Walnut nightstand" />{nameErr && <span className="err" role="alert">{nameErr}</span>}</label>
        <label><span>Vendor <span className="opt">(optional)</span></span><input value={d.vendor} onChange={(e) => setD({ ...d, vendor: e.target.value })} /></label>
      </div>
      <div className="two">
        <label><span>Category <span className="opt">(optional)</span></span><input value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} placeholder="Lighting, seating, rugs…" /></label>
        <label><span>Price ($) <span className="opt">(optional)</span></span><input type="number" min={0} step={0.01} value={d.price || ""} onChange={(e) => setD({ ...d, price: Number(e.target.value) })} /></label>
      </div>
      <div className="three">
        <FtIn label="Width (optional)" value={d.widthIn} onChange={(v) => setD({ ...d, widthIn: v })} />
        <FtIn label="Depth (optional)" value={d.depthIn} onChange={(v) => setD({ ...d, depthIn: v })} />
        <FtIn label="Height (optional)" value={d.heightIn} onChange={(v) => setD({ ...d, heightIn: v })} />
      </div>
      <label>
        <span>Product link <span className="opt">(optional)</span></span>
        <input type="url" value={d.link} onChange={(e) => setD({ ...d, link: e.target.value })} placeholder="https://" />
        <span className="help">Links to the product page for your reference. This does not import an image — use the photo upload above to add the product image.</span>
      </label>
      {confirmRemove && piece ? (
        <div className="warn row" style={{ justifyContent: "space-between" }}>
          <span>Remove “{piece.name}” from your library?</span>
          <span className="row">
            <button type="button" className="btn sm danger" onClick={() => { update((w) => { w.pieces = w.pieces.filter((k) => k.id !== piece.id); }); toast("Piece removed."); close(); }}>Remove</button>
            <button type="button" className="btn sm ghost" onClick={() => setConfirmRemove(false)}>Keep it</button>
          </span>
        </div>
      ) : (
        <div className="row">
          <button className="btn primary" disabled={busy}>{busy ? "Working…" : "Save"}</button>
          {piece && <button type="button" className="btn ghost danger" onClick={() => setConfirmRemove(true)}>Remove</button>}
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
        </div>
      )}
    </form>
  );
}
