import * as Blockly from "blockly";
import { pythonGenerator, Order } from "blockly/python";

const EVENT_COLOUR = 45;
const LED_COLOUR = 10;
const TIME_COLOUR = 40;
const CONTROL_COLOUR = 120;
const PORT_COLOUR = 200;
const INPUT_COLOUR = 160;
const OLED_COLOUR = 260;

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
      type: "oled_clear",
      message0: "limpar visor",
      previousStatement: null,
      nextStatement: null,
      colour: OLED_COLOUR,
      tooltip: "Apaga tudo que está no visor.",
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

  // ---- Geradores Python ----

  pythonGenerator.forBlock["event_start"] = () => "";

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

  pythonGenerator.forBlock["oled_clear"] = () => "visor_limpar()\n";

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

/** Gera o código só das pilhas penduradas em "ao iniciar"; blocos soltos são ignorados. */
export function programCode(workspace: Blockly.Workspace): string {
  pythonGenerator.init(workspace);
  let code = "";
  for (const block of workspace.getTopBlocks(true)) {
    if (block.type !== "event_start") continue;
    let c = pythonGenerator.blockToCode(block);
    if (Array.isArray(c)) c = c[0];
    if (c) code += c;
  }
  return pythonGenerator.finish(code);
}

/** Blocos que fazem parte do programa (pendurados em "ao iniciar"). */
export function programBlocks(workspace: Blockly.Workspace): Blockly.Block[] {
  const result: Blockly.Block[] = [];
  for (const top of workspace.getTopBlocks(false)) {
    if (top.type === "event_start") result.push(...top.getDescendants(false));
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

const OLED_BLOCK_TYPES = ["oled_config", "oled_text", "oled_clear"];

export function usesOled(workspace: Blockly.Workspace): boolean {
  return programBlocks(workspace).some((b) => OLED_BLOCK_TYPES.includes(b.type));
}

/** Funções auxiliares do visor OLED (precisa do arquivo ssd1306.py na placa). */
export function oledCode(): string {
  return [
    "# --- visor OLED ---",
    "from machine import SoftI2C",
    "import ssd1306",
    "",
    "oled = None",
    "",
    "def visor_iniciar(sda, scl, w, h):",
    "    global oled",
    "    try:",
    "        i2c = SoftI2C(sda=Pin(sda), scl=Pin(scl), freq=400000)",
    "        addrs = i2c.scan()",
    "        addr = 0x3C if (0x3C in addrs or not addrs) else addrs[0]",
    "        oled = ssd1306.SSD1306_I2C(w, h, i2c, addr=addr)",
    "    except Exception as e:",
    "        oled = None",
    "        print('Visor OLED nao encontrado:', e)",
    "",
    "def visor_texto(txt, linha):",
    "    if oled is None:",
    "        return",
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
    "    oled.show()",
    "",
    "def visor_limpar():",
    "    if oled is None:",
    "        return",
    "    oled.fill(0)",
    "    oled.show()",
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
      contents: [{ kind: "block", type: "event_start" }],
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
        { kind: "block", type: "oled_clear" },
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
