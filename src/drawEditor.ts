/**
 * Editor de desenho para o visor OLED (128x64, 1 bit por pixel).
 *
 * O desenho é guardado no formato MONO_VLSB do framebuf do MicroPython,
 * em base64 — o mesmo formato do buffer do SSD1306 — para a placa só copiar
 * os bytes para o visor.
 */

import { STAMPS, type Stamp } from "./stamps";

export const DRAW_W = 128;
export const DRAW_H = 64;
const SCALE = 4;

// ---- conversão pixels <-> MONO_VLSB base64 ----

export function emptyBitmapB64(): string {
  return pixelsToB64(new Uint8Array(DRAW_W * DRAW_H));
}

export function pixelsToB64(pixels: Uint8Array): string {
  const buf = new Uint8Array((DRAW_W * DRAW_H) / 8);
  for (let y = 0; y < DRAW_H; y++) {
    for (let x = 0; x < DRAW_W; x++) {
      if (pixels[y * DRAW_W + x]) buf[x + (y >> 3) * DRAW_W] |= 1 << (y & 7);
    }
  }
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function b64ToPixels(b64: string): Uint8Array {
  const pixels = new Uint8Array(DRAW_W * DRAW_H);
  let bin = "";
  try { bin = atob(b64); } catch { return pixels; }
  for (let y = 0; y < DRAW_H; y++) {
    for (let x = 0; x < DRAW_W; x++) {
      const byte = bin.charCodeAt(x + (y >> 3) * DRAW_W) || 0;
      pixels[y * DRAW_W + x] = (byte >> (y & 7)) & 1;
    }
  }
  return pixels;
}

/** Miniatura do desenho como data URL (para o campo de imagem do bloco). */
export function bitmapToDataUrl(b64: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = DRAW_W;
  canvas.height = DRAW_H;
  paintPixels(canvas, b64ToPixels(b64));
  return canvas.toDataURL();
}

function paintPixels(canvas: HTMLCanvasElement, pixels: Uint8Array) {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(DRAW_W, DRAW_H);
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i] ? 255 : 0;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// ---- editor ----

/** Abre o editor; resolve com o novo desenho (base64) ou null se cancelado. */
export function openDrawEditor(initialB64: string): Promise<string | null> {
  return new Promise((resolve) => {
    const pixels = b64ToPixels(initialB64);
    type Tool = "brush" | "eraser" | "line" | "circle" | "circleFill" | "rect" | "rectFill" | "stamp";
    let tool: Tool = "brush";
    let stamp: Stamp = STAMPS[0];
    let stampScale = 1;
    let brush = 2;
    let drawing = false;
    let last: [number, number] | null = null;
    let start: [number, number] | null = null; // início do arrasto (formas)
    let base: Uint8Array | null = null; // pixels antes da forma, para o preview
    let hover: [number, number] | null = null; // posição do mouse, para o cursor

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-box draw-box">
        <h2>Desenhar no visor</h2>
        <div class="draw-tools">
          <button class="btn tool active" data-tool="brush" title="Pincel">✎ Pincel</button>
          <button class="btn tool" data-tool="eraser" title="Borracha">◻ Borracha</button>
          <button class="btn tool" data-tool="line" title="Linha">╱ Linha</button>
          <button class="btn tool" data-tool="circle" title="Círculo (só o aro)">○ Círculo</button>
          <button class="btn tool" data-tool="circleFill" title="Círculo preenchido">● Círculo</button>
          <button class="btn tool" data-tool="rect" title="Retângulo (só a borda)">▭ Retângulo</button>
          <button class="btn tool" data-tool="rectFill" title="Retângulo preenchido">▬ Retângulo</button>
          <label class="field">Espessura <input type="range" min="1" max="10" value="2" class="brush-size"> <span class="brush-val">2</span></label>
          <button class="btn draw-clear">Limpar</button>
        </div>
        <div class="draw-tools draw-stamps">
          <span class="field">Emojis:</span>
          ${STAMPS.map((st) => `<button class="btn tool stamp-btn" data-tool="stamp" data-stamp="${st.id}" title="Carimbar ${st.label}">${st.label}</button>`).join("")}
          <label class="field">Tamanho
            <select class="stamp-scale"><option value="1">1×</option><option value="2">2×</option><option value="3">3×</option></select>
          </label>
        </div>
        <div class="draw-frame"><canvas class="draw-canvas" width="${DRAW_W}" height="${DRAW_H}"></canvas></div>
        <div class="modal-actions">
          <button class="btn draw-cancel">Cancelar</button>
          <button class="btn btn-primary draw-save">Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const canvas = modal.querySelector<HTMLCanvasElement>(".draw-canvas")!;
    canvas.style.width = `${DRAW_W * SCALE}px`;
    canvas.style.height = `${DRAW_H * SCALE}px`;
    const repaint = () => {
      paintPixels(canvas, pixels);
      drawCursor();
    };

    const sizeInput = modal.querySelector<HTMLInputElement>(".brush-size")!;
    const sizeVal = modal.querySelector(".brush-val")!;
    sizeInput.addEventListener("input", () => {
      brush = Number(sizeInput.value);
      sizeVal.textContent = String(brush);
    });

    modal.querySelectorAll<HTMLButtonElement>(".tool").forEach((b) => {
      b.addEventListener("click", () => {
        tool = b.dataset.tool as Tool;
        if (b.dataset.stamp) stamp = STAMPS.find((st) => st.id === b.dataset.stamp) ?? STAMPS[0];
        modal.querySelectorAll(".tool").forEach((t) => t.classList.toggle("active", t === b));
      });
    });
    const scaleSelect = modal.querySelector<HTMLSelectElement>(".stamp-scale")!;
    scaleSelect.addEventListener("change", () => {
      stampScale = Number(scaleSelect.value);
      repaint();
    });

    modal.querySelector(".draw-clear")!.addEventListener("click", () => {
      pixels.fill(0);
      repaint();
    });

    const toPixel = (e: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [
        Math.floor(((e.clientX - r.left) / r.width) * DRAW_W),
        Math.floor(((e.clientY - r.top) / r.height) * DRAW_H),
      ];
    };

    // pixels cobertos pelo pincel (círculo do tamanho da espessura) em (cx, cy)
    const footprint = (cx: number, cy: number): [number, number][] => {
      const r = brush / 2;
      const out: [number, number][] = [];
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          if (x < 0 || y < 0 || x >= DRAW_W || y >= DRAW_H) continue;
          const dx = x - cx, dy = y - cy;
          if (brush <= 1 ? x === cx && y === cy : dx * dx + dy * dy <= r * r) out.push([x, y]);
        }
      }
      return out;
    };

    // pinta um "ponto" do tamanho do pincel em (cx, cy)
    const dot = (cx: number, cy: number) => {
      const v = tool === "eraser" ? 0 : 1;
      for (const [x, y] of footprint(cx, cy)) pixels[y * DRAW_W + x] = v;
    };

    // pixels acesos do emoji, centrado em (cx, cy), no tamanho escolhido
    const stampPixels = (cx: number, cy: number): [number, number][] => {
      const out: [number, number][] = [];
      const n = stamp.size * stampScale;
      const x0 = cx - Math.floor(n / 2), y0 = cy - Math.floor(n / 2);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (!stamp.pixels[Math.floor(y / stampScale) * stamp.size + Math.floor(x / stampScale)]) continue;
          const px = x0 + x, py = y0 + y;
          if (px >= 0 && py >= 0 && px < DRAW_W && py < DRAW_H) out.push([px, py]);
        }
      }
      return out;
    };

    // cursor: pincel/linhas mostram a área que vai pintar; borracha mostra o contorno
    // em branco e escurece o que vai apagar
    const drawCursor = () => {
      if (!hover) return;
      const ctx = canvas.getContext("2d")!;
      const area = footprint(hover[0], hover[1]);
      if (tool === "stamp") {
        ctx.fillStyle = "rgba(47, 128, 237, 0.85)";
        for (const [x, y] of stampPixels(hover[0], hover[1])) ctx.fillRect(x, y, 1, 1);
      } else if (tool === "eraser") {
        const dentro = new Set(area.map(([x, y]) => y * DRAW_W + x));
        for (const [x, y] of area) {
          const borda = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(
            ([nx, ny]) => !dentro.has(ny * DRAW_W + nx),
          );
          ctx.fillStyle = borda ? "#fff" : pixels[y * DRAW_W + x] ? "#666" : "#222";
          ctx.fillRect(x, y, 1, 1);
        }
      } else if (tool === "rectFill" || tool === "circleFill") {
        ctx.fillStyle = "rgba(47, 128, 237, 0.9)";
        ctx.fillRect(hover[0], hover[1], 1, 1);
      } else {
        ctx.fillStyle = "rgba(47, 128, 237, 0.85)";
        for (const [x, y] of area) ctx.fillRect(x, y, 1, 1);
      }
    };
    repaint();

    // liga dois pontos para o traço não ficar pontilhado em movimentos rápidos
    const stroke = (from: [number, number] | null, to: [number, number]) => {
      if (!from) { dot(to[0], to[1]); return; }
      const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]), 1);
      for (let i = 0; i <= steps; i++) {
        dot(Math.round(from[0] + ((to[0] - from[0]) * i) / steps), Math.round(from[1] + ((to[1] - from[1]) * i) / steps));
      }
    };

    const fillRect = (a: [number, number], b: [number, number]) => {
      const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
      const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
      for (let y = Math.max(0, y0); y <= Math.min(DRAW_H - 1, y1); y++) {
        for (let x = Math.max(0, x0); x <= Math.min(DRAW_W - 1, x1); x++) pixels[y * DRAW_W + x] = 1;
      }
    };

    const outlineRect = (a: [number, number], b: [number, number]) => {
      const c1: [number, number] = [b[0], a[1]], c2: [number, number] = [a[0], b[1]];
      stroke(a, c1); stroke(c1, b); stroke(b, c2); stroke(c2, a);
    };

    const radius = (c: [number, number], p: [number, number]) => Math.round(Math.hypot(p[0] - c[0], p[1] - c[1]));

    const fillCircle = (c: [number, number], p: [number, number]) => {
      const r = radius(c, p);
      for (let y = Math.max(0, c[1] - r); y <= Math.min(DRAW_H - 1, c[1] + r); y++) {
        for (let x = Math.max(0, c[0] - r); x <= Math.min(DRAW_W - 1, c[0] + r); x++) {
          if ((x - c[0]) ** 2 + (y - c[1]) ** 2 <= r * r) pixels[y * DRAW_W + x] = 1;
        }
      }
    };

    const outlineCircle = (c: [number, number], p: [number, number]) => {
      const r = radius(c, p);
      const passos = Math.max(24, Math.ceil(2 * Math.PI * r));
      let prev: [number, number] | null = null;
      for (let i = 0; i <= passos; i++) {
        const a = (i / passos) * 2 * Math.PI;
        const q: [number, number] = [Math.round(c[0] + r * Math.cos(a)), Math.round(c[1] + r * Math.sin(a))];
        stroke(prev, q);
        prev = q;
      }
    };

    // desenha a forma da ferramenta atual entre o início do arrasto e o ponto p
    const drawShape = (p: [number, number]) => {
      if (!start) return;
      switch (tool) {
        case "line": stroke(start, p); break;
        case "rect": outlineRect(start, p); break;
        case "rectFill": fillRect(start, p); break;
        case "circle": outlineCircle(start, p); break;
        case "circleFill": fillCircle(start, p); break;
      }
    };

    const isShapeTool = () => tool !== "brush" && tool !== "eraser" && tool !== "stamp";

    canvas.addEventListener("pointerdown", (e) => {
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      const p = toPixel(e);
      if (tool === "stamp") {
        for (const [x, y] of stampPixels(p[0], p[1])) pixels[y * DRAW_W + x] = 1;
        drawing = false;
      } else if (isShapeTool()) {
        start = p;
        base = pixels.slice(); // guarda o fundo para o preview
        drawShape(p);
      } else {
        last = p;
        stroke(null, p);
      }
      repaint();
    });
    canvas.addEventListener("pointermove", (e) => {
      const p = toPixel(e);
      hover = p;
      if (!drawing) {
        repaint();
        return;
      }
      if (isShapeTool()) {
        if (base) pixels.set(base); // volta ao fundo e redesenha a forma atual
        drawShape(p);
      } else {
        stroke(last, p);
        last = p;
      }
      repaint();
    });
    const stop = () => { drawing = false; last = null; start = null; base = null; repaint(); };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
    canvas.addEventListener("pointerleave", () => { hover = null; repaint(); });
    sizeInput.addEventListener("input", repaint);
    modal.querySelectorAll<HTMLButtonElement>(".tool").forEach((b) => b.addEventListener("click", repaint));

    const close = (result: string | null) => {
      document.removeEventListener("keydown", onKey);
      modal.remove();
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(null); };
    document.addEventListener("keydown", onKey);
    modal.querySelector(".draw-cancel")!.addEventListener("click", () => close(null));
    modal.querySelector(".draw-save")!.addEventListener("click", () => close(pixelsToB64(pixels)));
  });
}
