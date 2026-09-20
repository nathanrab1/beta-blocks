/**
 * Comunicação com o MicroPython via Web Serial (REPL).
 */

const RAW_REPL_PROMPT = "raw REPL; CTRL-B to exit\r\n>";
const CHUNK_SIZE = 256;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ReplError extends Error {}

export class Board {
  port: SerialPort | null = null;
  onData: ((text: string) => void) | null = null;
  onDisconnect: (() => void) | null = null;

  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readLoop: Promise<void> | null = null;
  private buffer = "";
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private closing = false;

  get connected(): boolean {
    return this.port !== null && this.writer !== null;
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

  async disconnect(): Promise<void> {
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
          if (value) {
            const text = this.decoder.decode(value, { stream: true });
            this.buffer += text;
            this.onData?.(text);
          }
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

  async write(text: string): Promise<void> {
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

  /** Interrompe o programa em execução (Ctrl-C). */
  async stop(): Promise<void> {
    await this.write("\r\x03\x03");
  }

  async enterRawRepl(): Promise<void> {
    await this.write("\r\x03\x03");
    await sleep(100);
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

  /** Grava `code` como main.py e reinicia a placa para executá-lo. */
  async uploadMain(code: string): Promise<void> {
    await this.enterRawRepl();
    const literal = JSON.stringify(code); // literal JSON é um literal Python válido
    await this.execRaw(`with open('main.py', 'w') as f:\n    f.write(${literal})\n`);
    await this.exitRawRepl();
    await sleep(50);
    await this.write("\x04"); // soft reset -> roda main.py
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
