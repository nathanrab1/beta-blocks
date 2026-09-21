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
  programCode,
  resetBoardCode,
  KEY_OPTIONS,
  KEY_MARK,
  MONITOR_MARK,
  DISPLAY_MARK,
  WIFI_MARK,
  wifiEventNames,
  keysOfType,
  gameKeys,
  usesOled,
  oledCode,
  type InputPins,
} from "./blocks/betablocks";
import ssd1306Source from "./lib/ssd1306.py?raw";
import bootSource from "./lib/boot.py?raw";
import { Board, ReplError } from "./serial/board";
import { flashMicroPython, loadFirmware } from "./serial/flasher";

const STORAGE_KEY = "betablocks.workspace";

// ---------- elementos ----------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const btnConnect = $<HTMLButtonElement>("btn-connect");
const btnUpload = $<HTMLButtonElement>("btn-upload");
const btnUploadWifi = $<HTMLButtonElement>("btn-upload-wifi");
const btnStop = $<HTMLButtonElement>("btn-stop");
const btnFlash = $<HTMLButtonElement>("btn-flash");
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
const LED_PIN = 21; // WS2812 da ESP32-S3-Zero
function currentPin(): number {
  return LED_PIN;
}

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

// Sem navegação por teclado entre blocos: as setas ficam livres para os jogos
// e para os blocos "quando apertar a tecla". Ficam só copiar/colar/desfazer/apagar.
{
  const n = Blockly.ShortcutItems.names;
  const manter = new Set<string>([n.ESCAPE, n.DELETE, n.COPY, n.CUT, n.PASTE, n.UNDO, n.REDO, n.DUPLICATE, n.CLEANUP]);
  for (const nome of Object.keys(Blockly.ShortcutRegistry.registry.getRegistry())) {
    if (!manter.has(nome)) Blockly.ShortcutRegistry.registry.unregister(nome);
  }
}

// "Duplicar" do menu de contexto: leva junto toda a corrente de blocos abaixo
function duplicateWithChain(block: Blockly.BlockSvg) {
  const state = Blockly.serialization.blocks.save(block, { addCoordinates: true, addNextBlocks: true });
  if (!state) return;
  state.x = (state.x ?? 0) + 30;
  state.y = (state.y ?? 0) + 30;
  Blockly.Events.setGroup(true);
  try {
    const copy = Blockly.serialization.blocks.append(state, block.workspace) as Blockly.BlockSvg;
    copy.select();
  } finally {
    Blockly.Events.setGroup(false);
  }
}

Blockly.ContextMenuRegistry.registry.unregister("blockDuplicate");
Blockly.ContextMenuRegistry.registry.register({
  id: "blockDuplicate",
  weight: 1,
  scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
  displayText: () => Blockly.Msg["DUPLICATE_BLOCK"],
  preconditionFn: (scope) => {
    const b = scope.block;
    if (!b || b.isInFlyout || !b.isDeletable() || !b.isMovable()) return "hidden";
    return b.isDuplicatable() ? "enabled" : "disabled";
  },
  callback: (scope) => {
    if (scope.block) duplicateWithChain(scope.block);
  },
});

/** Arquivos que acompanham o main.py: boot.py (receptor Wi-Fi) e bibliotecas usadas. */
function programFiles(): Record<string, string> {
  const files: Record<string, string> = { "boot.py": bootSource };
  // o MicroPython não traz o driver do OLED
  if (usesOled(workspace)) files["ssd1306.py"] = ssd1306Source;
  return files;
}

