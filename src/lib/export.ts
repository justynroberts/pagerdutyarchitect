import { getViewportForBounds } from "@xyflow/react";
import { toPng } from "html-to-image";
import type { DwellNode, Mode } from "../types";
import { dimsOf } from "./layout";
import { fmt, presenceState } from "./time";
import { LOGO_PATH, LOGO_RATIO, LOGO_VIEWBOX } from "./logo";
import wavesUrl from "../assets/waves.png";

function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "diagram";

export function downloadText(
  text: string,
  name: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  download(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const SLIDE = { w: 1920, h: 1080 };
export const SLIDE_FONT = "'Helvetica Neue', Helvetica, 'Nimbus Sans', Arial, sans-serif";

/** A 1920 x 1080 canvas drawn at 2x, ready to paint a slide on. */
export function slideCanvas(): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } | null {
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = SLIDE.w * scale;
  canvas.height = SLIDE.h * scale;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.scale(scale, scale);
  return { canvas, g };
}

/** The stage background for the current theme: the template's gradient and waves, or the plain sheet. */
export async function paintBackground(g: CanvasRenderingContext2D, css: CSSStyleDeclaration) {
  if (document.documentElement.dataset.theme === "dark") {
    // Same ramp as the stage and the template's slide 5.
    const diag = g.createLinearGradient(0, 0, SLIDE.w, SLIDE.h);
    diag.addColorStop(0, "#171817");
    diag.addColorStop(0.39, "#171817");
    diag.addColorStop(1, "#048a24");
    g.fillStyle = diag;
    g.fillRect(0, 0, SLIDE.w, SLIDE.h);
    const waves = await loadImage(wavesUrl);
    const wh = SLIDE.h;
    const ww = (waves.width / waves.height) * wh;
    g.drawImage(waves, SLIDE.w - ww, 0, ww, wh);
  } else {
    g.fillStyle = css.getPropertyValue("--canvas").trim() || "#efefef";
    g.fillRect(0, 0, SLIDE.w, SLIDE.h);
  }
}

/** The PagerDuty logo, bottom left of the slide, in the given colour. */
export async function drawLogo(g: CanvasRenderingContext2D, colour: string) {
  const lh = 34;
  const lw = lh * LOGO_RATIO;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}" width="${lw * 3}" height="${lh * 3}"><path d="${LOGO_PATH}" fill-rule="evenodd" fill="${colour}"/></svg>`;
  g.drawImage(
    await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`),
    72,
    SLIDE.h - 72 - lh,
    lw,
    lh,
  );
}

export function savePng(canvas: HTMLCanvasElement, name: string) {
  download(canvas.toDataURL("image/png"), name);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });
}

type Totals = { current: number; future: number; saved: number; pct: number };

/**
 * Renders the visible state as a 16:9 slide: the stage background, a title, the diagram
 * fitted to the page and the PagerDuty logo, so it can be dropped straight into a deck.
 */
export async function exportPng(
  nodes: DwellNode[],
  mode: Mode,
  title: string,
  totals?: Totals,
  flows: { name: string; color: string }[] = [],
): Promise<boolean> {
  nodes = nodes.map((n) => (mode === "future" && n.data.futurePos ? { ...n, position: n.data.futurePos } : n));
  const visible = nodes.filter(
    (n) => presenceState(n.data.presence, mode) !== "hidden",
  );
  const el = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!visible.length || !el) return false;

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of visible) {
    const { w, h } = dimsOf(n);
    x0 = Math.min(x0, n.position.x);
    y0 = Math.min(y0, n.position.y);
    x1 = Math.max(x1, n.position.x + w);
    y1 = Math.max(y1, n.position.y + h);
  }
  const area = { x: 72, y: 176, w: SLIDE.w - 144, h: 760 };
  const vp = getViewportForBounds(
    { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
    area.w,
    area.h,
    0.1,
    1.5,
    0.02,
  );

  // Paint set by a stylesheet does not survive the snapshot on SVG shapes (they come out black
  // with no lines), and SVG drop shadows turn black too, so pin the paint inline for the capture.
  document.documentElement.classList.add("is-exporting");
  const PAINT = ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "fill-opacity", "stroke-opacity"];
  const shapes = [...el.querySelectorAll<SVGElement>("svg path, svg polygon, svg circle, svg rect, svg line")];
  const saved = shapes.map((n) => n.getAttribute("style"));
  for (const n of shapes) {
    const cs = getComputedStyle(n);
    for (const prop of PAINT) n.style.setProperty(prop, cs.getPropertyValue(prop), "important");
  }
  let diagram: string;
  try {
    diagram = await toPng(el, {
      width: area.w,
      height: area.h,
      pixelRatio: 2,
      style: {
        width: `${area.w}px`,
        height: `${area.h}px`,
        transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
      },
    });
  } finally {
    document.documentElement.classList.remove("is-exporting");
    shapes.forEach((n, i) => (saved[i] === null ? n.removeAttribute("style") : n.setAttribute("style", saved[i]!)));
  }

  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue("--ink").trim() || "#0e231d";
  const muted = css.getPropertyValue("--muted").trim() || "#47605a";
  const font = SLIDE_FONT;

  const slide = slideCanvas();
  if (!slide) return false;
  const { canvas, g } = slide;
  await paintBackground(g, css);

  g.drawImage(await loadImage(diagram), area.x, area.y, area.w, area.h);

  g.textBaseline = "alphabetic";
  g.fillStyle = ink;
  g.font = `500 52px ${font}`;
  g.fillText(title, 72, 108, SLIDE.w - 144);
  g.fillStyle = muted;
  g.font = `400 26px ${font}`;
  const state = mode === "current" ? "Current state" : "Future state";
  const line =
    totals && mode === "future"
      ? `${state}  |  ${fmt(totals.future)} per run, down from ${fmt(totals.current)}  |  ${Math.round(totals.pct)}% of effort removed`
      : totals
        ? `${state}  |  ${fmt(totals.current)} of effort per run`
        : state;
  g.fillText(line, 72, 150, SLIDE.w - 144);

  // Logo, bottom left, same colour as on the stage.
  await drawLogo(g, ink);

  // Key, bottom right.
  const keys: [string, string | CanvasPattern][] =
    mode === "current"
      ? [["Time taken", ink]]
      : [
          ["Time that remains", ink],
          ["Time removed", css.getPropertyValue("--saved").trim() || "#048a24"],
          ["Time added", css.getPropertyValue("--added").trim() || "#9a4f00"],
        ];
  g.font = `400 22px ${font}`;
  // Time key on the bottom row, flow key (wide coloured bars) on the row above it.
  const drawKey = (items: [string, string | CanvasPattern][], baseline: number, bar: number) => {
    let kx = SLIDE.w - 72;
    for (const [label, colour] of [...items].reverse()) {
      kx -= g.measureText(label).width;
      g.fillStyle = muted;
      g.fillText(label, kx, baseline);
      kx -= 12 + 36;
      g.fillStyle = colour;
      g.fillRect(kx, baseline - 12 - bar / 2, 36, bar);
      kx -= 36;
    }
  };
  drawKey(keys, SLIDE.h - 72 - 6, 8);
  drawKey(
    flows.map((f) => [f.name, f.color] as [string, string]),
    SLIDE.h - 72 - 6 - 40,
    12,
  );

  savePng(canvas, `${slug(title)}-${mode}.png`);
  return true;
}
