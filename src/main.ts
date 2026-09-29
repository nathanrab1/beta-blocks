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
  MONITOR_MARK,
  DISPLAY_MARK,
  eventKeys,
  gameKeys,
  gameHoldKeys,
  oledCode,
  RENDERER,
  type InputPins,
} from "./blocks/betablocks";
import ssd1306Source from "./lib/ssd1306.py?raw";
import bootSource from "./lib/boot.py?raw";
import { Board, ReplError } from "./serial/board";
import { bleSupported, requestBleDevice } from "./serial/ble";
import { flashMicroPython, loadFirmware } from "./serial/flasher";
import {
  DriveError,
  driveConfigured,
  listProjects,
  loadProject,
  preloadGoogle,
  saveProject,
  signIn,
  signOut,
  signedInEmail,
  rememberedEmail,
  trashProject,
  type DriveFile,
} from "./drive";
import { workspaceThumbnail } from "./thumbnail";

const STORAGE_KEY = "betablocks.workspace";

// App instalável (PWA) e sem internet: o sw.js só existe no build (vite.config.ts).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

// ---------- elementos ----------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const btnConnect = $<HTMLButtonElement>("btn-connect");
const btnConnectBle = $<HTMLButtonElement>("btn-connect-ble");
const btnUpload = $<HTMLButtonElement>("btn-upload");
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

// celular (tela estreita): menu ☰, painel embaixo e blocos menores
const compacto = window.matchMedia("(max-width: 600px)");
const escala = () => (compacto.matches ? 0.65 : 0.9);

const workspace = Blockly.inject("blockly-div", {
  toolbox,
  renderer: RENDERER,
  grid: { spacing: 24, length: 3, colour: "#e3e6eb", snap: true },
  zoom: { controls: true, wheel: true, startScale: escala() },
  trashcan: true,
  move: { scrollbars: true, drag: true, wheel: false },
});

// ---------- celular: menu ☰ e painel embaixo ----------
{
  const toolbarEl = $("toolbar");
  const menuPanel = $("menu-panel");
  const btnMenu = $<HTMLButtonElement>("btn-menu");
  const sidePanel = document.querySelector<HTMLElement>(".side-panel")!;
  const NO_TOPO = new Set(["btn-connect-ble", "btn-upload", "btn-stop"]);
  const itens = [...toolbarEl.children] as HTMLElement[];

  const abrirMenu = (abrir: boolean) => {
    menuPanel.hidden = !abrir;
    btnMenu.setAttribute("aria-expanded", String(abrir));
  };
  // os botões mudam de lugar (mesmos elementos: os cliques continuam funcionando)
  const aplicar = () => {
    if (compacto.matches) {
      toolbarEl.replaceChildren(...itens.filter((el) => NO_TOPO.has(el.id)));
      menuPanel.replaceChildren(...itens.filter((el) => !NO_TOPO.has(el.id)));
    } else {
      toolbarEl.replaceChildren(...itens);
      abrirMenu(false);
    }
  };
  aplicar();
  compacto.addEventListener("change", () => {
    aplicar();
    workspace.setScale(escala());
  });

  btnMenu.addEventListener("click", () => abrirMenu(menuPanel.hidden));
  // escolheu uma opção ou tocou fora: fecha
  menuPanel.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".btn")) abrirMenu(false);
  });
  document.addEventListener("pointerdown", (e) => {
    const alvo = e.target as Node;
    if (!menuPanel.hidden && !menuPanel.contains(alvo) && !btnMenu.contains(alvo)) abrirMenu(false);
  });

  $("panel-toggle").addEventListener("click", () => sidePanel.classList.toggle("aberto"));
  // o painel embaixo abre, fecha e aparece sem a janela mudar de tamanho: o Blockly precisa saber
  new ResizeObserver(() => Blockly.svgResize(workspace)).observe($("blockly-div"));
}

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

/** Arquivos que acompanham o main.py: boot.py (Bluetooth) e bibliotecas usadas. */
function programFiles(): Record<string, string> {
  const files: Record<string, string> = { "boot.py": bootSource };
  // o MicroPython não traz o driver do OLED (a tela fica sempre ligada, em todo programa)
  files["ssd1306.py"] = ssd1306Source;
  return files;
}

