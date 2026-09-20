import * as Blockly from "blockly";
import { pythonGenerator } from "blockly/python";
import * as ptBr from "blockly/msg/pt-br";
import {
  defineBlocks,
  preamble,
  toolbox,
  starterWorkspace,
  collectInputPins,
  monitorCode,
  MONITOR_MARK,
  usesOled,
  oledCode,
  type InputPins,
} from "./blocks/betablocks";
import ssd1306Source from "./lib/ssd1306.py?raw";
import { Board, ReplError } from "./serial/board";
import { flashMicroPython, loadFirmware } from "./serial/flasher";

const STORAGE_KEY = "betablocks.workspace";
const PIN_KEY = "betablocks.pin";

// ---------- elementos ----------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const btnConnect = $<HTMLButtonElement>("btn-connect");
const btnUpload = $<HTMLButtonElement>("btn-upload");
const btnStop = $<HTMLButtonElement>("btn-stop");
const btnFlash = $<HTMLButtonElement>("btn-flash");
const pinSelect = $<HTMLSelectElement>("pin-select");
const pinCustom = $<HTMLInputElement>("pin-custom");
const codeView = $<HTMLPreElement>("code-view");
const consoleView = $<HTMLPreElement>("console-view");
const statusText = $<HTMLSpanElement>("status-text");
const statusProgress = $<HTMLSpanElement>("status-progress");
const statusBar = document.querySelector(".statusbar") as HTMLElement;

// ---------- status / console ----------
function setStatus(text: string, kind: "" | "ok" | "error" = "") {
  statusText.textContent = text;
  statusBar.className = `statusbar ${kind}`;
}
function setProgress(text: string) {
  statusProgress.textContent = text;
}
function consoleWrite(text: string) {
  consoleView.textContent += text;
  if (consoleView.textContent!.length > 20000) {
    consoleView.textContent = consoleView.textContent!.slice(-15000);
  }
  consoleView.scrollTop = consoleView.scrollHeight;
}
const PANELS_VISIBLE = false; // Código Python / Console ocultos na tela
function showTab(name: "code" | "console") {
  if (!PANELS_VISIBLE) return;
  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
  });
  codeView.hidden = name !== "code";
  consoleView.hidden = name !== "console";
}
document.querySelectorAll<HTMLButtonElement>(".tab").forEach((t) => {
  t.addEventListener("click", () => showTab(t.dataset.tab as "code" | "console"));
});

// ---------- pino do LED ----------
function currentPin(): number {
  const v = pinSelect.value === "custom" ? pinCustom.value : pinSelect.value;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 21;
}
function restorePin() {
  const saved = localStorage.getItem(PIN_KEY);
  if (!saved) return;
  if ([...pinSelect.options].some((o) => o.value === saved)) {
    pinSelect.value = saved;
  } else {
    pinSelect.value = "custom";
    pinCustom.value = saved;
  }
  pinCustom.hidden = pinSelect.value !== "custom";
}
function onPinChange() {
  pinCustom.hidden = pinSelect.value !== "custom";
  localStorage.setItem(PIN_KEY, String(currentPin()));
  updateCode();
}
pinSelect.addEventListener("change", onPinChange);
pinCustom.addEventListener("input", onPinChange);

// ---------- Blockly ----------
Blockly.setLocale(ptBr as unknown as Record<string, string>);
defineBlocks();

const workspace = Blockly.inject("blockly-div", {
  toolbox,
  renderer: "zelos",
  grid: { spacing: 24, length: 3, colour: "#e3e6eb", snap: true },
  zoom: { controls: true, wheel: true, startScale: 0.9 },
  trashcan: true,
  move: { scrollbars: true, drag: true, wheel: false },
});

function generateCode(): string {
  return (
    preamble(currentPin()) +
    (usesOled(workspace) ? oledCode() : "") +
    monitorCode(collectInputPins(workspace)) +
    pythonGenerator.workspaceToCode(workspace)
  );
}

function updateCode() {
  codeView.textContent = generateCode();
}

