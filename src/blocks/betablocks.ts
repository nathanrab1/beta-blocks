import * as Blockly from "blockly";
import { pythonGenerator, Order } from "blockly/python";
import { openDrawEditor, bitmapToDataUrl, emptyBitmapB64 } from "../drawEditor";

const EVENT_COLOUR = 45;
const LED_COLOUR = 10;
const TIME_COLOUR = 40;
const CONTROL_COLOUR = 120;
const PORT_COLOUR = 200;
const INPUT_COLOUR = 160;
const OLED_COLOUR = 260;
const WIFI_COLOUR = 290;
const GAME_COLOUR = 330;

// Cores nomeadas usadas pelo bloco "acender LED cor"
const NAMED_COLORS: Record<string, [number, number, number]> = {
  VERMELHO: [255, 0, 0],
  VERDE: [0, 255, 0],
  AZUL: [0, 0, 255],
  AMARELO: [255, 180, 0],
  CIANO: [0, 255, 255],
  MAGENTA: [255, 0, 255],
  LARANJA: [255, 80, 0],
  ROXO: [128, 0, 255],
  BRANCO: [255, 255, 255],
};

/** Teclas do bloco "quando apertar a tecla": [texto, nome enviado à placa]. */
export const KEY_OPTIONS: [string, string][] = [
  ["espaço", "space"],
  ["↑ cima", "up"],
  ["↓ baixo", "down"],
  ["← esquerda", "left"],
  ["→ direita", "right"],
  ["Enter", "enter"],
  ..."abcdefghijklmnopqrstuvwxyz0123456789".split("").map((c): [string, string] => [c, c]),
];

/** Marca de uma tecla enviada pela serial: "\x1d<nome>\n". */
export const KEY_MARK = "\x1d";