function generateCode(): string {
  return (
    preamble(currentPin()) +
    oledCode() +
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

type BlockState = { type?: string; next?: { block?: BlockState }; inputs?: Record<string, { block?: BlockState }> };

/**
 * Tira do projeto os blocos que não existem mais (ex.: os de Wi-Fi, removidos):
 * o Blockly daria erro ao abrir e o app inteiro pararia. Os blocos que vinham
 * depois dele continuam no lugar. Devolve quantos foram tirados.
 */
function dropUnknownBlocks(state: any): number {
  let removed = 0;
  // devolve o bloco a usar no lugar deste (o próprio, o seguinte dele, ou nenhum)
  const clean = (b: BlockState | undefined): BlockState | undefined => {
    while (b && !(b.type && Blockly.Blocks[b.type])) {
      removed++;
      b = b.next?.block;
    }
    if (!b) return undefined;
    for (const input of Object.values(b.inputs ?? {})) {
      if (input.block) input.block = clean(input.block);
      if (!input.block) delete input.block;
    }
    if (b.next?.block) b.next.block = clean(b.next.block);
    if (b.next && !b.next.block) delete b.next;
    return b;
  };
  if (!Array.isArray(state?.blocks?.blocks)) return 0;
  state.blocks.blocks = state.blocks.blocks.flatMap((top: BlockState & { x?: number; y?: number }) => {
    const b = clean(top);
    if (!b) return [];
    // o seguinte de um bloco solto que saiu fica onde ele estava
    if (b !== top) Object.assign(b, { x: top.x, y: top.y });
    return [b];
  });
  return removed;
}

function loadWorkspace() {
  const saved = localStorage.getItem(STORAGE_KEY);
  let state: any = starterWorkspace;
  if (saved) {
    try { state = JSON.parse(saved); } catch { /* usa o inicial */ }
  }
  let removed = 0;
  try {
    removed = dropUnknownBlocks(state);
    Blockly.serialization.workspaces.load(state, workspace);
  } catch (err) {
    // projeto salvo que não abre: começa do inicial em vez de travar o app
    console.error("Projeto salvo não abriu:", err);
    workspace.clear();
    Blockly.serialization.workspaces.load(starterWorkspace, workspace);
  }
  ensureStartBlock();
  if (removed) setStatus(`${removed} bloco(s) que não existem mais (ex.: Wi-Fi, visor OLED) foram tirados do projeto`, "error");
}

/**
 * Existe sempre um único "ao iniciar", que não pode ser apagado nem duplicado.
 * Se não houver, cria um e pendura nele a primeira pilha de blocos; se houver
 * mais de um (projeto antigo, colar), os extras são removidos e seus blocos
 * ficam soltos no espaço de trabalho.
 */
function ensureStartBlock() {
  const tops = workspace.getTopBlocks(true);
  const hats = tops.filter((b) => b.type === "event_start");
  if (hats.length === 0) {
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
    hats.push(hat);
  }
  hats[0].setDeletable(false);
  for (const extra of hats.slice(1)) extra.dispose(true); // só o chapéu sai; a pilha fica
  if (hats.length > 1) setStatus("Só pode haver um 'ao iniciar'. Os blocos da outra pilha ficaram soltos.", "error");
}

// colar/duplicar um "ao iniciar" quando já existe um: o novo é removido
workspace.addChangeListener((e) => {
  if (e.type !== Blockly.Events.BLOCK_CREATE) return;
  const ev = e as Blockly.Events.BlockCreate;
  if (ev.json?.type !== "event_start") return;
  if (workspace.getTopBlocks(false).filter((b) => b.type === "event_start").length <= 1) return;
  const novo = workspace.getBlockById(ev.blockId!);
  if (!novo) return;
  novo.dispose(true); // só o chapéu sai; os blocos colados ficam soltos
  setStatus("Só pode haver um 'ao iniciar'. Os blocos colados ficaram soltos.", "error");
});

workspace.addChangeListener((e) => {
  if (e.isUiEvent) return;
  updateCode();
  saveWorkspace();
  onInputPinsChanged();
});

loadWorkspace();
updateCode();

// ---------- baixar / abrir projeto ----------
const PROJECT_FORMAT = "beta-blocks";

function projectJson(thumbnail: string | null = null): string {
  return JSON.stringify(
    {
      format: PROJECT_FORMAT,
      version: 1,
      savedAt: new Date().toISOString(),
      ...(thumbnail ? { thumbnail } : {}),
      workspace: Blockly.serialization.workspaces.save(workspace),
    },
    null,
    2,
  );
}

/** Troca o projeto na tela. Devolve false se a pessoa desistiu de substituir. */
function openProject(data: any): boolean {
  // aceita o arquivo do Beta Blocks ou um workspace do Blockly puro
  const state = data?.format === PROJECT_FORMAT ? data.workspace : data?.blocks ? data : null;
  if (!state) throw new Error("não é um projeto do Beta Blocks");
  if (workspace.getAllBlocks(false).length > 1 && !confirm("Substituir o projeto atual?")) return false;
  Blockly.Events.setGroup(true);
  try {
    workspace.clear();
    const removed = dropUnknownBlocks(state);
    Blockly.serialization.workspaces.load(state, workspace);
    ensureStartBlock();
    if (removed) setStatus(`${removed} bloco(s) que não existem mais (ex.: Wi-Fi, visor OLED) foram tirados do projeto`, "error");
  } finally {
    Blockly.Events.setGroup(false);
  }
  return true;
}

$("btn-save").addEventListener("click", () => {
  const nome = prompt("Nome do projeto:", driveFile ? projectTitle(driveFile.name) : "meu-projeto")?.trim();
  if (!nome) return;
  const url = URL.createObjectURL(new Blob([projectJson()], { type: "application/json" }));
  const a = document.createElement("a");
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
    if (!openProject(JSON.parse(await file.text()))) return;
    setDriveFile(null);
    setStatus(`Projeto aberto: ${file.name}`, "ok");
  } catch (err) {
    setStatus(`Não deu para abrir ${file.name}: ${(err as Error).message}`, "error");
  }
});

// ---------- Google Drive (pasta "Beta Kit") ----------
const DRIVE_FILE_KEY = "betablocks.driveFile";
const projectName = $("project-name");
const driveModal = $("drive-modal");
const driveList = $("drive-list");
const driveUser = $("drive-user");

/** Arquivo do Drive de onde veio o projeto na tela: "Salvar no Drive" sobrescreve ele. */
let driveFile: { id: string; name: string } | null = null;
try {
  driveFile = JSON.parse(localStorage.getItem(DRIVE_FILE_KEY) ?? "null");
} catch { /* sem arquivo */ }

const projectTitle = (fileName: string) => fileName.replace(/\.json$/i, "");

function setDriveFile(f: { id: string; name: string } | null) {
  driveFile = f;
  if (f) localStorage.setItem(DRIVE_FILE_KEY, JSON.stringify(f));
  else localStorage.removeItem(DRIVE_FILE_KEY);
  projectName.textContent = f ? `☁ ${projectTitle(f.name)}` : "";
}
setDriveFile(driveFile);

function driveFail(err: unknown) {
  if (err instanceof DriveError && err.status === 404) setDriveFile(null);
  const msg = err instanceof DriveError && err.status === 404
    ? "o arquivo não está mais no Drive, salve de novo"
    : (err as Error).message;
  setStatus(`Google Drive: ${msg}`, "error");
}

/** Roda `task` depois do login. O login sai direto do clique para o pop-up não ser bloqueado. */
function withGoogle(task: () => Promise<void>) {
  signIn().then(task).catch(driveFail);
}

async function saveToDrive(asNew: boolean) {
  let name = driveFile?.name;
  let id = asNew ? undefined : driveFile?.id;
  if (asNew || !driveFile) {
    const nome = prompt("Nome do projeto:", driveFile ? projectTitle(driveFile.name) : "meu-projeto")?.trim();
    if (!nome) return;
    name = `${nome}.json`;
    const same = (await listProjects()).find((f) => f.name === name);
    if (same) {
      if (!confirm(`Já existe "${nome}" no Drive. Substituir?`)) return;
      id = same.id;
    }
  }
  setStatus("Salvando no Google Drive…");
  const thumb = await workspaceThumbnail(workspace);
  const f = await saveProject(name!, projectJson(thumb), thumb, id);
  setDriveFile({ id: f.id, name: f.name });
  setStatus(`Salvo no Google Drive: Beta Kit/${projectTitle(f.name)}`, "ok");
}

/** Antes de conectar só aparece "Conectar Drive"; depois, salvar e abrir. */
function updateDriveButtons() {
  const email = rememberedEmail();
  $("btn-drive-connect").hidden = email !== null;
  $("btn-drive-save").hidden = email === null;
  $("btn-drive-open").hidden = email === null;
  $("btn-drive-open").title = email ? `Projetos da pasta Beta Kit no Drive de ${email}` : "";
}

$("btn-drive-connect").addEventListener("click", () =>
  withGoogle(async () => {
    updateDriveButtons();
    setStatus(`Google Drive conectado: ${signedInEmail()}`, "ok");
  }),
);
$("btn-drive-save").addEventListener("click", () => withGoogle(() => saveToDrive(false)));

$("btn-drive-open").addEventListener("click", () =>
  withGoogle(async () => {
    driveUser.textContent = signedInEmail() ?? "";
    driveList.innerHTML = `<p class="drive-empty">Carregando…</p>`;
    driveModal.hidden = false;
    renderDriveList(await listProjects());
  }),
);

const closeDriveModal = () => (driveModal.hidden = true);
$("btn-drive-close").addEventListener("click", closeDriveModal);
driveModal.addEventListener("click", (e) => {
  if (e.target === driveModal) closeDriveModal();
});
$("btn-drive-saveas").addEventListener("click", () => {
  closeDriveModal();
  withGoogle(() => saveToDrive(true));
});
$("btn-drive-logout").addEventListener("click", () => {
  signOut();
  closeDriveModal();
  setDriveFile(null);
  updateDriveButtons();
  setStatus("Saiu da conta do Google");
});

// conteúdo já baixado (miniatura e abrir), por id + data de modificação
const driveCache = new Map<string, Promise<any>>();
function driveContent(f: DriveFile) {
  const key = `${f.id}@${f.modifiedTime}`;
  let p = driveCache.get(key);
  if (!p) {
    p = loadProject(f.id);
    p.catch(() => driveCache.delete(key));
    driveCache.set(key, p);
  }
  return p;
}

function renderDriveList(files: DriveFile[]) {
  if (!files.length) {
    driveList.innerHTML = `<p class="drive-empty">Nenhum projeto ainda. Use <b>☁ Salvar no Drive</b>.</p>`;
    return;
  }
  const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
  driveList.replaceChildren(
    ...files.map((f) => {
      const item = document.createElement("div");
      item.className = "drive-item";
      item.classList.toggle("current", f.id === driveFile?.id);
      item.innerHTML = `<div class="drive-thumb"></div><div class="drive-name"></div><div class="drive-date"></div>
        <button class="drive-trash" title="Mover para a lixeira do Drive">🗑</button>`;
      item.querySelector(".drive-name")!.textContent = projectTitle(f.name);
      item.querySelector(".drive-date")!.textContent = quando.format(new Date(f.modifiedTime));
      item.title = `Abrir ${projectTitle(f.name)}`;
      driveContent(f)
        .then((data) => {
          if (typeof data?.thumbnail !== "string" || !data.thumbnail.startsWith("data:image/")) return;
          const img = document.createElement("img");
          img.src = data.thumbnail;
          img.alt = "";
          item.querySelector(".drive-thumb")!.appendChild(img);
        })
        .catch(() => {});
      item.addEventListener("click", async () => {
        try {
          setStatus(`Abrindo ${projectTitle(f.name)}…`);
          if (!openProject(await driveContent(f))) return setStatus("");
          setDriveFile({ id: f.id, name: f.name });
          closeDriveModal();
          setStatus(`Projeto aberto do Drive: ${projectTitle(f.name)}`, "ok");
        } catch (err) {
          driveFail(err);
        }
      });
      item.querySelector(".drive-trash")!.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(`Mover "${projectTitle(f.name)}" para a lixeira do Drive?`)) return;
        try {
          await trashProject(f.id);
          if (f.id === driveFile?.id) setDriveFile(null);
          renderDriveList(files.filter((x) => x !== f));
        } catch (err) {
          driveFail(err);
        }
      });
      return item;
    }),
  );
}

