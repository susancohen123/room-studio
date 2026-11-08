"use client";
import { useEffect, useState } from "react";

export const uid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2)).slice(0, 12);

export function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="layer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true">{children}</div>
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 3500);
    return () => clearTimeout(t);
  }, [msg]);
  return { toast: setMsg, node: msg ? <div className="toast" role="status">{msg}</div> : null };
}

/** Feet + inches input that stores inches. */
export function FtIn({ label, value, onChange }: { label: string; value: number; onChange: (inches: number) => void }) {
  const ft = Math.floor((value || 0) / 12);
  const inch = Math.round(((value || 0) - ft * 12) * 10) / 10;
  return (
    <label>
      {label}
      <span className="row" style={{ flexWrap: "nowrap" }}>
        <input type="number" min={0} value={ft || ""} placeholder="e.g. 12" aria-label={`${label} feet`} style={{ width: "100%" }}
          onChange={(e) => onChange(Number(e.target.value || 0) * 12 + inch)} />
        <span>ft</span>
        <input type="number" min={0} max={11.9} step={0.5} value={inch || ""} placeholder="0–11" aria-label={`${label} inches`} style={{ width: "100%" }}
          onChange={(e) => onChange(ft * 12 + Number(e.target.value || 0))} />
        <span>in</span>
      </span>
    </label>
  );
}

export const fmtIn = (inches: number) => {
  if (!inches) return "—";
  const ft = Math.floor(inches / 12);
  const i = Math.round((inches - ft * 12) * 10) / 10;
  return ft ? `${ft}′${i ? ` ${i}″` : ""}` : `${i}″`;
};

/** "1 room", "2 rooms" */
export const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;
