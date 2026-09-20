/**
 * Gravação do firmware MicroPython via esptool-js.
 */
import { ESPLoader, Transport } from "esptool-js";

export interface FlashCallbacks {
  log: (line: string) => void;
  progress: (written: number, total: number) => void;
}

export async function loadFirmware(): Promise<Uint8Array> {
  const url = new URL("./firmware/micropython-esp32s3.bin", document.baseURI);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Não foi possível carregar o firmware (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function flashMicroPython(
  port: SerialPort,
  firmware: Uint8Array,
  cb: FlashCallbacks,
): Promise<string> {
  const transport = new Transport(port, false);
  const loader = new ESPLoader({
    transport,
    baudrate: 460800,
    terminal: {
      clean: () => {},
      writeLine: (l) => cb.log(l),
      write: (l) => cb.log(l),
    },
  });

  try {
    const chip = await loader.main();
    if (!chip.includes("ESP32-S3")) {
      throw new Error(`Chip detectado: ${chip}. Este programa é só para ESP32-S3.`);
    }
    await loader.writeFlash({
      fileArray: [{ data: firmware, address: 0x0 }],
      flashMode: "keep",
      flashFreq: "keep",
      flashSize: "keep",
      eraseAll: true,
      compress: true,
      reportProgress: (_i, written, total) => cb.progress(written, total),
    });
    await loader.after("hard_reset");
    return chip;
  } finally {
    try { await transport.disconnect(); } catch { /* ignore */ }
  }
}
