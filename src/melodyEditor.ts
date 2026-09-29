/**
 * Editor de melodia: uma grade de 8 tempos com a escala pentatônica maior de Dó (Dó4 até Sol5).
 * Cada coluna toca uma nota (ou fica em silêncio). A melodia é guardada como texto:
 * "C4 R E4 G4 R R C5 R" (R = pausa), no mesmo formato das melodias prontas.
 */

export const MELODY_STEPS = 8;

/** Notas da grade, de cima (mais aguda) para baixo, com a cor de cada linha. */
const ROWS: { note: string; label: string; color: string; hz: number }[] = [
  { note: "G5", label: "Sol", color: "#e84393", hz: 783.99 },
  { note: "E5", label: "Mi", color: "#9b59b6", hz: 659.26 },
  { note: "D5", label: "Ré", color: "#5b6ee1", hz: 587.33 },
  { note: "C5", label: "Dó", color: "#2d9cdb", hz: 523.25 },
  { note: "A4", label: "Lá", color: "#1abc9c", hz: 440.0 },
  { note: "G4", label: "Sol", color: "#27ae60", hz: 392.0 },
  { note: "E4", label: "Mi", color: "#f2c94c", hz: 329.63 },
  { note: "D4", label: "Ré", color: "#f2994a", hz: 293.66 },
  { note: "C4", label: "Dó", color: "#eb5757", hz: 261.63 },
];

export function emptyMelody(): string {
  return Array(MELODY_STEPS).fill("R").join(" ");
}

/** Texto -> nota de cada coluna (null = pausa); notas fora da grade viram pausa. */
function parse(text: string): (string | null)[] {
  const toks = text.split(/\s+/).filter(Boolean);
  return Array.from({ length: MELODY_STEPS }, (_, i) =>
    ROWS.some((r) => r.note === toks[i]) ? toks[i] : null,
  );
}

const stringify = (steps: (string | null)[]) => steps.map((n) => n ?? "R").join(" ");

/** Miniatura da grade para mostrar no bloco. */
export function melodyPreviewUrl(text: string, width: number, height: number): string {
  const steps = parse(text);
  const gap = 1.5;
  const cw = (width - gap) / MELODY_STEPS;
  const ch = (height - gap) / ROWS.length;
  let cells = "";
  ROWS.forEach((row, r) => {
    for (let c = 0; c < MELODY_STEPS; c++) {
      const on = steps[c] === row.note;
      cells +=
        `<rect x="${(gap + c * cw).toFixed(2)}" y="${(gap + r * ch).toFixed(2)}" ` +
        `width="${(cw - gap).toFixed(2)}" height="${(ch - gap).toFixed(2)}" rx="1.5" ` +
        `fill="${on ? row.color : "#e2e2e2"}"/>`;
    }
  });
  return (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
        `<rect width="${width}" height="${height}" rx="4" fill="#fff"/>${cells}</svg>`,
    )
  );
}

// ---- som no navegador (para ouvir enquanto compõe) ----

let audio: AudioContext | null = null;
const tocando = new Set<OscillatorNode>(); // para o "Limpar" e o fechar calarem na hora

function beep(hz: number, start: number, dur: number) {
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "square"; // parecido com o buzzer
  osc.frequency.value = hz;
  gain.gain.setValueAtTime(0.08, start);
  gain.gain.setValueAtTime(0.08, start + dur * 0.9);
  gain.gain.linearRampToValueAtTime(0, start + dur);
  osc.connect(gain).connect(audio.destination);
  osc.onended = () => tocando.delete(osc);
  tocando.add(osc);
  osc.start(start);
  osc.stop(start + dur);
}

function audioNow(): number {
  audio ??= new AudioContext();
  void audio.resume();
  return audio.currentTime;
}

// ---- editor ----

/** Abre o editor; resolve com a nova melodia (texto) ou null se cancelado. */
export function openMelodyEditor(initial: string): Promise<string | null> {
  return new Promise((resolve) => {
    const steps = parse(initial);
    const beatSec = 0.5; // 120 batidas por minuto, o ritmo padrão da placa
    let playTimers: number[] = [];

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-box melody-box">
        <h2>Criar melodia</h2>
        <p class="melody-hint">Toque num quadrado para escolher a nota de cada tempo. Coluna vazia é silêncio.</p>
        <div class="melody-grid">
          ${ROWS.map(
            (row, r) =>
              `<span class="melody-note">${row.label}<small>${row.note.slice(-1)}</small></span>` +
              Array.from(
                { length: MELODY_STEPS },
                (_, c) =>
                  `<button class="melody-cell" data-r="${r}" data-c="${c}" style="--cor:${row.color}" ` +
                  `title="${row.label} ${row.note.slice(-1)} no tempo ${c + 1}"></button>`,
              ).join(""),
          ).join("")}
        </div>
        <div class="modal-actions">
          <button class="btn melody-clear">Limpar</button>
          <button class="btn melody-play">▶ Ouvir</button>
          <span class="modal-spacer"></span>
          <button class="btn melody-cancel">Cancelar</button>
          <button class="btn btn-primary melody-save">Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const cells = [...modal.querySelectorAll<HTMLButtonElement>(".melody-cell")];
    const repaint = () => {
      for (const cell of cells) {
        const r = Number(cell.dataset.r);
        const c = Number(cell.dataset.c);
        cell.classList.toggle("on", steps[c] === ROWS[r].note);
      }
    };
    repaint();

    const stopPlaying = () => {
      playTimers.forEach(clearTimeout);
      playTimers = [];
      tocando.forEach((osc) => osc.stop());
      tocando.clear();
      cells.forEach((cell) => cell.classList.remove("tocando"));
    };

    for (const cell of cells) {
      cell.addEventListener("click", () => {
        const row = ROWS[Number(cell.dataset.r)];
        const c = Number(cell.dataset.c);
        // uma nota por tempo: tocar na nota acesa apaga, em outra troca
        steps[c] = steps[c] === row.note ? null : row.note;
        if (steps[c]) beep(row.hz, audioNow(), 0.3);
        repaint();
      });
    }

    modal.querySelector(".melody-clear")!.addEventListener("click", () => {
      stopPlaying();
      steps.fill(null);
      repaint();
    });

    modal.querySelector(".melody-play")!.addEventListener("click", () => {
      stopPlaying();
      const t0 = audioNow() + 0.05;
      steps.forEach((note, c) => {
        const row = ROWS.find((r) => r.note === note);
        if (row) beep(row.hz, t0 + c * beatSec, beatSec);
        playTimers.push(
          window.setTimeout(() => {
            cells.forEach((cell) => cell.classList.toggle("tocando", Number(cell.dataset.c) === c));
          }, 50 + c * beatSec * 1000),
        );
      });
      playTimers.push(window.setTimeout(stopPlaying, 50 + MELODY_STEPS * beatSec * 1000));
    });

    const close = (result: string | null) => {
      stopPlaying();
      document.removeEventListener("keydown", onKey);
      modal.remove();
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(null);
    };
    document.addEventListener("keydown", onKey);
    modal.querySelector(".melody-cancel")!.addEventListener("click", () => close(null));
    modal.querySelector(".melody-save")!.addEventListener("click", () => close(stringify(steps)));
  });
}