function generateCode(): string {
  return (
    preamble(currentPin()) +
    (usesOled(workspace) ? oledCode() : "") +
    monitorCode(collectInputPins(workspace)) +
    programCode(workspace)
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
  ensureStartBlock();
}

/** Se não houver "ao iniciar", cria um e pendura nele a primeira pilha de blocos. */
function ensureStartBlock() {
  const tops = workspace.getTopBlocks(true);
  if (tops.some((b) => b.type === "event_start")) return;
  const first = tops.find((b) => b.previousConnection);
  const hat = workspace.newBlock("event_start");
  (hat as Blockly.BlockSvg).initSvg();
  (hat as Blockly.BlockSvg).render();
  if (first) {
    const xy = first.getRelativeToSurfaceXY();
    hat.moveBy(xy.x, xy.y - 40);
    hat.nextConnection!.connect(first.previousConnection!);
  } else {
    hat.moveBy(40, 40);
  }
}

workspace.addChangeListener((e) => {
  if (e.isUiEvent) return;
  updateCode();
  saveWorkspace();
  onInputPinsChanged();
  updateWifiSendControl();
});

loadWorkspace();
updateCode();

// ---------- baixar / abrir projeto ----------
const PROJECT_FORMAT = "beta-blocks";

$("btn-save").addEventListener("click", () => {
  const project = {
    format: PROJECT_FORMAT,
    version: 1,
    savedAt: new Date().toISOString(),
    workspace: Blockly.serialization.workspaces.save(workspace),
  };
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const nome = prompt("Nome do projeto:", "meu-projeto")?.trim();
  if (!nome) return;
  a.href = url;
  a.download = `${nome.replace(/[^\w.-]+/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus(`Projeto salvo: ${a.download}`, "ok");
});

const fileLoad = $<HTMLInputElement>("file-load");
$("btn-load").addEventListener("click", () => {
  fileLoad.value = "";
  fileLoad.click();
});
fileLoad.addEventListener("change", async () => {
  const file = fileLoad.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    // aceita o arquivo do Beta Blocks ou um workspace do Blockly puro
    const state = data.format === PROJECT_FORMAT ? data.workspace : data.blocks ? data : null;
    if (!state) throw new Error("não é um projeto do Beta Blocks");
    if (workspace.getAllBlocks(false).length > 0 && !confirm("Substituir o projeto atual pelo arquivo aberto?")) return;
    Blockly.Events.setGroup(true);
    try {
      workspace.clear();
      Blockly.serialization.workspaces.load(state, workspace);
      ensureStartBlock();
    } finally {
      Blockly.Events.setGroup(false);
    }
    setStatus(`Projeto aberto: ${file.name}`, "ok");
  } catch (err) {
    setStatus(`Não deu para abrir ${file.name}: ${(err as Error).message}`, "error");
  }
});

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
  updateSidePanelVisibility();
}

function updateSidePanelVisibility() {
  (document.querySelector(".side-panel") as HTMLElement).hidden =
    monitorPanel.hidden && displayPanel.hidden && wifiPanel.hidden && !PANELS_VISIBLE;
}

// ---------- Wi-Fi ----------
const wifiPanel = $("wifi-panel");
const wifiInfo = $("wifi-info");

const WIFI_IP_KEY = "betablocks.wifiIp";

function showWifiStatus(info: { ip?: string; erro?: string }) {
  wifiIp = info.ip ?? null;
  if (info.ip) localStorage.setItem(WIFI_IP_KEY, info.ip);
  if (info.ip) {
    wifiInfo.className = "wifi-info";
    wifiInfo.innerHTML = `Conectado. No celular (na mesma rede), abra:<span class="url">http://${info.ip}</span>`;
  } else {
    wifiInfo.className = "wifi-info error";
    wifiInfo.textContent = `Wi-Fi: ${info.erro ?? "erro"}. Confira o nome da rede e a senha.`;
  }
  updateWifiSendControl();
}

function clearWifiStatus() {
  wifiIp = null;
  wifiInfo.textContent = "";
  updateWifiSendControl();
}

// ---- enviar comando de Wi-Fi a partir do app ----
let wifiIp: string | null = null;
const wifiSend = $("wifi-send");
const wifiSendName = $<HTMLSelectElement>("wifi-send-name");

/** Mostra o seletor de comandos quando o programa (rodando) tem eventos de Wi-Fi. */
function updateWifiSendControl() {
  const names = wifiEventNames(workspace);
  const current = wifiSendName.value;
  wifiSendName.replaceChildren(
    ...names.map((n) => {
      const o = document.createElement("option");
      o.value = o.textContent = n;
      return o;
    }),
  );
  if (names.includes(current)) wifiSendName.value = current;
  wifiSend.hidden = !(names.length > 0 && board.connected && monitorMode === "program");
  wifiPanel.hidden = wifiSend.hidden && !wifiInfo.textContent;
  updateSidePanelVisibility();
}

$("btn-wifi-send").addEventListener("click", async () => {
  const name = wifiSendName.value;
  if (!name) return;
  // tenta pela rede quando o IP é conhecido; se falhar (ou sem IP) vai pelo cabo USB
  const viaWifi = wifiIp !== null;
  if (viaWifi) {
    try {
      await fetchLocal(`http://${wifiIp}/b?n=${encodeURIComponent(name)}`, { mode: "no-cors" }, 3000);
      setStatus(`"${name}" enviado pelo Wi-Fi`, "ok");
      return;
    } catch {
      /* placa não respondeu pelo Wi-Fi: tenta pelo cabo */
    }
  }
  await board.write(`${KEY_MARK}wifi:${name}\n`).catch(() => {});
  setStatus(`"${name}" enviado pelo cabo USB`, "ok");
});

// ---------- preview do visor ----------
const displayPanel = $("display-panel");
const displayCanvas = $<HTMLCanvasElement>("display-canvas");

/** Desenha um quadro do visor (formato MONO_VLSB do framebuf) no canvas. */
function drawDisplayFrame(payload: string) {
  const [w, h, b64] = payload.split(",");
  const width = Number(w), height = Number(h);
  if (!width || !height || !b64) return;
  const bin = atob(b64);
  if (bin.length < (width * height) / 8) return;
  if (displayCanvas.width !== width || displayCanvas.height !== height) {
    displayCanvas.width = width;
    displayCanvas.height = height;
    displayCanvas.style.height = `${(256 * height) / width}px`;
  }
  const ctx = displayCanvas.getContext("2d")!;
  const img = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const on = (bin.charCodeAt(x + (y >> 3) * width) >> (y & 7)) & 1;
      const i = (y * width + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = on ? 255 : 0;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  displayPanel.hidden = false;
  updateSidePanelVisibility();
}

function clearDisplayPreview() {
  displayPanel.hidden = true;
  updateSidePanelVisibility();
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
/** Separa as linhas do monitor/visor (marcadas) do texto normal do console. */
function handleSerialData(text: string) {
  serialPending += text;
  for (;;) {
    const marks = [MONITOR_MARK, DISPLAY_MARK, WIFI_MARK]
      .map((m) => serialPending.indexOf(m))
      .filter((i) => i >= 0);
    const mark = marks.length ? Math.min(...marks) : -1;
    if (mark < 0) {
      consoleWrite(serialPending);
      serialPending = "";
      return;
    }
    if (mark > 0) consoleWrite(serialPending.slice(0, mark));
    const nl = serialPending.indexOf("\n", mark);
    if (nl < 0) {
      serialPending = serialPending.slice(mark); // linha marcada incompleta: espera o resto
      return;
    }
    const kind = serialPending[mark];
    const line = serialPending.slice(mark + 1, nl).trim();
    serialPending = serialPending.slice(nl + 1);
    try {
      if (kind === MONITOR_MARK) queueMonitorValues(JSON.parse(line));
      else if (kind === WIFI_MARK) showWifiStatus(JSON.parse(line));
      else drawDisplayFrame(line);
    } catch {
      /* linha corrompida: ignora */
    }
  }
}

/** Liga o monitor pela REPL (usado quando nenhum programa está rodando). */
async function startReplMonitor() {
  await board.execSnippet(preamble(currentPin()) + monitorCode(monitoredPins));
  monitorMode = "repl";
}

/** Para o programa e zera a placa (LED, PWM, portas, visor); liga o monitor se houver entradas. */
async function stopAndReset() {
  await board.stop();
  await board.execSnippet(resetBoardCode(currentPin()));
  monitorMode = null;
  clearDisplayPreview();
  clearWifiStatus();
  if (monitoredPins.analog.length + monitoredPins.digital.length > 0) {
    await startReplMonitor();
  }
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
  clearDisplayPreview();
  clearWifiStatus();
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
  // o primeiro boot depois da gravação demora (formata a memória): tenta algumas vezes
  let ok = false;
  for (let tentativa = 1; tentativa <= 4 && !ok; tentativa++) {
    setStatus(tentativa === 1 ? "Verificando MicroPython…" : `Verificando MicroPython… (tentativa ${tentativa})`);
    ok = await board.ping();
    if (!ok) await new Promise((r) => setTimeout(r, 2000));
  }
  if (ok) {
    await stopAndReset(); // placa "limpa": programa parado, LED apagado, portas soltas
    setStatus("Conectado — MicroPython pronto", "ok");
  } else {
    setStatus("Conectado, mas a placa não tem MicroPython — clique em \"Gravar MicroPython\" (só na primeira vez).", "error");
  }
}

async function disconnect() {
  await board.disconnect();
  monitorMode = null;
  clearMonitorCards();
  clearDisplayPreview();
  clearWifiStatus();
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
      await board.uploadMain(code, programFiles());
    } catch (err) {
      if (err instanceof ReplError && err.message.startsWith("Sem resposta")) {
        throw new Error(`${err.message}\nA placa tem MicroPython? Se não, use "Gravar MicroPython". Aperte RESET na placa e veja se aparece "MicroPython v..." no console.`);
      }
      throw err;
    }
    monitorMode = "program";
    updateWifiSendControl();
    setStatus("Programa enviado e rodando!", "ok");
  }),
);

