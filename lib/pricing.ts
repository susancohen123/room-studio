import type { DesignOption, Workspace } from "./types";

export const PAINT_SQFT_PER_GALLON = 350;
export const PAINT_COATS = 2;
export const WALLPAPER_WASTE = 0.15;
export const TILE_WASTE = 0.1;

export interface CostLine { label: string; detail: string; amount: number }

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 });

export function optionCost(opt: DesignOption, ws: Workspace): { lines: CostLine[]; total: number; missing: string[] } {
  const lines: CostLine[] = [];
  const missing: string[] = [];
  const area = Math.max(0, opt.wallAreaSqFt || 0);
  const f = opt.finish;
  if (f) {
    if (!area) missing.push("Enter the wall area to price the finish.");
    if (f.kind === "paint") {
      const paint = ws.paints.find((p) => p.id === f.paintId);
      const per = paint?.pricePerGallon ?? 0;
      const gallons = Math.ceil((area * PAINT_COATS) / PAINT_SQFT_PER_GALLON);
      if (area && !per) missing.push("Add a price per gallon for this paint.");
      lines.push({
        label: f.name || "Paint",
        detail: `${area} sq ft × ${PAINT_COATS} coats ÷ ${PAINT_SQFT_PER_GALLON} sq ft/gal = ${gallons} gal × ${money(per)}`,
        amount: gallons * per,
      });
    } else {
      const m = ws.materials.find((x) => x.id === f.materialId);
      if (m && f.kind === "wallpaper") {
        const cover = m.coverageSqFt || 1;
        const rolls = Math.ceil((area * (1 + WALLPAPER_WASTE)) / cover);
        lines.push({
          label: m.name,
          detail: `${area} sq ft + ${WALLPAPER_WASTE * 100}% waste ÷ ${cover} sq ft/roll = ${rolls} rolls × ${money(m.price)}`,
          amount: rolls * m.price,
        });
      } else if (m) {
        const sq = Math.ceil(area * (1 + TILE_WASTE));
        lines.push({
          label: m.name,
          detail: `${area} sq ft + ${TILE_WASTE * 100}% waste = ${sq} sq ft × ${money(m.price)}/sq ft`,
          amount: sq * m.price,
        });
      }
    }
  }
  const counts = new Map<string, number>();
  for (const p of opt.pieces) counts.set(p.pieceId, (counts.get(p.pieceId) ?? 0) + 1);
  for (const [id, qty] of counts) {
    const piece = ws.pieces.find((p) => p.id === id);
    if (!piece) continue;
    if (!piece.price) missing.push(`No price for ${piece.name}.`);
    lines.push({
      label: piece.name,
      detail: `${qty} × ${money(piece.price)}${piece.vendor ? ` · ${piece.vendor}` : ""}`,
      amount: qty * piece.price,
    });
  }
  const total = Math.round(lines.reduce((t, l) => t + l.amount, 0) * 100) / 100;
  return { lines, total, missing };
}
