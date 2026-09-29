/**
 * Botões do controle (setas ▲▼◀▶ e as outras teclas), usados na página controle.html e na tela
 * de controle dentro do app. Tocar num botão é o mesmo que apertar a tecla no computador.
 */

const ARROWS: Record<string, [string, number]> = {
  // tecla -> [símbolo, posição na grade 3x2]
  up: ["▲", 1],
  left: ["◀", 3],
  down: ["▼", 4],
  right: ["▶", 5],
};
const LABELS: Record<string, string> = { space: "espaço", enter: "Enter" };

export interface GamepadEls {
  pad: HTMLElement;
  keys: HTMLElement;
  noKeys: HTMLElement;
}

/**
 * Monta os botões. `hold`: teclas que o jogo quer saber quando são soltas (manda "-left" ao soltar).
 * `send` recebe o nome da tecla; se falhar, chama `onError`.
 */
export function renderGamepad(
  els: GamepadEls,
  keys: string[],
  hold: Set<string>,
  send: (name: string) => Promise<void>,
  onError: () => void,
) {
  const button = (name: string, text: string) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      b.classList.add("on");
      navigator.vibrate?.(10);
      send(name).catch(onError);
    });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) {
      b.addEventListener(ev, () => {
        if (!b.classList.contains("on")) return;
        b.classList.remove("on");
        // segurando, o jogo anda até saber que soltou
        if (hold.has(name)) send(`-${name}`).catch(() => {});
      });
    }
    return b;
  };

  const arrows = keys.filter((k) => k in ARROWS);
  const others = keys.filter((k) => !(k in ARROWS));

  const cells: HTMLElement[] = Array.from({ length: 6 }, () => document.createElement("span"));
  for (const k of arrows) cells[ARROWS[k][1]] = button(k, ARROWS[k][0]);
  els.pad.replaceChildren(...cells);
  els.pad.hidden = arrows.length === 0;

  els.keys.replaceChildren(
    ...others.map((k) => {
      const b = button(k, LABELS[k] ?? k.toUpperCase());
      if (k === "space") b.classList.add("wide");
      return b;
    }),
  );
  els.keys.hidden = others.length === 0;
  els.noKeys.hidden = keys.length > 0;
}