btnStop.addEventListener("click", () =>
  run("Parar", async () => {
    await stopAndReset();
    setStatus(monitorMode === "repl" ? "Programa parado — monitor de entradas ligado" : "Programa parado", "ok");
  }),
);

// ---------- envio do programa por Wi-Fi ----------
const OTA_PORT = 8266;

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Chamada HTTP para a placa na rede local. Numa página HTTPS o navegador
 * bloqueia http://<ip> (conteúdo misto), a não ser que a chamada declare que o
 * destino é a rede local ("targetAddressSpace") — aí o Chrome pede permissão
 * de acesso à rede local ao usuário. Tenta os nomes usados pelas versões do Chrome.
 */
async function fetchLocal(url: string, init: RequestInit, ms: number): Promise<Response> {
  if (location.protocol !== "https:") return fetchWithTimeout(url, init, ms);
  let lastErr: unknown;
  for (const space of ["local", "private"]) {
    try {
      return await fetchWithTimeout(url, { ...init, targetAddressSpace: space } as RequestInit, ms);
    } catch (err) {
      lastErr = err;
      // valor não reconhecido pelo navegador: tenta o outro nome; erro de rede: desiste
      if (!(err instanceof TypeError && /enum|AddressSpace/i.test(err.message))) break;
    }
  }
  throw lastErr;
}