function saveWorkspace() {
  const state = Blockly.serialization.workspaces.save(workspace);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadWorkspace() {
  const saved = localStorage.getItem(STORAGE_KEY);
  let state: object = starterWorkspace;
  if (saved) {
    try { state = JSON.parse(saved); } catch { /* usa o inicial */ }
  }
  Blockly.serialization.workspaces.load(state, workspace);
}

workspace.addChangeListener((e) => {
  if (e.isUiEvent) return;
  updateCode();
  saveWorkspace();
  onInputPinsChanged();
});

restorePin();
loadWorkspace();
updateCode();

// ---------- entradas ao vivo ----------
const monitorPanel = $("monitor-panel");
const monitorCards = $("monitor-cards");
let monitoredPins: InputPins = { analog: [], digital: [] };
let monitorMode: "program" | "repl" | null = null; // de onde vêm os valores
let lastMonitorAt = 0;

function pinsKey(p: InputPins) {
  return `a:${p.analog.join(",")}|d:${p.digital.join(",")}`;
}

/** Cria (se preciso) o cartão de uma porta que está mandando valores. */
function ensureCard(key: string): HTMLElement {
  let card = monitorCards.querySelector<HTMLElement>(`[data-key="${key}"]`);
  if (card) return card;
  card = document.createElement("div");
  card.className = "mcard";
  card.dataset.key = key;
  const n = key.slice(1);
  card.innerHTML = key.startsWith("a")
    ? `<span class="mlabel">Porta ${n}</span><span class="mbar"><i></i></span><span class="mvalue">—</span>`
    : `<span class="mlabel">Porta ${n}</span><span class="mdot"></span><span class="mvalue">—</span>`;
  // mantém os cartões em ordem: analógicas primeiro, depois por número
  const cards = [...monitorCards.querySelectorAll<HTMLElement>(".mcard"), card].sort((a, b) => {
    const ka = a.dataset.key!, kb = b.dataset.key!;
    return ka[0] !== kb[0] ? (ka[0] === "a" ? -1 : 1) : Number(ka.slice(1)) - Number(kb.slice(1));
  });
  monitorCards.replaceChildren(...cards);
  return card;
}

function updateMonitorPanelVisibility() {
  monitorPanel.hidden = monitorCards.childElementCount === 0;
  (document.querySelector(".side-panel") as HTMLElement).hidden = monitorPanel.hidden && !PANELS_VISIBLE;
}

function clearMonitorCards() {
  monitorCards.replaceChildren();
  updateMonitorPanelVisibility();
}

let pendingValues: Record<string, number> | null = null;
let monitorSamples: number[] = []; // timestamps das últimas leituras (taxa)
const monitorRate = $("monitor-rate");

function queueMonitorValues(values: Record<string, number>) {
  const now = performance.now();
  monitorSamples.push(now);
  monitorSamples = monitorSamples.filter((t) => now - t < 1000);
  const wasIdle = pendingValues === null;
  pendingValues = values; // leituras acumuladas: só a mais recente interessa
  if (wasIdle) {
    requestAnimationFrame(() => {
      const v = pendingValues;
      pendingValues = null;
      if (v) applyMonitorValues(v);
      monitorRate.textContent = `${monitorSamples.length} leituras/s`;
    });
  }
}

function applyMonitorValues(values: Record<string, number>) {
  lastMonitorAt = Date.now();
  // só as portas presentes na leitura atual ficam na tela
  const keys = new Set(Object.keys(values));
  monitorCards.querySelectorAll<HTMLElement>(".mcard").forEach((c) => {
    if (!keys.has(c.dataset.key!)) c.remove();
  });
  for (const [key, v] of Object.entries(values)) {
    const card = ensureCard(key);
    if (key.startsWith("a")) {
      (card.querySelector(".mbar > i") as HTMLElement).style.width = `${v}%`;
      card.querySelector(".mvalue")!.textContent = `${v}%`;
    } else {
      card.classList.toggle("on", v === 1);
      card.querySelector(".mvalue")!.textContent = v === 1 ? "ligada" : "desligada";
    }
  }
  updateMonitorPanelVisibility();
}

// se a placa parar de mandar valores, o painel some
setInterval(() => {
  if (lastMonitorAt && Date.now() - lastMonitorAt > 2000) {
    lastMonitorAt = 0;
    clearMonitorCards();
  }
}, 500);

let serialPending = "";
/** Separa as linhas do monitor (começam com MONITOR_MARK) do texto normal do console. */
function handleSerialData(text: string) {
  serialPending += text;
  for (;;) {
    const mark = serialPending.indexOf(MONITOR_MARK);
    if (mark < 0) {
      consoleWrite(serialPending);
      serialPending = "";
      return;
    }
    if (mark > 0) consoleWrite(serialPending.slice(0, mark));
    const nl = serialPending.indexOf("\n", mark);
    if (nl < 0) {
      serialPending = serialPending.slice(mark); // linha do monitor incompleta: espera o resto
      return;
    }
    const line = serialPending.slice(mark + 1, nl).trim();
    serialPending = serialPending.slice(nl + 1);
    try {
      queueMonitorValues(JSON.parse(line));
    } catch {
      /* linha corrompida: ignora */
    }
  }
}

/** Liga o monitor pela REPL (usado quando nenhum programa está rodando). */
async function startReplMonitor() {
  const code = preamble(currentPin()) + monitorCode(monitoredPins);
  await board.enterRawRepl();
  await board.execRaw(code);
  await board.exitRawRepl();
  monitorMode = "repl";
}

let pinsChangeTimer: number | undefined;
function onInputPinsChanged() {
  const pins = collectInputPins(workspace);
  if (pinsKey(pins) === pinsKey(monitoredPins)) return;
  monitoredPins = pins;
  // programa parado e placa conectada: atualiza o monitor com as novas portas
  if (board.connected && monitorMode === "repl") {
    clearTimeout(pinsChangeTimer);
    pinsChangeTimer = window.setTimeout(() => {
      if (!busy && board.connected && monitorMode === "repl") {
        void run("Monitor", startReplMonitor);
      }
    }, 600);
  }
}

monitoredPins = collectInputPins(workspace);
updateMonitorPanelVisibility();

// ---------- placa ----------
const board = new Board();
board.onData = handleSerialData;
board.onDisconnect = () => {
  monitorMode = null;
  clearMonitorCards();
  setStatus("Placa desconectada", "error");
  refreshButtons();
};

const serialSupported = "serial" in navigator;
if (!serialSupported) {
  $("unsupported").hidden = false;
}

function refreshButtons() {
  const on = board.connected;
  btnConnect.textContent = on ? "Desconectar" : "Conectar";
  btnConnect.disabled = !serialSupported;
  btnUpload.disabled = !on;
  btnStop.disabled = !on;
  btnFlash.disabled = !serialSupported;
}

let busy = false;
async function run(label: string, fn: () => Promise<void>) {
  if (busy) return;
  busy = true;
  document.body.style.cursor = "progress";
  try {
    await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`${label}: ${msg}`, "error");
    consoleWrite(`\n[erro] ${msg}\n`);
    showTab("console");
  } finally {
    busy = false;
    document.body.style.cursor = "";
    setProgress("");
    refreshButtons();
  }
}

