/**
 * Página de controle para o celular: conecta na placa por Bluetooth e mostra
 * um botão para cada tecla que o programa rodando usa (comando "L" do boot.py).
 * Tocar num botão é o mesmo que apertar a tecla no computador.
 */

import { BleLink, bleSupported, requestBleDevice } from "./serial/ble";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $("status");
const btnConnect = $<HTMLButtonElement>("btn-connect");
const btnDisconnect = $<HTMLButtonElement>("btn-disconnect");
const controls = $("controls");
const pad = $("pad");
const keysEl = $("keys");
const noKeys = $("no-keys");
const monitor = $("monitor");
const readings = $("readings");

/** Os jogos só registram as teclas quando começam: pergunta de novo de tempos em tempos. */
const KEYS_EVERY_MS = 4000;
const MONITOR_EVERY_MS = 300;

const ARROWS: Record<string, [string, number]> = {
  // tecla -> [símbolo, posição na grade 3x2]
  up: ["▲", 1],
  left: ["◀", 3],
  down: ["▼", 4],
  right: ["▶", 5],
};
const LABELS: Record<string, string> = { space: "espaço", enter: "Enter" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let link: BleLink | null = null;
let keysShown = "";

function setStatus(text: string, kind: "" | "ok" | "error" = "") {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
}

function showConnected(on: boolean) {
  btnConnect.hidden = on;
  btnDisconnect.hidden = !on;
  showControls(on);
}

/** Botões e entradas só aparecem com a ligação de pé (somem enquanto ela tenta voltar). */
function showControls(on: boolean) {
  controls.hidden = !on;
  if (!on) {
    monitor.hidden = true;
    keysShown = "";
  }
}

function keyButton(name: string, text: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = text;
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    b.classList.add("on");
    navigator.vibrate?.(10);
    link?.key(name).catch(() => setStatus("A tecla não chegou à placa.", "error"));
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) {
    b.addEventListener(ev, () => b.classList.remove("on"));
  }
  return b;
}

function renderKeys(keys: string[]) {
  const arrows = keys.filter((k) => k in ARROWS);
  const others = keys.filter((k) => !(k in ARROWS));

  const cells: HTMLElement[] = Array.from({ length: 6 }, () => document.createElement("span"));
  for (const k of arrows) cells[ARROWS[k][1]] = keyButton(k, ARROWS[k][0]);
  pad.replaceChildren(...cells);
  pad.hidden = arrows.length === 0;

  keysEl.replaceChildren(
    ...others.map((k) => {
      const b = keyButton(k, LABELS[k] ?? k.toUpperCase());
      if (k === "space") b.classList.add("wide");
      return b;
    }),
  );
  keysEl.hidden = others.length === 0;
  noKeys.hidden = keys.length > 0;
}

async function refreshKeys(l: BleLink) {
  const text = await l.command("L", { waitMs: 3000 });
  if (link !== l || text === keysShown) return;
  keysShown = text;
  renderKeys(JSON.parse(text) as string[]);
}

function renderReadings(values: Record<string, number>) {
  const entries = Object.entries(values).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  readings.replaceChildren(
    ...entries.map(([k, v]) => {
      const card = document.createElement("div");
      card.className = "reading";
      const port = document.createElement("small");
      port.textContent = `porta ${k.slice(1)}`;
      const value = document.createElement("b");
      value.textContent = k[0] === "a" ? `${v}%` : v ? "ligada" : "desligada";
      card.append(port, value);
      return card;
    }),
  );
  monitor.hidden = entries.length === 0;
}

async function keysLoop(l: BleLink) {
  while (link === l) {
    try {
      await refreshKeys(l);
    } catch {
      /* ligação caindo ou placa ocupada: tenta na próxima */
    }
    await sleep(KEYS_EVERY_MS);
  }
}

async function monitorLoop(l: BleLink) {
  while (link === l) {
    await sleep(MONITOR_EVERY_MS);
    try {
      const text = await l.readMonitor();
      if (link === l) renderReadings(text ? JSON.parse(text) : {});
    } catch {
      /* idem */
    }
  }
}

async function connect() {
  const device = await requestBleDevice();
  const nome = device.name ?? "placa";
  const l = new BleLink(device);
  l.onReconnecting = () => {
    if (link !== l) return;
    showControls(false);
    setStatus(`${nome} desconectou. Tentando reconectar… (para desistir, toque em Desconectar)`, "error");
  };
  l.onReconnected = () => {
    if (link !== l) return;
    showControls(true);
    setStatus(`Conectado a ${nome}`, "ok");
    refreshKeys(l).catch(() => {}); // a placa pode ter voltado com outro programa
  };
  l.onLost = (busy) => {
    void l.close();
    if (link !== l) return;
    link = null;
    showConnected(false);
    setStatus(busy ? `${nome} foi conectada em outro aparelho.` : `${nome} sumiu. Está ligada e perto?`, "error");
  };
  // a placa às vezes derruba a ligação logo depois de aceitar: tenta de novo
  let tentativa = 1;
  l.onStep = (step) => setStatus(`${nome}: ${step} (tentativa ${tentativa} de 3)…`);
  for (; ; tentativa++) {
    try {
      await l.open();
      break;
    } catch (err) {
      if (tentativa >= 3) {
        await l.close();
        throw new Error(`não consegui conectar — parou em "${(err as Error).message}"`);
      }
      await sleep(700);
    }
  }
  l.onStep = null;
  link = l;
  showConnected(true);
  setStatus(`Conectado a ${nome}`, "ok");
  void keysLoop(l);
  void monitorLoop(l);
}

async function disconnect() {
  const l = link;
  link = null;
  showConnected(false);
  await l?.close();
  setStatus("Desconectado. A placa já pode ser usada pelo computador.");
}

if (!bleSupported) {
  $("unsupported").hidden = false;
  btnConnect.disabled = true;
  setStatus("Sem Bluetooth neste navegador.", "error");
}

btnConnect.addEventListener("click", async () => {
  btnConnect.disabled = true;
  try {
    await connect();
  } catch (err) {
    // fechou a lista sem escolher: não é erro
    if ((err as Error).name === "NotFoundError") setStatus("Ligue a placa e toque em Conectar.");
    else setStatus((err as Error).message, "error");
  } finally {
    btnConnect.disabled = false;
  }
});

btnDisconnect.addEventListener("click", () => void disconnect());

// fechar ou sair da página solta a placa: senão o celular pode segurar a ligação
// e o computador não acha a placa até desligar o Bluetooth do celular
window.addEventListener("pagehide", () => {
  const l = link;
  link = null;
  void l?.close();
});
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    showConnected(false);
    setStatus("Toque em Conectar para usar a placa de novo.");
  }
});
