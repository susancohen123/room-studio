"use client";
// A color picker that stays open while you use it, with a hex code box.
import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";

/** "#b2c" -> "#bb22cc", "B2C4C0" -> "#b2c4c0". Returns null if it isn't a color. */
export function normalizeHex(input: string): string | null {
  const v = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(v)) return `#${v.split("").map((c) => c + c).join("")}`.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(v)) return `#${v}`.toLowerCase();
  return null;
}

export default function ColorField({
  value,
  onChange,
  label = "Try any color",
}: {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(normalizeHex(value) ?? "#c8c2b4");
  const [text, setText] = useState(color.toUpperCase());
  const wrap = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onChange);
  latest.current = onChange;

  // Close only when clicking outside the whole picker.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  // Apply to the wall live, but at most every 80 ms so dragging stays smooth.
  function apply(hex: string) {
    setColor(hex);
    setText(hex.toUpperCase());
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(hex), 80);
  }

  return (
    <div ref={wrap} className="colorfield">
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <button type="button" className="colorchip" style={{ background: color }} aria-label={`${label}: ${color}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>{label}</span>
        <input
          aria-label="Hex color code"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const hex = normalizeHex(e.target.value);
            if (hex) apply(hex);
          }}
          onBlur={() => setText(color.toUpperCase())}
          onPaste={(e) => {
            const hex = normalizeHex(e.clipboardData.getData("text"));
            if (hex) { e.preventDefault(); apply(hex); }
          }}
          placeholder="#B2C4C0"
          maxLength={7}
          style={{ width: 96, fontFamily: "ui-monospace, monospace" }}
        />
      </div>
      {open && (
        <div className="colorpop">
          <HexColorPicker color={color} onChange={apply} />
          <button type="button" className="btn sm" onClick={() => setOpen(false)}>Done</button>
        </div>
      )}
    </div>
  );
}