async function connect() {
  const port = await navigator.serial.requestPort();
  await board.connect(port);
  refreshButtons();
  setStatus("Verificando MicroPython…");
  const ok = await board.ping();
  if (ok) {
    await board.write("\x04"); // retoma o programa gravado
    monitorMode = "program";
    setStatus("Conectado — MicroPython pronto", "ok");
  } else {
    setStatus("Conectado, mas a placa não tem MicroPython — clique em \"Gravar MicroPython\" (só na primeira vez).", "error");
  }
}

async function disconnect() {
  await board.disconnect();
  monitorMode = null;
  clearMonitorCards();
  setStatus("Desconectado");
}

btnConnect.addEventListener("click", () =>
  run("Conexão", () => (board.connected ? disconnect() : connect())),
);

btnUpload.addEventListener("click", () =>
  run("Envio", async () => {
    const code = generateCode();
    setStatus("Enviando programa…");
    showTab("console");
    consoleWrite("\n[enviando programa...]\n");
    try {
      // bibliotecas que o programa precisa (o MicroPython não traz o driver do OLED)
      const libs: Record<string, string> = usesOled(workspace) ? { "ssd1306.py": ssd1306Source } : {};
      await board.uploadMain(code, libs);
    } catch (err) {
      if (err instanceof ReplError && err.message.startsWith("Sem resposta")) {
        throw new Error(`${err.message}\nA placa tem MicroPython? Se não, use "Gravar MicroPython". Aperte RESET na placa e veja se aparece "MicroPython v..." no console.`);
      }
      throw err;
    }
    monitorMode = "program";
    setStatus("Programa enviado e rodando!", "ok");
  }),
);

