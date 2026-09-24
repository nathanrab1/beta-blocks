import type * as Blockly from "blockly";

const SVG_NS = "http://www.w3.org/2000/svg";
// o CSS do Blockly não vai junto quando o SVG vira imagem: estes estilos são copiados
const STYLE_PROPS = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "opacity",
  "font-family", "font-size", "font-weight", "display", "visibility",
];

/**
 * Miniatura (JPEG em data URL) dos blocos, para a lista de projetos. Projetos
 * grandes não encolhem até ficar ilegíveis: mostra o canto de cima à esquerda.
 */
export async function workspaceThumbnail(
  ws: Blockly.WorkspaceSvg,
  width = 320,
  height = 200,
): Promise<string | null> {
  try {
    const canvas = ws.getCanvas();
    const box = canvas.getBBox();
    if (!box.width || !box.height) return null;

    const clone = canvas.cloneNode(true) as SVGGElement;
    const src = [canvas, ...canvas.querySelectorAll<SVGElement>("*")];
    const dst = [clone, ...clone.querySelectorAll<SVGElement>("*")];
    src.forEach((el, i) => {
      const cs = getComputedStyle(el);
      for (const p of STYLE_PROPS) dst[i].style.setProperty(p, cs.getPropertyValue(p));
    });

    const pad = 12;
    const fit = Math.min((width - 2 * pad) / box.width, (height - 2 * pad) / box.height);
    const scale = Math.min(0.8, Math.max(0.35, fit));
    const tx = Math.max(pad, (width - box.width * scale) / 2) - box.x * scale;
    const ty = Math.max(pad, (height - box.height * scale) / 2) - box.y * scale;
    clone.setAttribute("transform", `translate(${tx},${ty}) scale(${scale})`);

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.appendChild(clone);

    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    await img.decode();

    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0);
    return out.toDataURL("image/jpeg", 0.85);
  } catch {
    return null; // sem miniatura o projeto salva do mesmo jeito
  }
}