const AJUDA_HTTPS =
  "Se o Chrome perguntou sobre acesso à rede local, permita e tente de novo. " +
  "Se não perguntou, este navegador não deixa páginas HTTPS falarem com a placa — abra o app local (npm run dev).";

// ---------- teclas do computador -> placa ----------
const KEY_NAMES: Record<string, string> = {
  " ": "space",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "enter",
};
const KNOWN_KEYS = new Set(KEY_OPTIONS.map(([, v]) => v));

/**
 * Teclas do computador -> placa. O bloco decide o caminho:
 * "quando apertar a tecla" vai pelo cabo; "... pelo Wi-Fi" vai pela rede
 * (receptor do boot.py, no último IP conhecido).
 */
document.addEventListener("keydown", (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
  if (Blockly.WidgetDiv.isVisible() || Blockly.DropDownDiv.isVisible()) return;
  const name = KEY_NAMES[e.key] ?? e.key.toLowerCase();
  if (!KNOWN_KEYS.has(name)) return;

  // teclas dos jogos: pelo cabo se a placa estiver conectada rodando o programa, senão pelo Wi-Fi
  const jogo = gameKeys(workspace).has(name);
  const usbOk = board.connected && monitorMode === "program" && !busy;
  const viaUsb = (keysOfType(workspace, "event_key").has(name) || jogo) && usbOk;
  const viaWifi = keysOfType(workspace, "event_key_wifi").has(name) || (jogo && !usbOk);
  if (!viaUsb && !viaWifi) return;
  e.preventDefault();
  const rotulo = e.key === " " ? "espaço" : e.key;

  if (viaUsb) {
    void board.write(`${KEY_MARK}${name}\n`).catch(() => {});
    setStatus(`Tecla "${rotulo}" enviada pelo cabo`, "ok");
  }
  if (viaWifi) {
    const ip = wifiIp ?? localStorage.getItem(WIFI_IP_KEY);
    if (!ip) {
      setStatus("Tecla pelo Wi-Fi: ainda não sei o IP da placa. Envie um programa com 'conectar no Wi-Fi' pelo cabo uma vez.", "error");
      return;
    }
    fetchLocal(`http://${ip}:${OTA_PORT}/k?n=${encodeURIComponent(name)}`, {}, 3000)
      .then(() => setStatus(`Tecla "${rotulo}" enviada pelo Wi-Fi para ${ip}`, "ok"))
      .catch(() =>
        setStatus(
          `Tecla "${rotulo}": a placa não respondeu em ${ip}. ` +
            (location.protocol === "https:" ? AJUDA_HTTPS : "Está ligada e na rede?"),
          "error",
        ),
      );
  }
});

