// Real imagery can replace any generated visual without touching layout code:
// drop a file into /public/media/ and point its slot here, e.g.
//   "pleated-fan": "/media/pleated-fan.jpg"
// The visual component then renders that image in exactly the same frame
// (same size, crop, grayscale and lime-wash multiply) instead of its SVG.
// Local files only: the CSP allows images from this origin, nothing else.

export type MediaSlot = "pleated-fan" | "diagonal-ribbons" | "abstract-tile-1" | "abstract-tile-2" | "abstract-tile-3";

export const MEDIA: Record<MediaSlot, string | null> = {
  "pleated-fan": null,
  "diagonal-ribbons": null,
  "abstract-tile-1": null,
  "abstract-tile-2": null,
  "abstract-tile-3": null,
};
