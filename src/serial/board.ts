/**
 * Comunicação com o MicroPython: pela REPL no cabo (Web Serial), ou por
 * comandos curtos no Bluetooth (BLE, ver ble.ts e boot.py). O Bluetooth só
 * faz enviar, parar e teclas; o resto (monitor, visor, gravar) é pelo cabo.
 */

import { BleLink, BleDropped } from "./ble";
import { KEY_MARK } from "../blocks/betablocks";

const RAW_REPL_PROMPT = "raw REPL; CTRL-B to exit\r\n>";
const CHUNK_SIZE = 256;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ReplError extends Error {}

export class Board {
  port: SerialPort | null = null;
  ble: BleLink | null = null;
  onData: ((text: string) => void) | null = null;
  /** `busy`: pelo Bluetooth, outro aparelho conectou na placa e ficou com ela. */
  onDisconnect: ((busy?: boolean) => void) | null = null;
  /** Só no Bluetooth: a ligação caiu e está voltando (ex.: soft reset depois do envio). */
  onReconnecting: (() => void) | null = null;
  onReconnected: (() => void) | null = null;

  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readLoop: Promise<void> | null = null;
  private buffer = "";
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private closing = false;

  get connected(): boolean {
    return (this.port !== null && this.writer !== null) || this.ble !== null;
  }

  get transport(): "usb" | "ble" | null {
    return this.ble ? "ble" : this.connected ? "usb" : null;
  }

  async connect(port: SerialPort): Promise<void> {
    await port.open({ baudRate: 115200 });
    // USB CDC nativo (ESP32-S3) só envia dados com DTR ativo
    try { await port.setSignals({ dataTerminalReady: true, requestToSend: true }); } catch { /* ignore */ }
    this.port = port;
    this.closing = false;
    this.buffer = "";
    this.writer = port.writable!.getWriter();
    this.readLoop = this.runReadLoop();
  }

  async connectBle(device: BluetoothDevice, onProgress?: (msg: string) => void): Promise<void> {
    if (this.ble) await this.disconnect();
    const link = new BleLink(device);
    // só a ligação atual fala com o app (uma antiga que desistiu fica muda)
    link.onReconnecting = () => { if (this.ble === link) this.onReconnecting?.(); };
    link.onReconnected = () => { if (this.ble === link) this.onReconnected?.(); };
    link.onLost = (busy) => {
      void link.close();
      if (this.ble !== link) return;
      this.ble = null;
      this.onDisconnect?.(busy);
    };
    // a placa às vezes derruba a ligação logo depois de aceitar: tenta de novo
    let tentativa = 1;
    link.onStep = (step) => onProgress?.(`${step} (tentativa ${tentativa} de 3)`);
    for (; ; tentativa++) {
      try {
        await link.open();
        break;
      } catch (err) {
        if (tentativa >= 3) {
          await link.close();
          throw new ReplError(`não consegui abrir a ligação — parou em "${(err as Error).message}"`);
        }
        await sleep(700);
      }
    }
    link.onStep = null;
    this.ble = link;
  }

  async disconnect(): Promise<void> {
    if (this.ble) {
      const link = this.ble;
      this.ble = null;
      await link.close();
      return;
    }
    if (!this.port) return;
    this.closing = true;
    try { await this.reader?.cancel(); } catch { /* ignore */ }
    try { await this.readLoop; } catch { /* ignore */ }
    try { this.writer?.releaseLock(); } catch { /* ignore */ }
    this.writer = null;
    try { await this.port.close(); } catch { /* ignore */ }
    this.port = null;
  }

