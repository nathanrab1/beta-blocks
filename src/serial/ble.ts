/**
 * Canal com a placa por Bluetooth (BLE), pelo serviço "UART" da Nordic.
 * Não é a REPL (ver boot.py): o app escreve um comando por linha,
 * "<id> <letra><resto>\n", e lê a resposta "<id> <texto>" no valor do TX.
 */

const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // app -> placa
const NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // placa -> app (lido pelo app)
const NUS_MON = "6e400004-b5a3-f393-e0a9-e50e24dcca9e"; // última leitura do monitor de entradas

/** Pedaço que cabe em qualquer ligação (pacote mínimo do BLE: 23 - 3 de cabeçalho). */
const SAFE_CHUNK = 20;
/** Depois de um envio a placa volta em ~1-2 s; trocar de fonte (cabo -> power bank) leva mais. */
const RECONNECT_MS = 60000;
/** Limite para abrir a ligação (conectar, ler serviços, perguntar à placa). */
const OPEN_MS = 10000;
/** Intervalo entre leituras da resposta. */
const POLL_MS = 100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const bleSupported = "bluetooth" in navigator;

/** A ligação caiu antes da resposta chegar (ex.: a placa reiniciou depois de gravar). */
export class BleDropped extends Error {}

/** Ao reconectar sozinho: a placa já está ligada a outro aparelho (que a tomou). */
export class BleBusy extends Error {}