btnUploadWifi.addEventListener("click", () =>
  run("Envio por Wi-Fi", async () => {
    const last = wifiIp ?? localStorage.getItem(WIFI_IP_KEY) ?? "";
    const ip = prompt("Endereço (IP) da placa na rede:", last)?.trim();
    if (!ip) {
      setStatus("Envio por Wi-Fi cancelado");
      return;
    }
    const base = `http://${ip}:${OTA_PORT}`;

    setStatus(`Procurando a placa em ${ip}…`);
    try {
      const r = await fetchLocal(`${base}/ping`, {}, 4000);
      if ((await r.text()) !== "betablocks") throw new Error("resposta inesperada");
    } catch (err) {
      const motivo = err instanceof DOMException && err.name === "AbortError"
        ? "tempo esgotado (4 s sem resposta)"
        : `${(err as Error).name}: ${(err as Error).message}`;
      throw new Error(
        `A placa não respondeu em ${ip}:${OTA_PORT} — ${motivo}. ` +
          (location.protocol === "https:"
            ? AJUDA_HTTPS
            : "Ela precisa estar ligada, na mesma rede, e já ter recebido um programa pelo cabo com o bloco 'conectar no Wi-Fi'."),
      );
    }

    setStatus("Enviando programa por Wi-Fi…");
    const files = { ...programFiles(), "main.py": generateCode() };
    // text/plain evita o preflight CORS; o boot.py lê o corpo como JSON
    const r = await fetchLocal(
      `${base}/programa`,
      { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(files) },
      15000,
    );
    if (!r.ok) throw new Error(`a placa respondeu ${r.status}`);
    localStorage.setItem(WIFI_IP_KEY, ip);
    setStatus("Programa enviado por Wi-Fi! A placa está reiniciando.", "ok");
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
    setStatus("MicroPython gravado! Aperte RESET na placa, espere 5 s e clique em \"Conectar\".", "ok");
  });
});

refreshButtons();