  private async runReadLoop(): Promise<void> {
    const port = this.port!;
    while (port.readable && !this.closing) {
      this.reader = port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) this.receive(value);
        }
      } catch {
        // erro de leitura (cabo desconectado etc.)
        break;
      } finally {
        this.reader.releaseLock();
        this.reader = null;
      }
    }
    if (!this.closing) {
      // A placa sumiu (desplugada ou reiniciou em modo bootloader)
      this.writer?.releaseLock();
      this.writer = null;
      try { await this.port?.close(); } catch { /* ignore */ }
      this.port = null;
      this.onDisconnect?.();
    }
  }

  private receive(bytes: Uint8Array) {
    const text = this.decoder.decode(bytes, { stream: true });
    this.buffer += text;
    this.onData?.(text);
  }

  async write(text: string): Promise<void> {
    if (this.ble) throw new ReplError("Isso só funciona pelo cabo.");
    if (!this.writer) throw new ReplError("Placa não conectada.");
    const bytes = this.encoder.encode(text);
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      await this.writer.write(bytes.subarray(i, i + CHUNK_SIZE));
      if (bytes.length > CHUNK_SIZE) await sleep(10);
    }
  }

  /** Espera até `marker` aparecer no buffer e devolve o texto anterior a ele. */
  private async waitFor(marker: string, timeoutMs: number): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const idx = this.buffer.indexOf(marker);
      if (idx >= 0) {
        const before = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + marker.length);
        return before;
      }
      await sleep(20);
    }
    const got = this.buffer.trim();
    throw new ReplError(
      got
        ? `Sem resposta esperada da placa. Recebido: ${JSON.stringify(got.slice(-200))}`
        : "Sem resposta da placa (nenhum byte recebido).",
    );
  }

  /**
   * Interrompe o programa em execução (Ctrl-C) e desliga todos os timers.
   * O Ctrl-C só para o programa principal; os timers (monitor de entradas,
   * quadros do visor) continuariam imprimindo e bagunçariam a raw REPL.
   */
  async stop(): Promise<void> {
    if (this.ble) {
      // a placa para o programa e zera LED, visor e portas sozinha (boot.py)
      await this.ble.command("P", { waitMs: 8000 });
      return;
    }
    // Ctrl-C espaçados: um que caia dentro de um timer da placa é engolido por ele
    for (let i = 0; i < 3; i++) {
      await this.write(i === 0 ? "\r\x03" : "\x03");
      await sleep(80);
    }
    await this.write("import machine\r\n");
    await this.write("for _i in range(4): machine.Timer(_i).deinit()\r\n\r\n");
    await this.write("_bb_rodando = False\r\n"); // pilhas "ao iniciar" em threads saem dos lacos
    await sleep(250);
  }

  async enterRawRepl(): Promise<void> {
    await this.stop();
    this.buffer = "";
    await this.write("\r\x01");
    await this.waitFor(RAW_REPL_PROMPT, 3000);
  }

  async exitRawRepl(): Promise<void> {
    await this.write("\r\x02");
  }

  /** Executa código no raw REPL e devolve a saída. Lança erro se houver traceback. */
  async execRaw(code: string): Promise<string> {
    this.buffer = "";
    await this.write(code);
    await this.write("\x04");
    const ack = await this.waitFor("OK", 3000);
    void ack;
    const output = await this.waitFor("\x04", 10000);
    const error = await this.waitFor("\x04", 10000);
    if (error.trim()) throw new ReplError(error.trim());
    return output;
  }

  /** Grava `code` como main.py (e arquivos extras, ex.: bibliotecas) e reinicia a placa. */
  async uploadMain(code: string, extraFiles: Record<string, string> = {}): Promise<void> {
    if (this.ble) {
      const json = this.encoder.encode(JSON.stringify({ ...extraFiles, "main.py": code }));
      try {
        await this.ble.command(`U${json.length}`, { payload: json, waitMs: 20000 });
      } catch (err) {
        // a placa reinicia logo depois de gravar: se caiu antes de lermos o "gravado", já foi
        if (!(err instanceof BleDropped)) throw err;
      }
      return;
    }
    await this.enterRawRepl();
    for (const [name, content] of Object.entries({ ...extraFiles, "main.py": code })) {
      const literal = JSON.stringify(content); // literal JSON é um literal Python válido
      await this.execRaw(`with open(${JSON.stringify(name)}, 'w') as f:\n    f.write(${literal})\n`);
    }
    await this.exitRawRepl();
    await sleep(50);
    await this.write("\x04"); // soft reset -> roda main.py
  }

  /** Bluetooth: última leitura do monitor de entradas (JSON) que o programa deixou na placa. */
  async readMonitor(): Promise<string | null> {
    return this.ble ? this.ble.readMonitor() : null;
  }

  /** Tecla do computador para o programa rodando. */
  async sendEvent(name: string): Promise<void> {
    if (this.ble) {
      await this.ble.key(name);
      return;
    }
    await this.write(`${KEY_MARK}${name}\n`);
  }

  /** Executa um trecho de código pela raw REPL e volta para a REPL normal. */
  async execSnippet(code: string): Promise<string> {
    await this.enterRawRepl();
    try {
      return await this.execRaw(code);
    } finally {
      await this.exitRawRepl();
    }
  }

  /**
   * Manda um Enter e vê se a REPL responde ">>>", ou seja, se a placa está
   * parada. Não atrapalha um programa que esteja rodando (o Enter vira uma
   * linha vazia na entrada, que o leitor de teclas ignora).
   */
  async atRepl(timeoutMs = 800): Promise<boolean> {
    this.buffer = "";
    try { await this.write("\r\n"); } catch { return false; }
    await sleep(timeoutMs);
    return this.buffer.includes(">>>");
  }

  /** Verifica se há MicroPython respondendo. */
  async ping(): Promise<boolean> {
    try {
      await this.enterRawRepl();
      const out = await this.execRaw("import sys\nprint(sys.implementation.name)\n");
      await this.exitRawRepl();
      return out.includes("micropython");
    } catch {
      return false;
    }
  }

  /** Reinicia a placa em modo de gravação (bootloader ROM). */
  async enterBootloader(): Promise<void> {
    await this.enterRawRepl();
    this.buffer = "";
    await this.write("import machine\nmachine.bootloader()\n\x04");
  }
}
