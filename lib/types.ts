// Everything the app saves lives in one "workspace" document.

export type Id = string;

export interface Photo {
  id: Id;
  url: string; // served by /api/files/...
  name: string;
  w: number;
  h: number;
}

export interface Stroke {
  // Points are 0..1 fractions of the photo, so they survive resizing.
  pts: number[];
  size: number; // fraction of photo width
  erase?: boolean;
  poly?: boolean; // closed outline shape instead of a brush line
}

export type FinishKind = "paint" | "wallpaper" | "tile";

export interface Finish {
  kind: FinishKind;
  paintId?: Id;
  materialId?: Id;
  hex?: string;
  name: string;
  strength: number; // 0..1
  scale: number; // texture repeat size, fraction of photo width
}

export interface PlacedPiece {
  uid: Id;
  pieceId: Id;
  x: number; // 0..1 of photo width (top-left)
  y: number; // 0..1 of photo height
  w: number; // 0..1 of photo width
  rotation: number;
}

export interface Render {
  id: Id;
  url: string;
  prompt: string;
  created: number;
}

export interface DesignOption {
  id: Id;
  name: string;
  photoId: Id | null;
  finish: Finish | null;
  strokes: Stroke[];
  pieces: PlacedPiece[];
  renders: Render[];
  wallAreaSqFt: number; // area the finish covers, for pricing
  thumb?: string; // small preview image url
  favorite?: boolean;
  created: number;
}

export interface Room {
  id: Id;
  name: string;
  widthIn: number;
  depthIn: number;
  heightIn: number;
  notes: string;
  photos: Photo[];
  options: DesignOption[];
}

export interface Home {
  id: Id;
  label: string;
  address: string;
  rooms: Room[];
}

export interface Client {
  id: Id;
  name: string;
  notes: string;
  homes: Home[];
}

export interface Paint {
  id: Id;
  brand: string;
  name: string;
  code: string;
  hex: string;
  pricePerGallon: number;
  favorite?: boolean;
}

export interface Material {
  id: Id;
  kind: "wallpaper" | "tile";
  name: string;
  vendor: string;
  imageUrl: string;
  price: number; // per roll (wallpaper) or per sq ft (tile)
  coverageSqFt: number; // per roll; 1 for tile
  link: string;
  favorite?: boolean;
}

export interface Piece {
  id: Id;
  name: string;
  vendor: string;
  category: string;
  price: number;
  link: string;
  widthIn: number;
  depthIn: number;
  heightIn: number;
  imageUrl: string; // background-removed cutout
  favorite?: boolean;
}

export interface Workspace {
  version: 1;
  clients: Client[];
  paints: Paint[];
  materials: Material[];
  pieces: Piece[];
}

export const emptyWorkspace = (): Workspace => ({
  version: 1,
  clients: [],
  paints: [],
  materials: [],
  pieces: [],
});