/** Abre a lista do Chrome com as placas por perto. Precisa ser chamada num clique. */
export function requestBleDevice(): Promise<BluetoothDevice> {
  return navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: "Beta-" }, { services: [NUS_SERVICE] }],
    optionalServices: [NUS_SERVICE],
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("tempo esgotado")), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export class BleLink {
  /** A ligação caiu e o app está tentando voltar (ex.: a placa reiniciou). */
  onReconnecting: (() => void) | null = null;
  onReconnected: (() => void) | null = null;
  /** Não deu para voltar: a placa sumiu, ou outro aparelho conectou nela (`busy`). */
  onLost: ((busy: boolean) => void) | null = null;
  /** Passo da abertura em andamento (para mostrar onde travou). */
  onStep: ((step: string) => void) | null = null;

  private rx: BluetoothRemoteGATTCharacteristic | null = null;
  private tx: BluetoothRemoteGATTCharacteristic | null = null;
  private mon: BluetoothRemoteGATTCharacteristic | null = null;
  private closing = false;
  private reconnecting = false;
  /** Só reconecta sozinho depois da primeira abertura (antes disso quem tenta é o connectBle). */
  private opened = false;
  /** Comandos esperam isto: fica pendente enquanto reconecta. */
  private ready: Promise<void> = Promise.resolve();
  /** O BLE só aceita uma operação por vez: cada escrita ou leitura vai em fila. */
  private queue: Promise<unknown> = Promise.resolve();
  /**
   * Comandos com resposta, um de cada vez (a resposta de um sobrescreveria a do
   * outro no TX). Enquanto um espera a resposta a fila fica livre: teclas passam na frente.
   */
  private exchange: Promise<unknown> = Promise.resolve();
  /** Tamanho das escritas: a placa conta o pacote combinado na resposta ao "?". */
  private chunk = SAFE_CHUNK;
  private nextId = 1;

  constructor(readonly device: BluetoothDevice) {
    device.addEventListener("gattserverdisconnected", this.handleDisconnect);
  }

  get chunkSize(): number {
    return this.chunk;
  }

  get name(): string {
    return this.device.name ?? "placa";
  }

  /** Abre a ligação; se algum passo travar, desiste e diz qual foi. */
  async open(): Promise<void> {
    let step = "conectar";
    let desistiu = false;
    const passo = (nome: string) => { step = nome; this.onStep?.(nome); };
    const passos = async () => {
      passo("conectar");
      const server = await this.device.gatt!.connect();
      passo("ler os serviços");
      const service = await server.getPrimaryService(NUS_SERVICE);
      const tx = await service.getCharacteristic(NUS_TX);
      const rx = await service.getCharacteristic(NUS_RX);
      // boot.py sem monitor pelo Bluetooth: o resto funciona
      const mon = await service.getCharacteristic(NUS_MON).catch(() => null);
      if (!tx.properties.read) {
        throw new Error("a placa tem um boot.py antigo — envie um programa pelo cabo uma vez para atualizar");
      }
      if (this.closing) throw new Error("desconectado");
      passo("perguntar à placa");
      // "?" toma a placa de quem estiver ligado; "?r" (reconexão sozinha) não
      const resp = await this.ask(rx, tx, this.opened ? "?r" : "?", undefined, SAFE_CHUNK, 3000);
      if (resp === "ocupada") throw new BleBusy("a placa está conectada em outro aparelho");
      const m = /mtu=(\d+)/.exec(resp);
      const mtu = m ? Number(m[1]) : 0;
      if (desistiu) return;
      this.chunk = mtu > 3 ? Math.min(mtu - 3, 512) : SAFE_CHUNK;
      this.rx = rx;
      this.tx = tx;
      this.mon = mon;
      this.opened = true;
    };
    try {
      await withTimeout(passos(), OPEN_MS);
    } catch (err) {
      desistiu = true;
      try { this.device.gatt?.disconnect(); } catch { /* ignore */ }
      if (err instanceof BleBusy) throw err;
      throw new Error(`${step}: ${(err as Error).message}`);
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    this.device.removeEventListener("gattserverdisconnected", this.handleDisconnect);
    this.rx = null;
    this.tx = null;
    this.mon = null;
    try { this.device.gatt?.disconnect(); } catch { /* ignore */ }
  }

  /** Última leitura do monitor de entradas (JSON), ou null se não houver. */
  readMonitor(): Promise<string | null> {
    if (!this.mon || this.reconnecting) return Promise.resolve(null);
    return this.gatt(async () => {
      if (!this.mon) return null;
      const text = decoder.decode(await this.mon.readValue());
      return text || null;
    });
  }

  /** Uma operação do BLE, na vez dela. */
  private gatt<T>(op: () => Promise<T>): Promise<T> {
    const job = this.queue.then(op);
    this.queue = job.catch(() => {});
    return job;
  }

  /**
   * Manda um comando (ex.: "P", "U123" + dados). Com `waitMs`, espera
   * a resposta da placa e a devolve; sem, só confirma que a escrita chegou.
   */
  command(cmd: string, opts: { payload?: Uint8Array; waitMs?: number } = {}): Promise<string> {
    const job = this.exchange.then(async () => {
      await this.ready;
      if (!this.rx || !this.tx) throw new Error("Placa não conectada.");
      return this.ask(this.rx, this.tx, cmd, opts.payload, this.chunk, opts.waitMs ?? 0);
    });
    this.exchange = job.catch(() => {});
    return job;
  }

  /**
   * Tecla: sem resposta e sem esperar confirmação (escrita "without response"),
   * passando na frente de quem está esperando resposta. Atraso mínimo nos jogos.
   */
  async key(name: string): Promise<void> {
    await this.ready;
    const rx = this.rx;
    if (!rx) throw new Error("Placa não conectada.");
    const data = encoder.encode(`${this.nextId++} K${name}\n`);
    await this.gatt(() =>
      rx.properties.writeWithoutResponse ? rx.writeValueWithoutResponse(data) : rx.writeValueWithResponse(data),
    );
  }

  private async ask(
    rx: BluetoothRemoteGATTCharacteristic,
    tx: BluetoothRemoteGATTCharacteristic,
    cmd: string,
    payload: Uint8Array | undefined,
    chunk: number,
    waitMs: number,
  ): Promise<string> {
    const id = String(this.nextId++);
    const head = encoder.encode(`${id} ${cmd}\n`);
    const data = new Uint8Array(head.length + (payload?.length ?? 0));
    data.set(head);
    if (payload) data.set(payload, head.length);
    // todos os pedaços numa vez só da fila: uma tecla no meio embaralharia o envio
    await this.gatt(async () => {
      for (let i = 0; i < data.length; i += chunk) {
        try {
          await rx.writeValueWithResponse(data.slice(i, i + chunk));
        } catch (err) {
          if (!this.device.gatt?.connected) throw new BleDropped("a ligação caiu");
          throw new Error(`${(err as Error).message} (pedaços de ${chunk} bytes; ${i} de ${data.length} enviados)`);
        }
      }
    });
    if (!waitMs) return "";
    const prefix = `${id} `;
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      let text: string;
      try {
        text = decoder.decode(await this.gatt(() => tx.readValue()));
      } catch (err) {
        if (!this.device.gatt?.connected) throw new BleDropped("a ligação caiu");
        throw err;
      }
      if (text.startsWith(prefix)) {
        const resp = text.slice(prefix.length);
        if (resp.startsWith("erro ")) throw new Error(`a placa respondeu: ${resp.slice(5)}`);
        return resp;
      }
    }
    throw new Error("a placa não respondeu");
  }

  private handleDisconnect = () => {
    // durante a reconexão, cada tentativa que falha também dispara este evento
    if (this.closing || this.reconnecting || !this.opened) return;
    this.reconnecting = true;
    this.rx = null;
    this.tx = null;
    this.mon = null;
    let settle!: (ok: boolean) => void;
    this.ready = new Promise<void>((resolve, reject) => {
      settle = (ok) => (ok ? resolve() : reject(new Error("Placa não conectada.")));
    });
    this.ready.catch(() => {});
    this.onReconnecting?.();
    void this.reconnect().then((result) => {
      this.reconnecting = false;
      settle(result === "ok");
      if (this.closing) return;
      if (result === "ok") this.onReconnected?.();
      else this.onLost?.(result === "busy");
    });
  };

  private async reconnect(): Promise<"ok" | "busy" | "lost"> {
    const deadline = Date.now() + RECONNECT_MS;
    while (!this.closing && Date.now() < deadline) {
      try {
        await this.open();
        // Desconectar no meio da tentativa: não deixa a placa presa a este aparelho
        if (this.closing) break;
        return "ok";
      } catch (err) {
        if (err instanceof BleBusy) return "busy";
        await sleep(500);
      }
    }
    try { this.device.gatt?.disconnect(); } catch { /* ignore */ }
    return "lost";
  }
}