if (driveConfigured()) {
  preloadGoogle();
  updateDriveButtons();
} else {
  document.querySelectorAll<HTMLElement>(".drive-only").forEach((el) => (el.hidden = true));
}

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
    monitorPanel.hidden && displayPanel.hidden && !PANELS_VISIBLE;
}

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
let lastMarkAt = 0; // quando chegou a última linha de monitor/visor
/** Separa as linhas do monitor/visor (marcadas) do texto normal do console. */
function handleSerialData(text: string) {
  serialPending += text;
  for (;;) {
    const marks = [MONITOR_MARK, DISPLAY_MARK]
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
      else drawDisplayFrame(line);
      lastMarkAt = Date.now(); // a placa está mandando dados: tem programa rodando
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
  // pelo Bluetooth a própria placa zera tudo no Parar (boot.py); o monitor com o
  // programa parado (pela REPL) é só pelo cabo
  if (board.transport === "ble") clearMonitorCards();
  else await board.execSnippet(resetBoardCode(currentPin()));
  monitorMode = null;
  clearDisplayPreview();
  if (board.transport !== "ble" && monitoredPins.analog.length + monitoredPins.digital.length > 0) {
    await startReplMonitor();
  }
}

const SO_CABO = "visor ao vivo só pelo cabo";

/** Bluetooth: lê algumas vezes por segundo a leitura do monitor que o programa deixa na placa. */
async function bleMonitorLoop() {
  const link = board.ble;
  while (link && board.ble === link) {
    await new Promise((r) => setTimeout(r, 250));
    if (busy || monitorMode !== "program") continue;
    try {
      const text = await board.readMonitor();
      if (text && board.ble === link) queueMonitorValues(JSON.parse(text));
    } catch {
      /* ligação caindo ou leitura cortada: tenta na próxima */
    }
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
board.onDisconnect = (busy) => {
  monitorMode = null;
  clearMonitorCards();
  clearDisplayPreview();
  setStatus(busy ? "Placa desconectada: outro aparelho conectou nela por Bluetooth" : "Placa desconectada", "error");
  refreshButtons();
};
// Bluetooth: a placa reinicia depois de cada envio e a ligação cai por uns segundos
board.onReconnecting = () => setStatus("Bluetooth: reconectando à placa… (para desistir, clique em Desconectar)");
board.onReconnected = () => setStatus(`Conectado por Bluetooth (${board.ble?.name})`, "ok");

const serialSupported = "serial" in navigator;
if (!serialSupported && !bleSupported) {
  $("unsupported").hidden = false;
}

function refreshButtons() {
  const on = board.connected;
  btnConnect.textContent = on ? "Desconectar" : "Conectar";
  btnConnect.disabled = !on && !serialSupported;
  btnConnectBle.hidden = on || !bleSupported;
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

/**
 * Conecta e descobre o estado da placa sem interromper nada: se ela já está
 * mandando leituras/visor, mostra o painel do programa que está rodando; se
 * está parada na REPL, zera a placa como antes.
 */
async function connect(port?: SerialPort) {
  const alvo = port ?? (await navigator.serial.requestPort());
  await board.connect(alvo);
  autoReconnect = true;
  await afterConnect();
}

async function connectBle() {
  const device = await requestBleDevice();
  const nome = device.name ?? "placa";
  setStatus(`Conectando por Bluetooth a ${nome}…`);
  await board.connectBle(device, (msg) => setStatus(`Bluetooth ${nome}: ${msg}…`));
  consoleWrite(`\n[bluetooth] ${device.name}: escritas em pedaços de ${board.ble?.chunkSize} bytes\n`);
  void bleMonitorLoop();
  await afterConnect(` por Bluetooth (${device.name ?? "placa"})`);
}

/** `via`: complemento de "Conectado" nas mensagens (ex.: " por Bluetooth"). */
async function afterConnect(via = "") {
  refreshButtons();
  if (board.transport === "ble") {
    // o Bluetooth não mostra a saída da placa: não dá para saber se há programa
    // rodando, então fica pronto para teclas, Parar e Enviar
    monitorMode = "program";
    setStatus(`Conectado${via} (${SO_CABO})`, "ok");
    return;
  }
  // o primeiro boot depois da gravação demora (formata a memória): tenta algumas vezes
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    setStatus(tentativa === 1 ? "Conectando…" : `Conectando… (tentativa ${tentativa})`);
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 1200));
    if (lastMarkAt > t0) {
      monitorMode = "program";
      setStatus(`Conectado${via} — mostrando o programa que já está rodando na placa`, "ok");
      return;
    }
    if (await board.atRepl()) {
      await stopAndReset(); // placa parada: deixa limpa (LED apagado, portas soltas)
      setStatus(`Conectado${via} — MicroPython pronto`, "ok");
      return;
    }
  }
  setStatus(
    "Conectado, mas a placa não está enviando nada. Se acabou de gravar o MicroPython, aperte RESET. " +
      "Se o programa dela não usa entradas nem visor, é normal — pode enviar um programa novo.",
    "error",
  );
}

async function disconnect() {
  autoReconnect = false;
  await board.disconnect();
  monitorMode = null;
  clearMonitorCards();
  clearDisplayPreview();
  setStatus("Desconectado");
}

// fechar ou sair da página solta a placa (senão o Bluetooth pode ficar preso a este aparelho)
window.addEventListener("pagehide", () => {
  if (board.transport === "ble") void board.disconnect();
});

btnConnect.addEventListener("click", () =>
  run("Conexão", () => (board.connected ? disconnect() : connect())),
);
btnConnectBle.addEventListener("click", () =>
  run("Bluetooth", async () => {
    try {
      await connectBle();
    } catch (err) {
      // fechou a lista sem escolher
      if (err instanceof DOMException && err.name === "NotFoundError") {
        setStatus("Nenhuma placa escolhida");
        return;
      }
      throw err;
    }
  }),
);

// Reconexão automática: ao plugar o cabo (ou ao abrir o app com a placa
// plugada), conecta sozinho numa porta já autorizada e mostra o dashboard.
let autoReconnect = true;
// falha aqui não é erro do usuário (porta ocupada por outro programa, por exemplo):
// tenta em silêncio, sem mensagem vermelha
async function tryAutoConnect(port: SerialPort) {
  if (!autoReconnect || board.connected || busy) return;
  busy = true;
  try {
    await connect(port);
  } catch {
    /* porta ocupada ou placa sumiu: fica como estava */
  } finally {
    busy = false;
    refreshButtons();
  }
}
if (serialSupported) {
  navigator.serial.addEventListener("connect", (e) => void tryAutoConnect(e.target as SerialPort));
  void navigator.serial.getPorts().then((ports) => {
    if (ports.length === 1) void tryAutoConnect(ports[0]);
  });
}

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
    setStatus(board.transport === "ble" ? `Programa enviado e rodando! (${SO_CABO})` : "Programa enviado e rodando!", "ok");
  }),
);

