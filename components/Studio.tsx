"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Client, Home, Room, Workspace } from "@/lib/types";
import { emptyWorkspace } from "@/lib/types";
import { FtIn, Modal, fmtIn, uid, useToast } from "./ui";
import Library from "./Library";

const RoomEditor = dynamic(() => import("./RoomEditor"), { ssr: false, loading: () => <p className="status">Opening room…</p> });

type View =
  | { s: "clients" }
  | { s: "client"; c: string }
  | { s: "home"; c: string; h: string }
  | { s: "room"; c: string; h: string; r: string }
  | { s: "library" }
  | { s: "favorites" };

export type Update = (fn: (ws: Workspace) => void) => void;

export default function Studio({ canSignOut = true }: { canSignOut?: boolean }) {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [view, setView] = useState<View>(() => {
    if (typeof window === "undefined") return { s: "clients" };
    try {
      const v = JSON.parse(sessionStorage.getItem("rs_view") ?? "null");
      if (v?.s) return v as View;
    } catch {}
    return { s: "clients" };
  });
  const [saveState, setSaveState] = useState("");
  const [form, setForm] = useState<React.ReactNode>(null);
  const { toast, node: toastNode } = useToast();
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Workspace | null>(null);

  useEffect(() => {
    fetch("/api/data", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) { window.location.href = "/login"; return null; }
        return r.json();
      })
      .then((d) => d && setWs({ ...emptyWorkspace(), ...d }))
      .catch(() => setSaveState("Couldn't load your work. Refresh to try again."));
  }, []);

  useEffect(() => { try { sessionStorage.setItem("rs_view", JSON.stringify(view)); } catch {} }, [view]);

  const flush = useCallback(async () => {
    if (!dirty.current || !latest.current) return;
    dirty.current = false;
    setSaveState("Saving…");
    const r = await fetch("/api/data", { method: "PUT", body: JSON.stringify(latest.current) }).catch(() => null);
    if (r?.ok) setSaveState("All changes saved");
    else { dirty.current = true; setSaveState("Not saved — check your connection"); }
  }, []);

  const update: Update = useCallback((fn) => {
    setWs((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      latest.current = next;
      return next;
    });
    dirty.current = true;
    setSaveState("Unsaved changes");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  }, [flush]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) { flush(); e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [flush]);

  if (!ws) return <div className="wrap"><p className="status" style={{ paddingTop: 40 }}>{saveState || "Opening your workspace…"}</p></div>;

  const client = "c" in view ? ws.clients.find((c) => c.id === view.c) : undefined;
  const home = "h" in view ? client?.homes.find((h) => h.id === view.h) : undefined;
  const room = "r" in view ? home?.rooms.find((r) => r.id === view.r) : undefined;
  const close = () => setForm(null);

  // ---------- forms ----------
  function clientForm(c?: Client) {
    let name = c?.name ?? "", notes = c?.notes ?? "";
    setForm(
      <Modal onClose={close}>
        <form className="stack" onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (c) update((w) => { const x = w.clients.find((k) => k.id === c.id)!; x.name = name.trim(); x.notes = notes; });
          else { const id = uid(); update((w) => { w.clients.push({ id, name: name.trim(), notes, homes: [] }); }); setView({ s: "client", c: id }); }
          close();
        }}>
          <h2>{c ? "Edit client" : "New client"}</h2>
          <label>Name<input defaultValue={name} onChange={(e) => (name = e.target.value)} placeholder="The Martins" autoFocus /></label>
          <label>Notes<textarea defaultValue={notes} onChange={(e) => (notes = e.target.value)} placeholder="Style, budget, timing, how they like to be contacted" /></label>
          <div className="row"><button className="btn primary">{c ? "Save" : "Add client"}</button><button type="button" className="btn ghost" onClick={close}>Cancel</button></div>
        </form>
      </Modal>,
    );
  }

  function homeForm(cId: string, h?: Home) {
    let label = h?.label ?? "", address = h?.address ?? "";
    setForm(
      <Modal onClose={close}>
        <form className="stack" onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          if (h) update((w) => { const x = w.clients.find((k) => k.id === cId)!.homes.find((k) => k.id === h.id)!; x.label = label.trim(); x.address = address; });
          else { const id = uid(); update((w) => { w.clients.find((k) => k.id === cId)!.homes.push({ id, label: label.trim(), address, rooms: [] }); }); setView({ s: "home", c: cId, h: id }); }
          close();
        }}>
          <h2>{h ? "Edit home" : "New home"}</h2>
          <label>Name<input defaultValue={label} onChange={(e) => (label = e.target.value)} placeholder="Lake house" autoFocus /></label>
          <label>Address<input defaultValue={address} onChange={(e) => (address = e.target.value)} placeholder="Optional" /></label>
          <div className="row"><button className="btn primary">{h ? "Save" : "Add home"}</button><button type="button" className="btn ghost" onClick={close}>Cancel</button></div>
        </form>
      </Modal>,
    );
  }

  function RoomForm({ cId, hId, r }: { cId: string; hId: string; r?: Room }) {
    const [d, setD] = useState({ name: r?.name ?? "", widthIn: r?.widthIn ?? 0, depthIn: r?.depthIn ?? 0, heightIn: r?.heightIn ?? 96, notes: r?.notes ?? "" });
    return (
      <form className="stack" onSubmit={(e) => {
        e.preventDefault();
        if (!d.name.trim()) return;
        if (r) update((w) => { Object.assign(w.clients.find((k) => k.id === cId)!.homes.find((k) => k.id === hId)!.rooms.find((k) => k.id === r.id)!, { ...d, name: d.name.trim() }); });
        else { const id = uid(); update((w) => { w.clients.find((k) => k.id === cId)!.homes.find((k) => k.id === hId)!.rooms.push({ id, ...d, name: d.name.trim(), photos: [], options: [] }); }); setView({ s: "room", c: cId, h: hId, r: id }); }
        close();
      }}>
        <h2>{r ? "Edit room" : "New room"}</h2>
        <label>Room<input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Primary bedroom" autoFocus /></label>
        <div className="three">
          <FtIn label="Width" value={d.widthIn} onChange={(v) => setD({ ...d, widthIn: v })} />
          <FtIn label="Depth" value={d.depthIn} onChange={(v) => setD({ ...d, depthIn: v })} />
          <FtIn label="Ceiling" value={d.heightIn} onChange={(v) => setD({ ...d, heightIn: v })} />
        </div>
        <label>Notes<textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Window is 34 in from the floor. Outlet left of the bed." /></label>
        <div className="row"><button className="btn primary">{r ? "Save" : "Add room"}</button><button type="button" className="btn ghost" onClick={close}>Cancel</button></div>
      </form>
    );
  }

  function confirmDelete(what: string, run: () => void) {
    setForm(
      <Modal onClose={close}>
        <h2>Delete {what}?</h2>
        <p className="sub">This removes it and everything inside it from Room Studio. It can&apos;t be undone.</p>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn danger" onClick={() => { run(); close(); }}>Delete</button>
          <button className="btn ghost" onClick={close}>Keep it</button>
        </div>
      </Modal>,
    );
  }

  // ---------- breadcrumbs ----------
  const crumbs: { label: string; go?: View }[] = [{ label: "Clients", go: { s: "clients" } }];
  if (view.s === "library") crumbs.push({ label: "Library" });
  if (view.s === "favorites") crumbs.push({ label: "Favorites" });
  if (client) crumbs.push({ label: client.name, go: { s: "client", c: client.id } });
  if (client && home) crumbs.push({ label: home.label, go: { s: "home", c: client.id, h: home.id } });
  if (client && home && room) crumbs.push({ label: room.name });
  crumbs[crumbs.length - 1].go = undefined;

  const photoOf = (r: Room) => r.options.find((o) => o.renders[0])?.renders[0]?.url ?? r.photos[0]?.url;

  let body: React.ReactNode;
  if (view.s === "library") {
    body = <Library ws={ws} update={update} toast={toast} />;
  } else if (view.s === "favorites") {
    const favs = ws.clients.flatMap((c) => c.homes.flatMap((h) => h.rooms.flatMap((r) => r.options.filter((o) => o.favorite).map((o) => ({ c, h, r, o })))));
    body = (
      <>
        <div className="head"><div><div className="eyebrow">Portfolio</div><h1>Favorites</h1><p className="sub">Design options you&apos;ve starred, across every client.</p></div></div>
        {favs.length ? (
          <div className="grid">
            {favs.map(({ c, h, r, o }) => (
              <button key={o.id} className="card" onClick={() => setView({ s: "room", c: c.id, h: h.id, r: r.id })}>
                <div className="thumb">{(o.renders[0]?.url ?? r.photos.find((p) => p.id === o.photoId)?.url) ? <img alt="" src={o.renders[0]?.url ?? r.photos.find((p) => p.id === o.photoId)!.url} /> : "No picture yet"}</div>
                <div className="body"><h3>{o.name}</h3><div className="meta">{c.name} · {h.label} · {r.name}</div></div>
              </button>
            ))}
          </div>
        ) : <div className="empty"><strong>No favorites yet</strong>Tap the ★ on any design option to add it here.</div>}
      </>
    );
  } else if (view.s === "clients" || !client) {
    body = (
      <>
        <div className="head">
          <div><div className="eyebrow">Your clients</div><h1>Who are you designing for?</h1></div>
          <button className="btn primary" onClick={() => clientForm()}>+ New client</button>
        </div>
        {ws.clients.length ? (
          <div className="grid">
            {ws.clients.map((c) => (
              <button key={c.id} className="card" onClick={() => setView({ s: "client", c: c.id })}>
                <div className="body"><h3>{c.name}</h3><div className="meta">{c.homes.length} {c.homes.length === 1 ? "home" : "homes"} · {c.homes.reduce((t, h) => t + h.rooms.length, 0)} rooms</div></div>
              </button>
            ))}
          </div>
        ) : <div className="empty"><strong>Start with a client</strong>Add a client, then their home and rooms.</div>}
      </>
    );
  } else if (view.s === "client" || !home) {
    body = (
      <>
        <div className="head">
          <div><div className="eyebrow">Client</div><h1>{client.name}</h1>{client.notes && <p className="sub">{client.notes}</p>}</div>
          <div className="row">
            <button className="btn ghost" onClick={() => clientForm(client)}>Edit</button>
            <button className="btn ghost danger" onClick={() => confirmDelete(client.name, () => { update((w) => { w.clients = w.clients.filter((k) => k.id !== client.id); }); setView({ s: "clients" }); })}>Delete</button>
            <button className="btn primary" onClick={() => homeForm(client.id)}>+ New home</button>
          </div>
        </div>
        {client.homes.length ? (
          <div className="grid">
            {client.homes.map((h) => (
              <button key={h.id} className="card" onClick={() => setView({ s: "home", c: client.id, h: h.id })}>
                <div className="thumb">{h.rooms.map(photoOf).find(Boolean) ? <img alt="" src={h.rooms.map(photoOf).find(Boolean)} /> : "No photos yet"}</div>
                <div className="body"><h3>{h.label}</h3><div className="meta">{h.address || `${h.rooms.length} rooms`}</div></div>
              </button>
            ))}
          </div>
        ) : <div className="empty"><strong>No homes yet</strong>Add the house you&apos;re working on.</div>}
      </>
    );
  } else if (view.s === "home" || !room) {
    body = (
      <>
        <div className="head">
          <div><div className="eyebrow">Home</div><h1>{home.label}</h1>{home.address && <p className="sub">{home.address}</p>}</div>
          <div className="row">
            <button className="btn ghost" onClick={() => homeForm(client.id, home)}>Edit</button>
            <button className="btn ghost danger" onClick={() => confirmDelete(home.label, () => { update((w) => { const c = w.clients.find((k) => k.id === client.id)!; c.homes = c.homes.filter((k) => k.id !== home.id); }); setView({ s: "client", c: client.id }); })}>Delete</button>
            <button className="btn primary" onClick={() => setForm(<Modal onClose={close}><RoomForm cId={client.id} hId={home.id} /></Modal>)}>+ New room</button>
          </div>
        </div>
        {home.rooms.length ? (
          <div className="grid">
            {home.rooms.map((r) => (
              <button key={r.id} className="card" onClick={() => setView({ s: "room", c: client.id, h: home.id, r: r.id })}>
                <div className="thumb">{photoOf(r) ? <img alt="" src={photoOf(r)} /> : "No photos yet"}</div>
                <div className="body"><h3>{r.name}</h3><div className="meta">{fmtIn(r.widthIn)} × {fmtIn(r.depthIn)} · {r.options.length} options</div></div>
              </button>
            ))}
          </div>
        ) : <div className="empty"><strong>No rooms yet</strong>Add a room, then upload a photo or drawing of it.</div>}
      </>
    );
  } else {
    body = (
      <RoomEditor
        key={room.id}
        ws={ws}
        room={room}
        path={[client.id, home.id, room.id]}
        clientName={client.name}
        update={update}
        toast={toast}
        onEditRoom={() => setForm(<Modal onClose={close}><RoomForm cId={client.id} hId={home.id} r={room} /></Modal>)}
        onDeleteRoom={() => confirmDelete(room.name, () => { update((w) => { const h = w.clients.find((k) => k.id === client.id)!.homes.find((k) => k.id === home.id)!; h.rooms = h.rooms.filter((k) => k.id !== room.id); }); setView({ s: "home", c: client.id, h: home.id }); })}
      />
    );
  }

  return (
    <>
      <header className="bar">
        <div className="wrap">
          <button className="brand" onClick={() => setView({ s: "clients" })}>Room Studio</button>
          <nav className="crumbs" aria-label="Where you are">
            {crumbs.map((c, i) => (
              <span key={i} className="row" style={{ gap: 2 }}>
                {i > 0 && <span aria-hidden="true">/</span>}
                {c.go ? <button onClick={() => setView(c.go!)}>{c.label}</button> : <span className="here">{c.label}</span>}
              </span>
            ))}
          </nav>
          <span className="spacer" />
          <span className="status" aria-live="polite">{saveState}</span>
          <button className="btn ghost sm" onClick={() => setView({ s: "favorites" })}>★ Favorites</button>
          <button className="btn ghost sm" onClick={() => setView({ s: "library" })}>Library</button>
          {canSignOut && <button className="btn ghost sm" onClick={async () => { await flush(); await fetch("/api/logout", { method: "POST" }); window.location.href = "/login"; }}>Sign out</button>}
        </div>
      </header>
      <main className="wrap">{body}</main>
      {form}
      {toastNode}
    </>
  );
}