export function defineBlocks(): void {
  Blockly.defineBlocksWithJsonArray([
    {
      type: "event_start",
      message0: "ao iniciar",
      nextStatement: null,
      hat: "cap",
      colour: EVENT_COLOUR,
      tooltip: "Tudo que estiver pendurado aqui roda quando a placa liga. Blocos soltos não rodam.",
    },
    {
      type: "event_key",
      message0: "quando apertar a tecla %1",
      args0: [{ type: "field_dropdown", name: "KEY", options: KEY_OPTIONS }],
      nextStatement: null,
      hat: "cap",
      colour: EVENT_COLOUR,
      tooltip: "Roda os blocos pendurados quando essa tecla é apertada no computador (com a placa conectada).",
    },
    {
      type: "event_key_wifi",
      message0: "quando apertar a tecla %1 pelo Wi-Fi",
      args0: [{ type: "field_dropdown", name: "KEY", options: KEY_OPTIONS }],
      nextStatement: null,
      hat: "cap",
      colour: WIFI_COLOUR,
      tooltip: "Igual ao 'quando apertar a tecla', mas a tecla vai do computador para a placa pela rede, sem cabo.",
    },
    {
      type: "event_wifi",
      message0: "quando receber %1 pelo Wi-Fi",
      args0: [{ type: "field_input", name: "NAME", text: "botão 1" }],
      nextStatement: null,
      hat: "cap",
      colour: WIFI_COLOUR,
      tooltip: "Vira um botão na página de controle do celular. Roda os blocos pendurados quando o botão é apertado.",
    },
    {
      type: "wifi_connect",
      message0: "conectar no Wi-Fi  rede %1  senha %2",
      args0: [
        { type: "field_input", name: "SSID", text: "MinhaRede" },
        { type: "field_input", name: "PASS", text: "senha" },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: WIFI_COLOUR,
      tooltip: "Entra na rede Wi-Fi e liga a página de controle. Use uma vez, no começo do programa.",
    },
    {
      type: "wifi_ip",
      message0: "endereço do Wi-Fi",
      output: "String",
      colour: WIFI_COLOUR,
      tooltip: "O endereço (IP) da placa na rede, para abrir no celular. Vazio se não conectou.",
    },
    {
      type: "led_rgb",
      message0: "acender LED %1 verde %2 azul %3",
      args0: [
        { type: "input_value", name: "R", check: "Number" },
        { type: "input_value", name: "G", check: "Number" },
        { type: "input_value", name: "B", check: "Number" },
      ],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      colour: LED_COLOUR,
      tooltip: "Acende o LED RGB com a intensidade de cada cor (0 a 255).",
    },
    {
      type: "led_color",
      message0: "acender LED cor %1",
      args0: [
        {
          type: "field_dropdown",
          name: "COLOR",
          options: [
            ["vermelho", "VERMELHO"],
            ["verde", "VERDE"],
            ["azul", "AZUL"],
            ["amarelo", "AMARELO"],
            ["ciano", "CIANO"],
            ["magenta", "MAGENTA"],
            ["laranja", "LARANJA"],
            ["roxo", "ROXO"],
            ["branco", "BRANCO"],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: LED_COLOUR,
      tooltip: "Acende o LED RGB com uma cor pronta.",
    },
    {
      type: "led_off",
      message0: "apagar LED",
      previousStatement: null,
      nextStatement: null,
      colour: LED_COLOUR,
      tooltip: "Apaga o LED RGB.",
    },
    {
      type: "wait_ms",
      message0: "esperar %1 %2",
      args0: [
        { type: "input_value", name: "TIME", check: "Number" },
        {
          type: "field_dropdown",
          name: "UNIT",
          options: [
            ["milissegundos", "MS"],
            ["segundos", "S"],
          ],
        },
      ],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      colour: TIME_COLOUR,
      tooltip: "Pausa o programa pelo tempo indicado.",
    },
    {
      type: "port_onoff",
      message0: "%1 porta %2",
      args0: [
        {
          type: "field_dropdown",
          name: "STATE",
          options: [
            ["ligar", "ON"],
            ["desligar", "OFF"],
          ],
        },
        { type: "field_number", name: "PIN", value: 1, min: 0, max: 48, precision: 1 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: PORT_COLOUR,
      tooltip: "Liga (3,3 V) ou desliga (0 V) uma porta GPIO.",
    },
    {
      type: "port_pwm",
      message0: "porta %1 intensidade %2 %%",
      args0: [
        { type: "field_number", name: "PIN", value: 1, min: 0, max: 48, precision: 1 },
        { type: "input_value", name: "PCT", check: "Number" },
      ],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      colour: PORT_COLOUR,
      tooltip: "Controla a intensidade de uma porta de 0 a 100% (PWM).",
    },
    {
      type: "input_digital",
      message0: "porta %1 está ligada?",
      args0: [{ type: "field_number", name: "PIN", value: 1, min: 0, max: 48, precision: 1 }],
      output: "Boolean",
      colour: INPUT_COLOUR,
      tooltip: "Verdadeiro se a porta estiver recebendo 3,3 V (botão apertado, sensor ativo).",
    },
    {
      type: "input_analog",
      message0: "ler porta %1 (0 a 100%%)",
      args0: [{ type: "field_number", name: "PIN", value: 1, min: 1, max: 20, precision: 1 }],
      output: "Number",
      colour: INPUT_COLOUR,
      tooltip: "Lê um valor analógico (potenciômetro, LDR…) como porcentagem. Só portas 1 a 20.",
    },
    {
      type: "input_if",
      message0: "se a porta %1 estiver %2 %3 faça %4",
      args0: [
        { type: "field_number", name: "PIN", value: 1, min: 0, max: 48, precision: 1 },
        {
          type: "field_dropdown",
          name: "STATE",
          options: [
            ["ligada", "ON"],
            ["desligada", "OFF"],
          ],
        },
        { type: "input_dummy" },
        { type: "input_statement", name: "DO" },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: INPUT_COLOUR,
      tooltip: "Executa os blocos de dentro se a porta estiver no estado escolhido.",
    },
    {
      type: "input_ifelse",
      message0: "se a porta %1 estiver %2 %3 faça %4 senão %5",
      args0: [
        { type: "field_number", name: "PIN", value: 1, min: 0, max: 48, precision: 1 },
        {
          type: "field_dropdown",
          name: "STATE",
          options: [
            ["ligada", "ON"],
            ["desligada", "OFF"],
          ],
        },
        { type: "input_dummy" },
        { type: "input_statement", name: "DO" },
        { type: "input_statement", name: "ELSE" },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: INPUT_COLOUR,
      tooltip: "Executa 'faça' se a porta estiver no estado escolhido; caso contrário executa 'senão'.",
    },
    {
      type: "show_value",
      message0: "mostrar %1",
      args0: [{ type: "input_value", name: "VALUE" }],
      previousStatement: null,
      nextStatement: null,
      colour: INPUT_COLOUR,
      tooltip: "Mostra o valor no Console do Beta Blocks.",
    },
    {
      type: "oled_config",
      message0: "visor OLED %1  SDA %2  SCL %3",
      args0: [
        {
          type: "field_dropdown",
          name: "SIZE",
          options: [
            ["128x64", "128x64"],
            ["128x32", "128x32"],
          ],
        },
        { type: "field_number", name: "SDA", value: 8, min: 0, max: 48, precision: 1 },
        { type: "field_number", name: "SCL", value: 9, min: 0, max: 48, precision: 1 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: OLED_COLOUR,
      tooltip: "Liga o visor OLED I2C nos pinos escolhidos. Use uma vez, no começo do programa.",
    },
    {
      type: "oled_text",
      message0: "mostrar no visor %1 na linha %2",
      args0: [
        { type: "input_value", name: "TEXT" },
        {
          type: "field_dropdown",
          name: "LINE",
          options: [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"], ["7", "7"], ["8", "8"]],
        },
      ],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      colour: OLED_COLOUR,
      tooltip: "Escreve um texto (ou número) a partir de uma linha do visor. Textos longos quebram em várias linhas, sem cortar palavras.",
    },
    {
      type: "oled_plot",
      message0: "plotar no visor %1",
      args0: [{ type: "input_value", name: "VALUE", check: "Number" }],
      previousStatement: null,
      nextStatement: null,
      colour: OLED_COLOUR,
      tooltip:
        "Desenha um gráfico do valor (0 a 100%) ao longo do tempo. Cada vez que o bloco roda, adiciona um ponto; " +
        "use dentro de 'repetir para sempre' com um 'esperar'.",
    },
    {
      type: "oled_clear",
      message0: "limpar visor",
      previousStatement: null,
      nextStatement: null,
      colour: OLED_COLOUR,
      tooltip: "Apaga tudo que está no visor.",
    },
    {
      type: "oled_snake",
      message0: "🐍 jogo da cobrinha",
      previousStatement: null,
      colour: GAME_COLOUR,
      tooltip:
        "Inicia o jogo da cobrinha no visor. Controle com as setas do teclado (pelo cabo ou pelo Wi-Fi). " +
        "Coloque depois de 'iniciar visor' e 'conectar no Wi-Fi'. O jogo roda para sempre.",
    },
    {
      type: "game_speed",
      message0: "velocidade do jogo %1",
      args0: [{ type: "field_number", name: "SPEED", value: 5, min: 1, max: 10, precision: 1 }],
      previousStatement: null,
      nextStatement: null,
      colour: GAME_COLOUR,
      tooltip: "Velocidade inicial dos jogos, de 1 (bem lenta) a 10 (bem rápida). 5 é a normal. Coloque antes do bloco do jogo.",
    },
    {
      type: "oled_flappy",
      message0: "🐤 jogo do passarinho (flappy)",
      previousStatement: null,
      colour: GAME_COLOUR,
      tooltip:
        "Flappy Bird no visor: ↑ ou espaço bate as asas para passar entre os canos. " +
        "Teclas pelo cabo ou pelo Wi-Fi. Coloque depois de 'iniciar visor' e 'conectar no Wi-Fi'. O jogo roda para sempre.",
    },
    {
      type: "oled_dino",
      message0: "🦖 jogo do dinossauro",
      previousStatement: null,
      colour: GAME_COLOUR,
      tooltip:
        "O jogo do dinossauro do Chrome no visor: ↑ ou espaço pula os cactos, ↓ agacha dos pássaros. " +
        "Teclas pelo cabo ou pelo Wi-Fi. Coloque depois de 'iniciar visor' e 'conectar no Wi-Fi'. O jogo roda para sempre.",
    },
    {
      type: "forever",
      message0: "repetir para sempre %1 %2",
      args0: [
        { type: "input_dummy" },
        { type: "input_statement", name: "DO" },
      ],
      previousStatement: null,
      colour: CONTROL_COLOUR,
      tooltip: "Repete os blocos de dentro sem parar.",
    },
  ]);

  defineDrawBlock();

  // ---- Geradores Python ----

  pythonGenerator.forBlock["oled_draw"] = (block) => {
    return `visor_desenho('${(block as DrawBlock).bitmapB64}')\n`;
  };

  pythonGenerator.forBlock["event_start"] = () => "";
  pythonGenerator.forBlock["event_key"] = () => "";
  pythonGenerator.forBlock["event_key_wifi"] = () => "";
  pythonGenerator.forBlock["event_wifi"] = () => "";

  pythonGenerator.forBlock["wifi_connect"] = (block) => {
    const ssid = JSON.stringify(block.getFieldValue("SSID"));
    const pass = JSON.stringify(block.getFieldValue("PASS"));
    return `wifi_iniciar(${ssid}, ${pass})\n`;
  };

  pythonGenerator.forBlock["wifi_ip"] = () => ["_wifi_ip", Order.ATOMIC];

  pythonGenerator.forBlock["led_rgb"] = (block, gen) => {
    const r = gen.valueToCode(block, "R", Order.NONE) || "0";
    const g = gen.valueToCode(block, "G", Order.NONE) || "0";
    const b = gen.valueToCode(block, "B", Order.NONE) || "0";
    return `led_rgb(${r}, ${g}, ${b})\n`;
  };

  pythonGenerator.forBlock["led_color"] = (block) => {
    const [r, g, b] = NAMED_COLORS[block.getFieldValue("COLOR")] ?? [0, 0, 0];
    return `led_rgb(${r}, ${g}, ${b})\n`;
  };

  pythonGenerator.forBlock["led_off"] = () => "led_rgb(0, 0, 0)\n";

  pythonGenerator.forBlock["wait_ms"] = (block, gen) => {
    const t = gen.valueToCode(block, "TIME", Order.NONE) || "0";
    return block.getFieldValue("UNIT") === "S"
      ? `time.sleep(${t})\n`
      : `time.sleep_ms(int(${t}))\n`;
  };

  pythonGenerator.forBlock["port_onoff"] = (block) => {
    const pin = block.getFieldValue("PIN");
    const on = block.getFieldValue("STATE") === "ON" ? "1" : "0";
    return `porta_ligar(${pin}, ${on})\n`;
  };

  pythonGenerator.forBlock["port_pwm"] = (block, gen) => {
    const pin = block.getFieldValue("PIN");
    const pct = gen.valueToCode(block, "PCT", Order.NONE) || "0";
    return `porta_pwm(${pin}, ${pct})\n`;
  };

  pythonGenerator.forBlock["input_digital"] = (block) => {
    return [`porta_ler(${block.getFieldValue("PIN")})`, Order.FUNCTION_CALL];
  };

  pythonGenerator.forBlock["input_analog"] = (block) => {
    return [`porta_analogica(${block.getFieldValue("PIN")})`, Order.FUNCTION_CALL];
  };

  const inputCondition = (block: Blockly.Block) => {
    const pin = block.getFieldValue("PIN");
    return block.getFieldValue("STATE") === "ON" ? `porta_ler(${pin})` : `not porta_ler(${pin})`;
  };

  pythonGenerator.forBlock["input_if"] = (block, gen) => {
    const branch = gen.statementToCode(block, "DO") || gen.PASS;
    return `if ${inputCondition(block)}:\n${branch}`;
  };

  pythonGenerator.forBlock["input_ifelse"] = (block, gen) => {
    const branch = gen.statementToCode(block, "DO") || gen.PASS;
    const elseBranch = gen.statementToCode(block, "ELSE") || gen.PASS;
    return `if ${inputCondition(block)}:\n${branch}else:\n${elseBranch}`;
  };

  pythonGenerator.forBlock["show_value"] = (block, gen) => {
    const v = gen.valueToCode(block, "VALUE", Order.NONE) || "''";
    return `print(${v})\n`;
  };

  pythonGenerator.forBlock["oled_config"] = (block) => {
    const [w, h] = block.getFieldValue("SIZE").split("x");
    return `visor_iniciar(${block.getFieldValue("SDA")}, ${block.getFieldValue("SCL")}, ${w}, ${h})\n`;
  };

  pythonGenerator.forBlock["oled_text"] = (block, gen) => {
    const text = gen.valueToCode(block, "TEXT", Order.NONE) || "''";
    return `visor_texto(${text}, ${block.getFieldValue("LINE")})\n`;
  };

  pythonGenerator.forBlock["oled_plot"] = (block, gen) => {
    const v = gen.valueToCode(block, "VALUE", Order.NONE) || "0";
    return `visor_grafico(${v})\n`;
  };
  pythonGenerator.forBlock["oled_clear"] = () => "visor_limpar()\n";
  pythonGenerator.forBlock["oled_snake"] = () => "visor_cobrinha()\n";
  pythonGenerator.forBlock["oled_dino"] = () => "visor_dino()\n";
  pythonGenerator.forBlock["oled_flappy"] = () => "visor_flappy()\n";
  pythonGenerator.forBlock["game_speed"] = (block) => {
    const v = Math.min(10, Math.max(1, Number(block.getFieldValue("SPEED")) || 5));
    return `_jogo_velocidade = ${v}\n`;
  };

  pythonGenerator.forBlock["forever"] = (block, gen) => {
    const branch = gen.statementToCode(block, "DO") || gen.PASS;
    return `while True:\n${branch}`;
  };
}

/**
 * Código que "zera" a placa: apaga o LED RGB, desliga PWMs e o monitor,
 * apaga o visor e solta as portas (entrada, sem pull). Roda na REPL,
 * no mesmo namespace do main.py, por isso enxerga _pwms, _bb_timer e oled.
 */
export function resetBoardCode(ledPin: number): string {
  // GPIOs livres do ESP32-S3 (fora USB 19/20, flash/PSRAM 26-32 e 35-37, strapping 0/45/46)
  const pins = [
    ...Array.from({ length: 18 }, (_, i) => i + 1),
    21,
    ...Array.from({ length: 12 }, (_, i) => i + 33),
    47,
    48,
  ].filter((p) => p !== ledPin);
  return [
    "from machine import Pin",
    "from neopixel import NeoPixel",
    "try:",
    "    _bb_timer.deinit()",
    "except Exception:",
    "    pass",
    "try:",
    "    _vis_timer.deinit()",
    "except Exception:",
    "    pass",
    "try:",
    "    _key_timer.deinit()",
    "except Exception:",
    "    pass",
    "try:",
    "    _wifi_timer.deinit()",
    "    _wifi_srv.close()",
    "except Exception:",
    "    pass",
    "try:",
    "    for _x in _pwms.values():",
    "        _x.deinit()",
    "    _pwms.clear()",
    "except Exception:",
    "    pass",
    "try:",
    "    oled.fill(0)",
    "    oled.show()",
    "except Exception:",
    "    pass",
    "try:",
    `    _np = NeoPixel(Pin(${ledPin}, Pin.OUT), 1)`,
    "    _np[0] = (0, 0, 0)",
    "    _np.write()",
    "except Exception:",
    "    pass",
    `for _p in [${pins.join(", ")}]:`,
    "    try:",
    "        Pin(_p, Pin.IN)",
    "    except Exception:",
    "        pass",
    "",
  ].join("\n");
}

// ---- bloco "desenhar no visor" ----

type DrawBlock = Blockly.Block & { bitmapB64: string };

const EDIT_BUTTON_SRC =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="66" height="24">' +
      '<rect x="0.5" y="0.5" width="65" height="23" rx="6" fill="#fff" stroke="#8a8f99"/>' +
      '<text x="33" y="16" font-family="sans-serif" font-size="12" font-weight="600" text-anchor="middle" fill="#333">✎ Editar</text>' +
      "</svg>",
  );

function defineDrawBlock() {
  Blockly.Blocks["oled_draw"] = {
    init(this: DrawBlock) {
      this.bitmapB64 = emptyBitmapB64();
      const preview = new Blockly.FieldImage(bitmapToDataUrl(this.bitmapB64), 96, 48, "desenho");
      const editButton = new Blockly.FieldImage(EDIT_BUTTON_SRC, 66, 24, "editar", () => {
        if (this.isInFlyout) return;
        void openDrawEditor(this.bitmapB64).then((result) => {
          if (result === null) return;
          const old = this.bitmapB64;
          this.bitmapB64 = result;
          preview.setValue(bitmapToDataUrl(result));
          // evento de mutação: dispara regeneração do código e salva o projeto
          Blockly.Events.fire(
            new Blockly.Events.BlockChange(
              this, "mutation", null, JSON.stringify({ bitmap: old }), JSON.stringify({ bitmap: result }),
            ),
          );
        });
      });
      this.appendDummyInput()
        .appendField("desenhar no visor")
        .appendField(preview, "PREVIEW")
        .appendField(editButton, "EDIT");
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(OLED_COLOUR);
      this.setTooltip("Mostra um desenho no visor. Clique em Editar para desenhar.");
    },
    saveExtraState(this: DrawBlock) {
      return { bitmap: this.bitmapB64 };
    },
    loadExtraState(this: DrawBlock, state: { bitmap?: string }) {
      this.bitmapB64 = state.bitmap || emptyBitmapB64();
      (this.getField("PREVIEW") as Blockly.FieldImage).setValue(bitmapToDataUrl(this.bitmapB64));
    },
  };
}

/** Cabeçalho fixo do programa: imports e função auxiliar do LED. */
export function preamble(pin: number): string {
  return [
    "from machine import Pin, PWM, ADC, Timer",
    "from neopixel import NeoPixel",
    "import time",
    "",
    `np = NeoPixel(Pin(${pin}, Pin.OUT), 1)`,
    "",
    "def led_rgb(r, g, b):",
    "    np[0] = (int(r), int(g), int(b))",
    "    np.write()",
    "",
    "led_rgb(0, 0, 0)  # comeca sempre com o LED apagado",
    "",
    "_pwms = {}",
    "",
    "def porta_ligar(n, on):",
    "    if n in _pwms:",
    "        _pwms.pop(n).deinit()",
    "    Pin(n, Pin.OUT).value(on)",
    "",
    "def porta_pwm(n, pct):",
    "    pct = max(0, min(100, pct))",
    "    if n not in _pwms:",
    "        _pwms[n] = PWM(Pin(n), freq=1000)",
    "    _pwms[n].duty_u16(int(pct * 65535 // 100))",
    "",
    "_adcs = {}",
    "",
    "def porta_ler(n):",
    "    return Pin(n, Pin.IN, Pin.PULL_DOWN).value() == 1",
    "",
    "def porta_analogica(n):",
    "    if n not in _adcs:",
    "        _adcs[n] = ADC(Pin(n), atten=ADC.ATTN_11DB)",
    "    return _adcs[n].read_u16() * 100 // 65535",
    "",
    "",
  ].join("\n");
}

const HAT_TYPES = ["event_start", "event_key", "event_key_wifi", "event_wifi"];
const WIFI_BLOCK_TYPES = ["event_wifi", "wifi_connect", "wifi_ip"];

/** Teclas usadas pelos blocos de um tipo ("event_key" = cabo, "event_key_wifi" = rede). */
export function keysOfType(workspace: Blockly.Workspace, type: "event_key" | "event_key_wifi"): Set<string> {
  return new Set(
    workspace.getTopBlocks(false).filter((b) => b.type === type).map((b) => b.getFieldValue("KEY") as string),
  );
}

/** Nomes dos blocos "quando receber ... pelo Wi-Fi" do programa, na ordem. */
export function wifiEventNames(workspace: Blockly.Workspace): string[] {
  return workspace
    .getTopBlocks(true)
    .filter((b) => b.type === "event_wifi")
    .map((b) => b.getFieldValue("NAME") as string);
}

export function usesWifi(workspace: Blockly.Workspace): boolean {
  return programBlocks(workspace).some((b) => WIFI_BLOCK_TYPES.includes(b.type));
}

/** Gera o código só das pilhas penduradas em eventos; blocos soltos são ignorados. */
export function programCode(workspace: Blockly.Workspace): string {
  pythonGenerator.init(workspace);
  const tops = workspace.getTopBlocks(true);
  let code = "";

  // "quando apertar a tecla": cada pilha vira uma função registrada em _teclas
  const keyHats = tops.filter((b) => b.type === "event_key" || b.type === "event_key_wifi");
  const hasWifiHats = tops.some((b) => b.type === "event_wifi");
  const jogos = gameKeys(workspace).size > 0;
  if (keyHats.length > 0 || hasWifiHats || jogos) code += keysRuntimeCode();
  if (jogos) code += gamesCode(workspace);
  keyHats.forEach((hat, i) => {
    const next = hat.getNextBlock();
    let body = next ? pythonGenerator.blockToCode(next) : "";
    if (Array.isArray(body)) body = body[0];
    const key = hat.getFieldValue("KEY");
    code += `def _tecla_${i}():\n${pythonGenerator.prefixLines(body || pythonGenerator.PASS, pythonGenerator.INDENT)}`;
    code += `_teclas[${JSON.stringify(key)}] = _tecla_${i}\n\n`;
  });

  // "quando receber ... pelo Wi-Fi": cada pilha vira um botão na página de controle
  const wifiHats = tops.filter((b) => b.type === "event_wifi");
  if (usesWifi(workspace)) code += wifiRuntimeCode();
  wifiHats.forEach((hat, i) => {
    const next = hat.getNextBlock();
    let body = next ? pythonGenerator.blockToCode(next) : "";
    if (Array.isArray(body)) body = body[0];
    const name = hat.getFieldValue("NAME");
    code += `def _wifi_${i}():\n${pythonGenerator.prefixLines(body || pythonGenerator.PASS, pythonGenerator.INDENT)}`;
    code += `_wifi_nomes.append(${JSON.stringify(name)})\n_wifi_funcs.append(_wifi_${i})\n\n`;
  });

  // "ao iniciar"
  for (const block of tops) {
    if (block.type !== "event_start") continue;
    let c = pythonGenerator.blockToCode(block);
    if (Array.isArray(c)) c = c[0];
    if (c) code += c;
  }

  // com teclas ou Wi-Fi, o programa precisa continuar vivo para receber os eventos
  if (keyHats.length > 0 || wifiHats.length > 0) {
    code += "\n# espera os eventos\nwhile True:\n    time.sleep_ms(100)\n";
  }
  return pythonGenerator.finish(code);
}

/** Marca de status do Wi-Fi na serial: "\x1c{"ip": ...}" ou "\x1c{"erro": ...}". */
export const WIFI_MARK = "\x1c";

/** Página de controle servida pela placa (um botão por evento). */
const WIFI_PAGE =
  "<!doctype html><html lang=pt-BR><head><meta charset=utf-8>" +
  '<meta name=viewport content="width=device-width,initial-scale=1"><title>Beta Blocks</title>' +
  "<style>body{font-family:sans-serif;background:#f4f5f7;margin:0;padding:16px;user-select:none;-webkit-user-select:none;touch-action:manipulation}" +
  "h1{font-size:18px;color:#555}button{display:block;box-sizing:border-box;width:100%;font-size:22px;padding:18px;margin:10px 0;" +
  "border:0;border-radius:12px;background:#2f80ed;color:#fff}button:active{background:#1f6dd6}" +
  // teclado: direcional em grade 3x3 + botões das outras teclas
  ".pad{display:grid;grid-template-columns:repeat(3,76px);gap:8px;justify-content:center;margin:18px 0}" +
  ".pad button{margin:0;height:76px;padding:0;font-size:32px;background:#444}.pad button:active{background:#222}" +
  ".keys button{background:#27ae60}.keys button:active{background:#1e8449}</style></head>" +
  "<body><h1>Beta Blocks</h1>{BOTOES}<div id=teclado></div><script>" +
  "document.querySelectorAll('.ev').forEach((b,i)=>b.onclick=()=>fetch('/b?i='+i));" +
  "var T={TECLAS},S={up:'\u25b2',down:'\u25bc',left:'\u25c0',right:'\u25b6',space:'espa\u00e7o'},P=[,'up',,'left','down','right'];" +
  "function bt(n,c){var b=document.createElement('button');b.textContent=S[n]||n;b.className=c||'';" +
  "b.onpointerdown=function(e){e.preventDefault();fetch('/k?n='+encodeURIComponent(n))};return b}" +
  "var d=document.getElementById('teclado'),A=['up','down','left','right'];" +
  "if(T.some(function(n){return A.indexOf(n)>=0})){var g=document.createElement('div');g.className='pad';" +
  "for(var i=0;i<6;i++){var n=P[i];if(n&&T.indexOf(n)>=0)g.appendChild(bt(n));else g.appendChild(document.createElement('span'))}d.appendChild(g)}" +
  "var o=T.filter(function(n){return A.indexOf(n)<0});if(o.length){var k=document.createElement('div');k.className='keys';" +
  "o.forEach(function(n){k.appendChild(bt(n))});d.appendChild(k)}" +
  "</script></body></html>";

/** Conexão Wi-Fi + servidor web mínimo, atendido por um timer (não bloqueia o programa). */
function wifiRuntimeCode(): string {
  return [
    "# --- Wi-Fi ---",
    "import network, socket",
    "import json as _json",
    "_wifi_nomes = []",
    "_wifi_funcs = []",
    "_wifi_srv = None",
    "_wifi_ip = ''",
    `_WIFI_PAGE = ${JSON.stringify(WIFI_PAGE)}`,
    "",
    "def _urldecode(b):",
    "    out = bytearray()",
    "    i = 0",
    "    while i < len(b):",
    "        if b[i] == 0x25 and i + 2 < len(b):  # %XX",
    "            out.append(int(b[i + 1:i + 3], 16))",
    "            i += 3",
    "        elif b[i] == 0x2B:  # +",
    "            out.append(0x20)",
    "            i += 1",
    "        else:",
    "            out.append(b[i])",
    "            i += 1",
    "    return bytes(out).decode()",
    "",
    "def _wifi_atender(t):",
    "    try:",
    "        cl, _ = _wifi_srv.accept()",
    "    except OSError:",
    "        return",
    "    try:",
    "        cl.settimeout(1.0)",
    "        # le o pedido inteiro: fechar com dados nao lidos faz o celular descartar a resposta",
    "        req = b''",
    "        while b'\\r\\n\\r\\n' not in req and len(req) < 4096:",
    "            parte = cl.recv(512)",
    "            if not parte:",
    "                break",
    "            req += parte",
    "        linha = req.split(b'\\r\\n', 1)[0]",
    "        if linha.startswith(b'GET /b?i='):",
    "            i = int(linha[9:].split(b' ')[0])",
    "            cl.write(b'HTTP/1.0 204 No Content\\r\\nConnection: close\\r\\n\\r\\n')",
    "            cl.close()",
    "            if 0 <= i < len(_wifi_funcs):",
    "                _wifi_funcs[i]()",
    "        elif linha.startswith(b'GET /b?n='):",
    "            nome = _urldecode(linha[9:].split(b' ')[0])",
    "            cl.write(b'HTTP/1.0 204 No Content\\r\\nAccess-Control-Allow-Origin: *\\r\\nConnection: close\\r\\n\\r\\n')",
    "            cl.close()",
    "            _wifi_disparar(nome)",
    "        elif linha.startswith(b'GET /k?n='):",
    "            nome = _urldecode(linha[9:].split(b' ')[0])",
    "            cl.write(b'HTTP/1.0 204 No Content\\r\\nConnection: close\\r\\n\\r\\n')",
    "            cl.close()",
    "            f = globals().get('_teclas', {}).get(nome)",
    "            if f:",
    "                f()",
    "        elif linha.startswith(b'GET / '):",
    "            botoes = ''.join('<button class=ev>%s</button>' % n for n in _wifi_nomes)",
    "            # teclado na pagina: as teclas que o programa (ou o jogo) esta esperando",
    "            teclas = list(globals().get('_teclas', {}).keys())",
    "            corpo = _WIFI_PAGE.replace('{BOTOES}', botoes).replace('{TECLAS}', _json.dumps(teclas)).encode()",
    "            cl.write(b'HTTP/1.0 200 OK\\r\\nContent-Type: text/html; charset=utf-8\\r\\nContent-Length: %d\\r\\nConnection: close\\r\\n\\r\\n' % len(corpo))",
    "            cl.write(corpo)",
    "        else:",
    "            cl.write(b'HTTP/1.0 404 Not Found\\r\\nConnection: close\\r\\n\\r\\n')",
    "    except Exception as e:",
    "        print('Wi-Fi: erro', e)",
    "    finally:",
    "        try:",
    "            cl.close()",
    "        except Exception:",
    "            pass",
    "",
    "def wifi_iniciar(ssid, senha):",
    "    global _wifi_srv, _wifi_ip, _wifi_timer",
    "    wlan = network.WLAN(network.STA_IF)",
    "    wlan.active(True)",
    "    try:",
    "        wlan.config(pm=network.WLAN.PM_NONE)  # sem economia de energia: responde sempre",
    "    except Exception:",
    "        pass",
    "    # o boot.py pode estar conectando na mesma rede: espera um pouco antes de reconectar",
    "    for _ in range(50):",
    "        if wlan.isconnected() or wlan.status() != network.STAT_CONNECTING:",
    "            break",
    "        time.sleep_ms(100)",
    "    if not wlan.isconnected():",
    "        wlan.connect(ssid, senha)",
    "        for _ in range(150):",
    "            if wlan.isconnected():",
    "                break",
    "            time.sleep_ms(100)",
    "    if not wlan.isconnected():",
    "        print('\\x1c' + _json.dumps({'erro': 'nao conectou na rede ' + ssid}))",
    "        return",
    "    try:",
    "        with open('wifi.json', 'w') as f:  # lembrado pelo boot.py para o envio por Wi-Fi",
    "            f.write(_json.dumps({'ssid': ssid, 'senha': senha}))",
    "    except Exception:",
    "        pass",
    "    _wifi_ip = wlan.ifconfig()[0]",
    "    print('\\x1c' + _json.dumps({'ip': _wifi_ip}))",
    "    if _wifi_srv is None:",
    "        s = socket.socket()",
    "        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)",
    "        s.bind(('0.0.0.0', 80))",
    "        s.listen(2)",
    "        s.setblocking(False)",
    "        _wifi_srv = s",
    "        _wifi_timer = Timer(0)",
    "        _wifi_timer.init(period=50, mode=Timer.PERIODIC, callback=_wifi_atender)",
    "",
    "",
  ].join("\n");
}

/** Leitor de teclas: um timer lê a serial e chama a função da tecla recebida. */
function keysRuntimeCode(): string {
  return [
    "# --- mensagens do computador (teclas e comandos de Wi-Fi pelo cabo) ---",
    "import sys, select",
    "_teclas = {}",
    "_tecla_buf = ''",
    "_tecla_poll = select.poll()",
    "_tecla_poll.register(sys.stdin, select.POLLIN)",
    "",
    "def _tecla_ler(t):",
    "    global _tecla_buf",
    "    while _tecla_poll.poll(0):",
    "        c = sys.stdin.read(1)",
    "        if c == '\\n':",
    "            nome, _tecla_buf = _tecla_buf, ''",
    "            if nome.startswith('\\x1d'):",
    "                nome = nome[1:]",
    "                if nome.startswith('wifi:'):",
    "                    _wifi_disparar(nome[5:])",
    "                else:",
    "                    f = _teclas.get(nome)",
    "                    if f:",
    "                        f()",
    "        else:",
    "            _tecla_buf += c",
    "",
    "def _wifi_disparar(nome):",
    "    try:",
    "        _wifi_funcs[_wifi_nomes.index(nome)]()",
    "    except (NameError, ValueError):",
    "        pass",
    "",
    "_key_timer = Timer(1)",
    "_key_timer.init(period=50, mode=Timer.PERIODIC, callback=_tecla_ler)",
    "",
    "",
  ].join("\n");
}

/** Blocos que fazem parte do programa (pendurados em algum evento). */
export function programBlocks(workspace: Blockly.Workspace): Blockly.Block[] {
  const result: Blockly.Block[] = [];
  for (const top of workspace.getTopBlocks(false)) {
    if (HAT_TYPES.includes(top.type)) result.push(...top.getDescendants(false));
  }
  return result;
}

export interface InputPins {
  analog: number[];
  digital: number[];
}

/** Portas usadas por blocos de entrada no workspace (sem repetição, ordenadas). */
export function collectInputPins(workspace: Blockly.Workspace): InputPins {
  const analog = new Set<number>();
  const digital = new Set<number>();
  for (const block of programBlocks(workspace)) {
    if (block.isInsertionMarker()) continue;
    const pin = Number(block.getFieldValue("PIN"));
    if (!Number.isFinite(pin)) continue;
    if (block.type === "input_analog") analog.add(pin);
    else if (block.type === "input_digital" || block.type === "input_if" || block.type === "input_ifelse") digital.add(pin);
  }
  const sort = (a: Set<number>) => [...a].sort((x, y) => x - y);
  return { analog: sort(analog), digital: sort(digital) };
}

/** Marca que inicia uma linha de monitor na serial (filtrada do console). */
export const MONITOR_MARK = "\x1e";

/**
 * Código que envia os valores das entradas pela serial 10x por segundo,
 * em segundo plano (Timer), sem atrapalhar o programa principal.
 */
export function monitorCode(pins: InputPins): string {
  if (pins.analog.length === 0 && pins.digital.length === 0) return "";
  return [
    "# --- monitor de entradas do Beta Blocks ---",
    "import json",
    `_mon_a = [${pins.analog.join(", ")}]`,
    `_mon_d = [${pins.digital.join(", ")}]`,
    "",
    "def _monitor(t):",
    "    v = {}",
    "    for n in _mon_a:",
    "        v['a%d' % n] = porta_analogica(n)",
    "    for n in _mon_d:",
    "        v['d%d' % n] = 1 if porta_ler(n) else 0",
    "    print('\\x1e' + json.dumps(v))",
    "",
    "try:",
    "    _bb_timer.deinit()",
    "except NameError:",
    "    pass",
    "_bb_timer = Timer(3)",
    "_bb_timer.init(period=100, mode=Timer.PERIODIC, callback=_monitor)",
    "",
    "",
  ].join("\n");
}

const OLED_BLOCK_TYPES = ["oled_config", "oled_text", "oled_plot", "oled_clear", "oled_draw", "oled_snake", "oled_dino", "oled_flappy"];

/** Jogos do visor e as teclas que cada um usa. */
const GAMES: Record<string, string[]> = {
  oled_snake: ["up", "down", "left", "right"],
  oled_dino: ["up", "down", "space"],
  oled_flappy: ["up", "space"],
  game_speed: [],
};

/** Teclas dos jogos presentes no programa (o app envia essas ao apertar). */
export function gameKeys(workspace: Blockly.Workspace): Set<string> {
  const keys = new Set<string>();
  for (const b of programBlocks(workspace)) for (const k of GAMES[b.type] ?? []) keys.add(k);
  return keys;
}

function usesGame(workspace: Blockly.Workspace, type: string): boolean {
  return programBlocks(workspace).some((b) => b.type === type);
}

/**
 * Código dos jogos usados no programa. As teclas chegam pelo leitor de teclas
 * (_teclas), tanto pelo cabo quanto pelo receptor Wi-Fi do boot.py.
 */
function gamesCode(workspace: Blockly.Workspace): string {
  let code = gamesCommonCode();
  if (usesGame(workspace, "oled_snake")) code += snakeCode();
  if (usesGame(workspace, "oled_dino")) code += dinoCode();
  if (usesGame(workspace, "oled_flappy")) code += flappyCode();
  return code;
}

function gamesCommonCode(): string {
  return [
    "# --- jogos ---",
    "import random",
    "_jogo_tecla = False  # alguma tecla do jogo foi apertada?",
    "_jogo_velocidade = 5  # 1..10, mudado pelo bloco 'velocidade do jogo'",
    "",
    "def _jogo_centro(txt, y):",
    "    oled.text(txt, max(0, (oled.width - len(txt) * 8) // 2), y, 1)",
    "",
    "# tela de titulo / fim de jogo: espera uma tecla do jogo",
    "def _jogo_esperar(titulo, sub, dica):",
    "    global _jogo_tecla",
    "    oled.fill(0)",
    "    alto = oled.height >= 64",
    "    _jogo_centro(titulo, 8 if alto else 0)",
    "    if sub:",
    "        _jogo_centro(sub, 26 if alto else 12)",
    "    _jogo_centro(dica, oled.height - (12 if alto else 8))",
    "    _visor_mostrar()",
    "    time.sleep_ms(500)",
    "    _jogo_tecla = False",
    "    while not _jogo_tecla:",
    "        time.sleep_ms(50)",
    "",
    "# sprite a partir de linhas de texto ('#' = pixel aceso) -> (framebuffer, largura, altura)",
    "def _jogo_sprite(linhas):",
    "    w, h = len(linhas[0]), len(linhas)",
    "    bw = (w + 7) // 8",
    "    b = bytearray(bw * h)",
    "    for y, l in enumerate(linhas):",
    "        for x, c in enumerate(l):",
    "            if c == '#':",
    "                b[y * bw + x // 8] |= 0x80 >> (x % 8)",
    "    return framebuf.FrameBuffer(b, w, h, framebuf.MONO_HLSB), w, h",
    "",
    "",
  ].join("\n");
}

function snakeCode(): string {
  return [
    "# --- jogo da cobrinha ---",
    "_COB_DIRS = {'up': (0, -1), 'down': (0, 1), 'left': (-1, 0), 'right': (1, 0)}",
    "_cob_dir = (1, 0)   # direcao atual",
    "_cob_prox = (1, 0)  # ultima seta apertada",
    "",
    "def _cob_seta(nome):",
    "    global _cob_prox, _jogo_tecla",
    "    _cob_prox = _COB_DIRS[nome]",
    "    _jogo_tecla = True",
    "",
    "def _cob_maca(cobra, w, h):",
    "    while True:",
    "        m = (random.randint(0, w - 1), random.randint(0, h - 1))",
    "        if m not in cobra:",
    "            return m",
    "",
    "def visor_cobrinha():",
    "    global _cob_dir, _cob_prox",
    "    _visor_garantir()",
    "    for n in _COB_DIRS:",
    "        _teclas[n] = (lambda k: lambda: _cob_seta(k))(n)",
    "    C = 4  # tamanho de cada casa, em pixels",
    "    # moldura de 1 px na borda (a parede) e a arena centralizada dentro dela",
    "    W = (oled.width - 2) // C",
    "    H = (oled.height - 2) // C",
    "    OX = 1 + (oled.width - 2 - W * C) // 2",
    "    OY = 1 + (oled.height - 2 - H * C) // 2",
    "    _jogo_esperar('COBRINHA', '', 'aperte uma seta')",
    "    while True:",
    "        cobra = [(W // 2 - i, H // 2) for i in range(3)]  # cabeca primeiro",
    "        _cob_dir = _cob_prox = (1, 0)",
    "        pontos = 0",
    "        passo0 = 1000 // _jogo_velocidade  # ms entre passos (5 -> 200 ms)",
    "        passo = passo0",
    "        maca = _cob_maca(cobra, W, H)",
    "        led_ate = None",
    "        while True:",
    "            d = _cob_prox",
    "            if d[0] + _cob_dir[0] != 0 or d[1] + _cob_dir[1] != 0:  # nao deixa dar meia-volta",
    "                _cob_dir = d",
    "            x = cobra[0][0] + _cob_dir[0]",
    "            y = cobra[0][1] + _cob_dir[1]",
    "            if x < 0 or y < 0 or x >= W or y >= H or (x, y) in cobra[:-1]:",
    "                break  # bateu na parede ou no proprio corpo",
    "            cobra.insert(0, (x, y))",
    "            if (x, y) == maca:",
    "                pontos += 1",
    "                passo = max(passo0 * 2 // 5, passo - passo0 // 25)  # acelera a cada maca",
    "                maca = _cob_maca(cobra, W, H)",
    "                led_rgb(0, 40, 0)",
    "                led_ate = time.ticks_add(time.ticks_ms(), 150)",
    "            else:",
    "                cobra.pop()",
    "            oled.fill(0)",
    "            oled.rect(0, 0, oled.width, oled.height, 1)",
    "            for sx, sy in cobra:",
    "                oled.fill_rect(OX + sx * C, OY + sy * C, C, C, 1)",
    "            oled.rect(OX + maca[0] * C, OY + maca[1] * C, C, C, 1)",
    "            _visor_mostrar()",
    "            time.sleep_ms(passo)",
    "            if led_ate is not None and time.ticks_diff(time.ticks_ms(), led_ate) >= 0:",
    "                led_rgb(0, 0, 0)",
    "                led_ate = None",
    "        led_rgb(40, 0, 0)",
    "        _jogo_esperar('FIM DE JOGO', '%d pontos' % pontos, 'aperte uma seta')",
    "        led_rgb(0, 0, 0)",
    "",
    "",
  ].join("\n");
}

/** Jogo do dinossauro (o do Chrome sem internet): pular cactos e agachar dos pássaros. */
function dinoCode(): string {
  return [
    "# --- jogo do dinossauro ---",
    "_DINO_A = [",
    "    '.......#####',",
    "    '.......#.###',",
    "    '.......#####',",
    "    '.......###..',",
    "    '.......#####',",
    "    '#.....###...',",
    "    '#....#####..',",
    "    '##..######..',",
    "    '.########...',",
    "    '..######....',",
    "    '...##.##....',",
    "    '...#...#....',",
    "]",
    "_DINO_B = _DINO_A[:10] + ['...##.##....', '...##..##...']  # outra posicao das pernas",
    "_DINO_AGACHADO = [",
    "    '..........######',",
    "    '..........#.####',",
    "    '#.........######',",
    "    '##.......####...',",
    "    '.###########....',",
    "    '..#########.....',",
    "    '...##...##......',",
    "]",
    "_CACTO = ['..##..', '..##..', '#.##.#', '#.##.#', '######', '..##..', '..##..', '..##..']",
    "_OBSTACULOS = [",
    "    _CACTO,                              # cacto baixo",
    "    ['..##..'] * 4 + _CACTO,             # cacto alto",
    "    [a + '..' + b for a, b in zip(_CACTO, _CACTO)],  # dois cactos",
    "]",
    "_PASSARO = [",
    "    '..##........',",
    "    '...##.......',",
    "    '#...########',",
    "    '.####....##.',",
    "    '..######....',",
    "    '...##.......',",
    "]",
    "_dino_pulo = False",
    "_dino_agachar = 0  # quadros que ainda fica agachado",
    "",
    "def _dino_tecla(nome):",
    "    global _dino_pulo, _dino_agachar, _jogo_tecla",
    "    _jogo_tecla = True",
    "    if nome == 'down':",
    "        _dino_agachar = 10",
    "    else:",
    "        _dino_pulo = True",
    "",
    "def visor_dino():",
    "    global _dino_pulo, _dino_agachar",
    "    _visor_garantir()",
    "    for n in ('up', 'space', 'down'):",
    "        _teclas[n] = (lambda k: lambda: _dino_tecla(k))(n)",
    "    W = oled.width",
    "    CHAO = oled.height - 6  # y da linha do chao",
    "    dino_a, dw, dh = _jogo_sprite(_DINO_A)",
    "    dino_b = _jogo_sprite(_DINO_B)[0]",
    "    agachado, aw, ah = _jogo_sprite(_DINO_AGACHADO)",
    "    obstaculos = [_jogo_sprite(o) for o in _OBSTACULOS]",
    "    passaro = _jogo_sprite(_PASSARO)",
    "    pulo = -4.8 if oled.height >= 64 else -3.8  # velocidade inicial do pulo",
    "    _jogo_esperar('DINO', '', 'aperte uma tecla')",
    "    while True:",
    "        x = 8",
    "        y = float(CHAO - dh)",
    "        vy = 0.0",
    "        no_chao = True",
    "        vel0 = 0.6 * _jogo_velocidade  # pixels por quadro (5 -> 3.0)",
    "        vel = vel0",
    "        dist = 0.0",
    "        pontos = 0",
    "        marco = 0  # ultima centena comemorada",
    "        obs = []  # [x, tipo]; tipo -1 = passaro",
    "        prox = 60.0  # distancia ate o proximo obstaculo",
    "        quadro = 0",
    "        led_ate = None",
    "        _dino_pulo = False",
    "        _dino_agachar = 0",
    "        vivo = True",
    "        while vivo:",
    "            quadro += 1",
    "            if _dino_pulo:",
    "                _dino_pulo = False",
    "                if no_chao:",
    "                    vy = pulo",
    "                    no_chao = False",
    "            if not no_chao:",
    "                vy += 0.9 if _dino_agachar > 0 else 0.55  # agachar no ar desce mais rapido",
    "                y += vy",
    "                if y >= CHAO - dh:",
    "                    y = float(CHAO - dh)",
    "                    vy = 0.0",
    "                    no_chao = True",
    "            if _dino_agachar > 0:",
    "                _dino_agachar -= 1",
    "            dist += vel",
    "            prox -= vel",
    "            if prox <= 0:",
    "                if pontos >= 30 and random.randint(0, 2) == 0:",
    "                    tipo = -1",
    "                else:",
    "                    tipo = random.randint(0, len(obstaculos) - 1)",
    "                obs.append([float(W), tipo])",
    "                prox = float(random.randint(60, 130))",
    "            for o in obs:",
    "                o[0] -= vel",
    "            obs = [o for o in obs if o[0] > -20]",
    "            pontos = int(dist // 8)",
    "            vel = min(vel0 + 4.0, vel0 + (pontos // 100) * 0.3)",
    "            if pontos // 100 > marco:  # a cada 100 pontos pisca verde",
    "                marco = pontos // 100",
    "                led_rgb(0, 40, 0)",
    "                led_ate = time.ticks_add(time.ticks_ms(), 200)",
    "            esta_agachado = _dino_agachar > 0 and no_chao",
    "            if esta_agachado:",
    "                dx0, dy0, dx1, dy1 = x, CHAO - ah, x + aw, CHAO",
    "            else:",
    "                dx0, dy0, dx1, dy1 = x, int(y), x + dw, int(y) + dh",
    "            oled.fill(0)",
    "            oled.hline(0, CHAO, W, 1)",
    "            oled.text(str(pontos), W - len(str(pontos)) * 8, 0, 1)",
    "            for ox, tipo in obs:",
    "                if tipo < 0:",
    "                    fb, w, h = passaro",
    "                    oy = CHAO - 13  # na altura da cabeca: passa so agachado",
    "                else:",
    "                    fb, w, h = obstaculos[tipo]",
    "                    oy = CHAO - h",
    "                ox = int(ox)",
    "                oled.blit(fb, ox, oy, 0)",
    "                # caixas encolhidas em 1 pixel para nao morrer por encostar",
    "                if ox + 1 < dx1 - 1 and ox + w - 1 > dx0 + 1 and oy + 1 < dy1 - 1 and oy + h - 1 > dy0 + 1:",
    "                    vivo = False",
    "            if esta_agachado:",
    "                oled.blit(agachado, x, CHAO - ah, 0)",
    "            else:",
    "                oled.blit(dino_a if not no_chao or (quadro // 3) % 2 == 0 else dino_b, x, int(y), 0)",
    "            _visor_mostrar()",
    "            time.sleep_ms(25)",
    "            if led_ate is not None and time.ticks_diff(time.ticks_ms(), led_ate) >= 0:",
    "                led_rgb(0, 0, 0)",
    "                led_ate = None",
    "        led_rgb(40, 0, 0)",
    "        _jogo_esperar('FIM DE JOGO', '%d pontos' % pontos, 'aperte uma tecla')",
    "        led_rgb(0, 0, 0)",
    "",
    "",
  ].join("\n");
}

/** Flappy Bird: bater as asas para passar entre os canos. */
function flappyCode(): string {
  return [
    "# --- jogo do passarinho (flappy) ---",
    "_PASS_A = [",
    "    '..####..',",
    "    '.#..#.#.',",
    "    '#...####',",
    "    '#.#.###.',",
    "    '.#####..',",
    "    '..###...',",
    "]",
    "_PASS_B = [",
    "    '..####..',",
    "    '.#..#.#.',",
    "    '#...####',",
    "    '.####.#.',",
    "    '..#####.',",
    "    '...###..',",
    "]",
    "_flap_bater = False",
    "",
    "def _flap_tecla(nome):",
    "    global _flap_bater, _jogo_tecla",
    "    _jogo_tecla = True",
    "    _flap_bater = True",
    "",
    "def visor_flappy():",
    "    global _flap_bater",
    "    _visor_garantir()",
    "    for n in ('up', 'space'):",
    "        _teclas[n] = (lambda k: lambda: _flap_tecla(k))(n)",
    "    W, H = oled.width, oled.height",
    "    ave_a, aw, ah = _jogo_sprite(_PASS_A)",
    "    ave_b = _jogo_sprite(_PASS_B)[0]",
    "    CANO = 8    # largura do cano",
    "    VAO = 26 if H >= 64 else 16  # abertura entre os canos",
    "    ENTRE = 64  # distancia entre canos",
    "    X = 20      # posicao do passarinho",
    "    _jogo_esperar('FLAPPY', '', 'aperte uma tecla')",
    "    while True:",
    "        y = float(H // 2 - ah // 2)",
    "        vy = 0.0",
    "        vel0 = 0.45 * _jogo_velocidade  # pixels por quadro (5 -> 2.25)",
    "        vel = vel0",
    "        pontos = 0",
    "        canos = []  # [x, topo do vao, ja pontuou]",
    "        prox = float(W)",
    "        quadro = 0",
    "        led_ate = None",
    "        _flap_bater = False",
    "        vivo = True",
    "        while vivo:",
    "            quadro += 1",
    "            if _flap_bater:",
    "                _flap_bater = False",
    "                vy = -3.0",
    "            vy += 0.45",
    "            y += vy",
    "            if y < 0:",
    "                y = 0.0",
    "                vy = 0.0",
    "            if y + ah > H - 1:",
    "                vivo = False  # caiu no chao",
    "            prox -= vel",
    "            if prox <= 0:",
    "                canos.append([float(W), random.randint(3, H - 3 - VAO), False])",
    "                prox = float(ENTRE)",
    "            for c in canos:",
    "                c[0] -= vel",
    "            canos = [c for c in canos if c[0] > -CANO - 2]",
    "            vel = min(vel0 + 2.0, vel0 + (pontos // 10) * 0.2)",
    "            yi = int(y)",
    "            oled.fill(0)",
    "            oled.hline(0, H - 1, W, 1)",
    "            for c in canos:",
    "                cx, topo = int(c[0]), c[1]",
    "                oled.rect(cx, -1, CANO, topo + 1, 1)  # cano de cima",
    "                oled.rect(cx - 1, topo - 3, CANO + 2, 3, 1)",
    "                oled.rect(cx, topo + VAO, CANO, H - topo - VAO, 1)  # cano de baixo",
    "                oled.rect(cx - 1, topo + VAO, CANO + 2, 3, 1)",
    "                # bateu no cano? (caixa do passarinho encolhida em 1 pixel)",
    "                if cx - 1 < X + aw - 1 and cx + CANO + 1 > X + 1 and (yi + 1 < topo or yi + ah - 1 > topo + VAO):",
    "                    vivo = False",
    "                if not c[2] and cx + CANO < X:  # passou do cano",
    "                    c[2] = True",
    "                    pontos += 1",
    "                    led_rgb(0, 40, 0)",
    "                    led_ate = time.ticks_add(time.ticks_ms(), 120)",
    "            oled.blit(ave_a if vy < 0 and (quadro // 2) % 2 == 0 else ave_b, X, yi, 0)",
    "            oled.text(str(pontos), W - len(str(pontos)) * 8, 0, 1)",
    "            _visor_mostrar()",
    "            time.sleep_ms(25)",
    "            if led_ate is not None and time.ticks_diff(time.ticks_ms(), led_ate) >= 0:",
    "                led_rgb(0, 0, 0)",
    "                led_ate = None",
    "        led_rgb(40, 0, 0)",
    "        _jogo_esperar('FIM DE JOGO', '%d pontos' % pontos, 'aperte uma tecla')",
    "        led_rgb(0, 0, 0)",
    "",
    "",
  ].join("\n");
}

export function usesOled(workspace: Blockly.Workspace): boolean {
  return programBlocks(workspace).some((b) => OLED_BLOCK_TYPES.includes(b.type));
}

/** Marca que inicia um quadro do visor na serial: "\x1f<w>,<h>,<base64 do framebuffer>". */
export const DISPLAY_MARK = "\x1f";

/**
 * Funções auxiliares do visor OLED (precisa do arquivo ssd1306.py na placa).
 * Sem o OLED físico, usa um visor virtual na memória; em ambos os casos o
 * conteúdo é enviado ao app (no máximo 10 quadros/s) para o preview.
 */
export function oledCode(): string {
  return [
    "# --- visor OLED ---",
    "from machine import SoftI2C",
    "import framebuf, binascii",
    "try:",
    "    import ssd1306",
    "except ImportError:",
    "    ssd1306 = None",
    "",
    "class _VisorVirtual(framebuf.FrameBuffer):",
    "    def __init__(self, w, h):",
    "        self.width = w",
    "        self.height = h",
    "        self.buffer = bytearray(w * h // 8)",
    "        super().__init__(self.buffer, w, h, framebuf.MONO_VLSB)",
    "    def show(self):",
    "        pass",
    "",
    "oled = None",
    "_vis_dirty = False",
    "",
    "def _visor_flush(t=None):",
    "    global _vis_dirty",
    "    if _vis_dirty and oled is not None:",
    "        _vis_dirty = False",
    "        print('\\x1f%d,%d,' % (oled.width, oled.height) + binascii.b2a_base64(oled.buffer).decode().strip())",
    "",
    "_vis_timer = Timer(2)",
    "_vis_timer.init(period=100, mode=Timer.PERIODIC, callback=_visor_flush)",
    "",
    "def _visor_mostrar():",
    "    global _vis_dirty",
    "    oled.show()",
    "    _vis_dirty = True",
    "",
    "def visor_iniciar(sda, scl, w, h):",
    "    global oled",
    "    oled = None",
    "    try:",
    "        i2c = SoftI2C(sda=Pin(sda), scl=Pin(scl), freq=400000)",
    "        addrs = i2c.scan()",
    "        if addrs and ssd1306:",
    "            addr = 0x3C if 0x3C in addrs else addrs[0]",
    "            oled = ssd1306.SSD1306_I2C(w, h, i2c, addr=addr)",
    "    except Exception as e:",
    "        print('Visor OLED nao encontrado:', e)",
    "    if oled is None:",
    "        oled = _VisorVirtual(w, h)  # sem OLED fisico: so o preview no app",
    "    _visor_mostrar()",
    "",
    "def _visor_garantir():",
    "    # sem o bloco 'iniciar visor': liga com os pinos padrao (SDA 8, SCL 9)",
    "    if oled is None:",
    "        visor_iniciar(8, 9, 128, 64)",
    "",
    "def visor_texto(txt, linha):",
    "    _visor_garantir()",
    "    cols = oled.width // 8",
    "    max_linhas = oled.height // 8",
    "    # quebra em linhas sem cortar palavras (palavra maior que a linha e cortada)",
    "    saida = []",
    "    atual = ''",
    "    for p in str(txt).split(' '):",
    "        while len(p) > cols:",
    "            if atual:",
    "                saida.append(atual)",
    "                atual = ''",
    "            saida.append(p[:cols])",
    "            p = p[cols:]",
    "        if not atual:",
    "            atual = p",
    "        elif len(atual) + 1 + len(p) <= cols:",
    "            atual += ' ' + p",
    "        else:",
    "            saida.append(atual)",
    "            atual = p",
    "    saida.append(atual)",
    "    y = int(linha) - 1",
    "    for l in saida:",
    "        if y >= max_linhas:",
    "            break",
    "        oled.fill_rect(0, y * 8, oled.width, 8, 0)",
    "        oled.text(l, 0, y * 8, 1)",
    "        y += 1",
    "    _visor_mostrar()",
    "",
    "def visor_limpar():",
    "    _visor_garantir()",
    "    oled.fill(0)",
    "    _visor_mostrar()",
    "",
    "# grafico: um ponto por chamada, eixo Y em % e eixo X no tempo",
    "_graf = []",
    "_graf_t0 = None",
    "",
    "def visor_grafico(v):",
    "    global _graf_t0",
    "    _visor_garantir()",
    "    if _graf_t0 is None:",
    "        _graf_t0 = time.ticks_ms()",
    "    try:",
    "        v = max(0, min(100, float(v)))",
    "    except (TypeError, ValueError):",
    "        v = 0",
    "    alto = oled.height >= 64",
    "    X0 = 34                    # inicio da area do grafico (esquerda ficam os rotulos)",
    "    Y0 = 2 if alto else 1      # topo (100%)",
    "    Y1 = 54 if alto else 24    # linha do eixo do tempo (0%)",
    "    W = oled.width - X0",
    "    _graf.append(v)",
    "    if len(_graf) > W:",
    "        del _graf[0]",
    "    oled.fill(0)",
    "    oled.vline(X0 - 1, Y0, Y1 - Y0 + 1, 1)  # eixo %",
    "    oled.hline(X0 - 1, Y1, W + 1, 1)        # eixo tempo",
    "    oled.text('100%', 0, Y0 - 2 if alto else 0, 1)",
    "    oled.text('0%', 16, Y1 - 7, 1)",
    "    if alto:",
    "        oled.text('50%', 8, (Y0 + Y1) // 2 - 4, 1)",
    "        oled.hline(X0 - 3, (Y0 + Y1) // 2, 2, 1)",
    "        oled.text('tempo', X0, 56, 1)",
    "        seg = '%ds' % (time.ticks_diff(time.ticks_ms(), _graf_t0) // 1000)",
    "        oled.text(seg, oled.width - len(seg) * 8, 56, 1)",
    "    for i in range(10, W, 10):  # marquinhas de tempo",
    "        oled.pixel(X0 + i, Y1 - 1, 1)",
    "    py = None",
    "    for i, val in enumerate(_graf):",
    "        x = X0 + i",
    "        y = Y1 - int(val * (Y1 - Y0) / 100)",
    "        if py is None:",
    "            oled.pixel(x, y, 1)",
    "        else:",
    "            oled.line(x - 1, py, x, y, 1)",
    "        py = y",
    "    _visor_mostrar()",
    "",
    "def visor_desenho(dados):",
    "    _visor_garantir()",
    "    b = binascii.a2b_base64(dados)",
    "    n = min(len(b), len(oled.buffer))",
    "    oled.buffer[:n] = b[:n]",
    "    _visor_mostrar()",
    "",
    "",
  ].join("\n");
}

export const toolbox = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "Eventos",
      colour: EVENT_COLOUR,
      contents: [
        { kind: "block", type: "event_start" },
        { kind: "block", type: "event_key" },
        { kind: "block", type: "event_wifi" },
      ],
    },
    {
      kind: "category",
      name: "LED",
      colour: LED_COLOUR,
      contents: [
        {
          kind: "block",
          type: "led_rgb",
          inputs: {
            R: { shadow: { type: "math_number", fields: { NUM: 255 } } },
            G: { shadow: { type: "math_number", fields: { NUM: 0 } } },
            B: { shadow: { type: "math_number", fields: { NUM: 0 } } },
          },
        },
        { kind: "block", type: "led_color" },
        { kind: "block", type: "led_off" },
      ],
    },
    {
      kind: "category",
      name: "Tempo",
      colour: TIME_COLOUR,
      contents: [
        {
          kind: "block",
          type: "wait_ms",
          inputs: { TIME: { shadow: { type: "math_number", fields: { NUM: 500 } } } },
        },
      ],
    },
    {
      kind: "category",
      name: "Saídas",
      colour: PORT_COLOUR,
      contents: [
        { kind: "block", type: "port_onoff" },
        {
          kind: "block",
          type: "port_pwm",
          inputs: { PCT: { shadow: { type: "math_number", fields: { NUM: 50 } } } },
        },
      ],
    },
    {
      kind: "category",
      name: "Entradas",
      colour: INPUT_COLOUR,
      contents: [
        { kind: "block", type: "input_if" },
        { kind: "block", type: "input_ifelse" },
        { kind: "block", type: "input_digital" },
        { kind: "block", type: "input_analog" },
        { kind: "block", type: "show_value" },
      ],
    },
    {
      kind: "category",
      name: "Visor",
      colour: OLED_COLOUR,
      contents: [
        { kind: "block", type: "oled_config" },
        {
          kind: "block",
          type: "oled_text",
          inputs: { TEXT: { shadow: { type: "text", fields: { TEXT: "Ola!" } } } },
        },
        {
          kind: "block",
          type: "oled_plot",
          inputs: { VALUE: { shadow: { type: "math_number", fields: { NUM: 50 } } } },
        },
        { kind: "block", type: "oled_clear" },
        { kind: "block", type: "oled_draw" },
      ],
    },
    {
      kind: "category",
      name: "Jogos",
      colour: GAME_COLOUR,
      contents: [
        { kind: "block", type: "game_speed" },
        { kind: "block", type: "oled_snake" },
        { kind: "block", type: "oled_dino" },
        { kind: "block", type: "oled_flappy" },
      ],
    },
    {
      kind: "category",
      name: "Wi-Fi",
      colour: WIFI_COLOUR,
      contents: [
        { kind: "block", type: "wifi_connect" },
        { kind: "block", type: "event_wifi" },
        { kind: "block", type: "event_key_wifi" },
        { kind: "block", type: "wifi_ip" },
      ],
    },
    {
      kind: "category",
      name: "Controle",
      colour: CONTROL_COLOUR,
      contents: [
        { kind: "block", type: "forever" },
        {
          kind: "block",
          type: "controls_repeat_ext",
          inputs: { TIMES: { shadow: { type: "math_number", fields: { NUM: 10 } } } },
        },
        { kind: "block", type: "controls_if" },
        { kind: "block", type: "controls_whileUntil" },
      ],
    },
    {
      kind: "category",
      name: "Lógica",
      colour: 210,
      contents: [
        {
          kind: "block",
          type: "logic_compare",
          inputs: {
            A: { shadow: { type: "math_number", fields: { NUM: 50 } } },
            B: { shadow: { type: "math_number", fields: { NUM: 50 } } },
          },
        },
        { kind: "block", type: "logic_operation" },
        { kind: "block", type: "logic_negate" },
        { kind: "block", type: "logic_boolean" },
      ],
    },
    // Categorias desativadas por enquanto (descomente para reativar):
    // {
    //   kind: "category",
    //   name: "Matemática",
    //   colour: 230,
    //   contents: [
    //     { kind: "block", type: "math_number" },
    //     {
    //       kind: "block",
    //       type: "math_arithmetic",
    //       inputs: {
    //         A: { shadow: { type: "math_number", fields: { NUM: 1 } } },
    //         B: { shadow: { type: "math_number", fields: { NUM: 1 } } },
    //       },
    //     },
    //     {
    //       kind: "block",
    //       type: "math_random_int",
    //       inputs: {
    //         FROM: { shadow: { type: "math_number", fields: { NUM: 0 } } },
    //         TO: { shadow: { type: "math_number", fields: { NUM: 255 } } },
    //       },
    //     },
    //   ],
    // },
    // { kind: "category", name: "Variáveis", colour: 330, custom: "VARIABLE" },
  ],
};

/** Programa inicial: pisca vermelho, verde e azul. */
export const starterWorkspace = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: "event_start",
        x: 40,
        y: 40,
        next: {
          block: {
        type: "forever",
        inputs: {
          DO: {
            block: {
              type: "led_color",
              fields: { COLOR: "VERMELHO" },
              next: {
                block: {
                  type: "wait_ms",
                  fields: { UNIT: "MS" },
                  inputs: { TIME: { shadow: { type: "math_number", fields: { NUM: 500 } } } },
                  next: {
                    block: {
                      type: "led_color",
                      fields: { COLOR: "VERDE" },
                      next: {
                        block: {
                          type: "wait_ms",
                          fields: { UNIT: "MS" },
                          inputs: { TIME: { shadow: { type: "math_number", fields: { NUM: 500 } } } },
                          next: {
                            block: {
                              type: "led_rgb",
                              inputs: {
                                R: { shadow: { type: "math_number", fields: { NUM: 0 } } },
                                G: { shadow: { type: "math_number", fields: { NUM: 0 } } },
                                B: { shadow: { type: "math_number", fields: { NUM: 255 } } },
                              },
                              next: {
                                block: {
                                  type: "wait_ms",
                                  fields: { UNIT: "MS" },
                                  inputs: { TIME: { shadow: { type: "math_number", fields: { NUM: 500 } } } },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
          },
        },
      },
    ],
  },
};
