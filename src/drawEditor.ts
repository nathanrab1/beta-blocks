/**
 * Editor de desenho para o visor OLED (128x64, 1 bit por pixel).
 *
 * O desenho é guardado no formato MONO_VLSB do framebuf do MicroPython,
 * em base64 — o mesmo formato do buffer do SSD1306 — para a placa só copiar
 * os bytes para o visor.
 */

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
    let brush = 2;
    let eraser = false;
    let drawing = false;
    let last: [number, number] | null = null;

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-box draw-box">
        <h2>Desenhar no visor</h2>
        <div class="draw-tools">
          <button class="btn tool active" data-tool="brush">✎ Pincel</button>
          <button class="btn tool" data-tool="eraser">◻ Borracha</button>
          <label class="field">Tamanho <input type="range" min="1" max="10" value="2" class="brush-size"> <span class="brush-val">2</span></label>
          <button class="btn draw-clear">Limpar</button>
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
    const repaint = () => paintPixels(canvas, pixels);
    repaint();

    const sizeInput = modal.querySelector<HTMLInputElement>(".brush-size")!;
    const sizeVal = modal.querySelector(".brush-val")!;
    sizeInput.addEventListener("input", () => {
      brush = Number(sizeInput.value);
      sizeVal.textContent = String(brush);
    });

    modal.querySelectorAll<HTMLButtonElement>(".tool").forEach((b) => {
      b.addEventListener("click", () => {
        eraser = b.dataset.tool === "eraser";
        modal.querySelectorAll(".tool").forEach((t) => t.classList.toggle("active", t === b));
      });
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

    // pinta um "ponto" do tamanho do pincel (círculo) em (cx, cy)
    const dot = (cx: number, cy: number) => {
      const r = brush / 2;
      const v = eraser ? 0 : 1;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          if (x < 0 || y < 0 || x >= DRAW_W || y >= DRAW_H) continue;
          const dx = x + 0.5 - (cx + 0.5), dy = y + 0.5 - (cy + 0.5);
          if (brush <= 1 ? x === cx && y === cy : dx * dx + dy * dy <= r * r) pixels[y * DRAW_W + x] = v;
        }
      }
    };

    // liga dois pontos para o traço não ficar pontilhado em movimentos rápidos
    const stroke = (from: [number, number] | null, to: [number, number]) => {
      if (!from) { dot(to[0], to[1]); return; }
      const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]), 1);
      for (let i = 0; i <= steps; i++) {
        dot(Math.round(from[0] + ((to[0] - from[0]) * i) / steps), Math.round(from[1] + ((to[1] - from[1]) * i) / steps));
      }
    };

    canvas.addEventListener("pointerdown", (e) => {
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      last = toPixel(e);
      stroke(null, last);
      repaint();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      const p = toPixel(e);
      stroke(last, p);
      last = p;
      repaint();
    });
    const stop = () => { drawing = false; last = null; };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);

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