btnStop.addEventListener("click", () =>
  run("Parar", async () => {
    await stopAndReset();
    consoleWrite(`\n[parado] programa parado${board.transport === "ble" ? " (pelo Bluetooth)" : ""}\n`);
    setStatus(monitorMode === "repl" ? "Programa parado — monitor de entradas ligado" : "Programa parado", "ok");
  }),
);

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

/** Teclas do computador -> placa (cabo ou Bluetooth), com o programa rodando. */
document.addEventListener("keydown", (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
  if (Blockly.WidgetDiv.isVisible() || Blockly.DropDownDiv.isVisible()) return;
  const name = KEY_NAMES[e.key] ?? e.key.toLowerCase();
  if (!KNOWN_KEYS.has(name)) return;
  // "quando apertar a tecla" e as teclas dos jogos
  if (!eventKeys(workspace).has(name) && !gameKeys(workspace).has(name)) return;
  if (!board.connected || monitorMode !== "program" || busy) return;
  e.preventDefault();
  const rotulo = e.key === " " ? "espaço" : e.key;
  void board.sendEvent(name).catch(() => {});
  if (gameHoldKeys(workspace).has(name)) heldKeys.add(name);
  setStatus(`Tecla "${rotulo}" enviada ${board.transport === "ble" ? "por Bluetooth" : "pelo cabo"}`, "ok");
});

/** Teclas seguradas nos jogos: ao soltar, avisa a placa ("-left") para parar de andar. */
const heldKeys = new Set<string>();

function releaseKey(name: string) {
  if (!heldKeys.delete(name)) return;
  if (board.connected) void board.sendEvent(`-${name}`).catch(() => {});
}

document.addEventListener("keyup", (e) => releaseKey(KEY_NAMES[e.key] ?? e.key.toLowerCase()));
// a janela perdeu o foco com a tecla apertada: o keyup nunca vem, então solta tudo
window.addEventListener("blur", () => [...heldKeys].forEach(releaseKey));

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
      const port = board.port; // null no Bluetooth
      setStatus("Reiniciando a placa em modo de gravação…");
      try {
        await board.enterBootloader();
        viaBootloaderCmd = true;
      } catch {
        /* sem MicroPython (firmware Arduino ou placa zerada) */
      }
      await board.disconnect();
      if (!viaBootloaderCmd && port) {
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