btnStop.addEventListener("click", () =>
  run("Parar", async () => {
    await board.stop();
    setStatus("Programa interrompido", "ok");
    if (monitoredPins.analog.length + monitoredPins.digital.length > 0) {
      await startReplMonitor();
      setStatus("Programa interrompido — monitor de entradas ligado", "ok");
    }
  }),
);

// ---------- gravação do MicroPython ----------
// Em duas etapas porque requestPort() só funciona direto num clique do usuário:
// 1) "Gravar MicroPython": reinicia a placa em modo de gravação e mostra instruções
// 2) "Escolher porta e gravar": abre o seletor de porta e grava
const flashModal = $("flash-modal");
const flashInstructions = $("flash-instructions");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

btnFlash.addEventListener("click", () =>
  run("Gravação", async () => {
    showTab("console");
    consoleView.textContent = "";

    let viaBootloaderCmd = false;
    if (board.connected) {
      const port = board.port!;
      setStatus("Reiniciando a placa em modo de gravação…");
      try {
        await board.enterBootloader();
        viaBootloaderCmd = true;
      } catch {
        /* sem MicroPython (firmware Arduino ou placa zerada) */
      }
      await board.disconnect();
      if (!viaBootloaderCmd) {
        // "Toque de 1200 bps": firmware Arduino com USB CDC reinicia em modo de gravação
        try {
          await port.open({ baudRate: 1200 });
          await sleep(200);
          await port.close();
        } catch {
          /* ignora */
        }
      }
      await sleep(1500);
    }

    flashInstructions.textContent = viaBootloaderCmd
      ? "A placa foi reiniciada em modo de gravação.\n\n" +
        "Clique em \"Escolher porta e gravar\" e selecione a porta \"ESP32-S3\" (ou usbmodem) na lista."
      : "Tentei reiniciar a placa em modo de gravação automaticamente.\n\n" +
        "Se ela NÃO aparecer na lista como \"ESP32-S3\" ou \"usbmodem\", faça manualmente:\n" +
        "1. Segure o botão BOOT\n" +
        "2. Aperte e solte RESET (ou desconecte e reconecte o USB)\n" +
        "3. Solte o BOOT\n\n" +
        "Depois clique em \"Escolher porta e gravar\".";
    flashModal.hidden = false;
    setStatus("Aguardando a escolha da porta…");
  }),
);

$("btn-flash-cancel").addEventListener("click", () => {
  flashModal.hidden = true;
  setStatus("Gravação cancelada");
});

$("btn-flash-go").addEventListener("click", () => {
  // requestPort() tem que ser a primeira coisa, antes de qualquer await
  const portPromise = navigator.serial.requestPort();
  flashModal.hidden = true;
  void run("Gravação", async () => {
    const port = await portPromise;
    setStatus("Carregando firmware…");
    const firmware = await loadFirmware();

    setStatus("Gravando MicroPython… não desconecte a placa");
    const chip = await flashMicroPython(port, firmware, {
      log: (l) => consoleWrite(l.endsWith("\n") ? l : l + "\n"),
      progress: (w, t) => setProgress(`${Math.round((w / t) * 100)}%`),
    });
    consoleWrite(`\nMicroPython gravado no ${chip}.\n`);
    setStatus("MicroPython gravado! Clique em \"Conectar\" e escolha a porta novamente.", "ok");
  });
});

refreshButtons();
