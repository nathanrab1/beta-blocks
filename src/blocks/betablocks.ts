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
const GAME_COLOUR = 330;
const TEXT_COLOUR = 70;
const MATH_COLOUR = 230;
const VARIABLE_COLOUR = "#f28c28"; // laranja, como no Scratch (o padrão do Blockly é o rosa dos Jogos)
const RADIO_COLOUR = "#d6268f";

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

/** Blocos em que o rótulo fica colado no balão do número (ex.: "LED r[ ] g[ ] b[ ]"). */
const COLADOS = new Set(["led_rgb_pct"]);

/** O zelos coloca um espaço fixo entre rótulo e campo; nos blocos COLADOS ele quase some. */
class BetaRenderInfo extends Blockly.zelos.RenderInfo {
  override getInRowSpacing_(prev: Blockly.blockRendering.Measurable | null, next: Blockly.blockRendering.Measurable | null) {
    const T = Blockly.blockRendering.Types;
    if (COLADOS.has(this.block_.type) && prev && next && T.isField(prev) && T.isInlineInput(next)) return 2;
    return super.getInRowSpacing_(prev, next);
  }
}

class BetaRenderer extends Blockly.zelos.Renderer {
  protected override makeRenderInfo_(block: Blockly.BlockSvg) {
    return new BetaRenderInfo(this, block);
  }
}

/** Nome do renderizador do app (o zelos com o ajuste acima). */
export const RENDERER = "betablocks";

export function defineBlocks(): void {
  Blockly.Msg["VARIABLES_HUE"] = VARIABLE_COLOUR;
  if (!Blockly.registry.hasItem(Blockly.registry.Type.RENDERER, RENDERER)) {
    Blockly.blockRendering.register(RENDERER, BetaRenderer);
  }
  // "ao receber número = ...": o campo aceita só um número (vírgula vira ponto) ou vazio
  if (!Blockly.Extensions.isRegistered("radio_number_filter")) {
    Blockly.Extensions.register("radio_number_filter", function (this: Blockly.Block) {
      this.getField("NUM")!.setValidator((v: string) => {
        const t = String(v).trim().replace(",", ".");
        return t === "" || /^-?\d+(\.\d+)?$/.test(t) ? t : null;
      });
    });
  }
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
      type: "event_button",
      message0: "quando clicar botão %1",
      args0: [{ type: "field_number", name: "PIN", value: 1, min: 0, max: 48, precision: 1 }],
      nextStatement: null,
      hat: "cap",
      colour: INPUT_COLOUR,
      tooltip:
        "Roda os blocos pendurados quando o botão ligado nessa porta é apertado (botão entre a porta e o 3,3 V). " +
        "Segurar apertado não repete.",
    },
    {
      type: "event_threshold",
      message0: "quando valor porta %1 passar de %2",
      args0: [
        { type: "field_number", name: "PIN", value: 1, min: 1, max: 20, precision: 1 },
        { type: "field_number", name: "LIMIT", value: 50, min: 0, max: 100, precision: 1 },
      ],
      nextStatement: null,
      hat: "cap",
      colour: INPUT_COLOUR,
      tooltip:
        "Roda os blocos pendurados quando o valor da porta (0 a 100%) sobe e passa do número escolhido " +
        "(ex.: o LDR recebendo luz). Só roda de novo depois que o valor descer um pouco abaixo do número.",
    },
    {
      type: "math_convert",
      // FROM_MIN/FROM_MAX vieram depois: nos blocos antigos ficam vazios e valem 0 e 100
      message0: "converter %1 de %2 %3 para %4 %5",
      args0: [
        { type: "input_value", name: "VALUE", check: "Number" },
        { type: "input_value", name: "FROM_MIN", check: "Number" },
        { type: "input_value", name: "FROM_MAX", check: "Number" },
        { type: "input_value", name: "MIN", check: "Number" },
        { type: "input_value", name: "MAX", check: "Number" },
      ],
      inputsInline: true,
      output: "Number",
      colour: MATH_COLOUR,
      tooltip:
        "Muda um valor de uma faixa para outra. Ex.: de 0–100 para 100–0 inverte (mais luz no sensor, " +
        "menos luz no LED); de 0–100 para 0–10 vira uma nota. Valores fora da primeira faixa ficam no limite.",
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
      tooltip: "Acende o LED RGB (vermelho na porta 4, verde na 5, azul na 6) com a intensidade de cada cor (0 a 255).",
    },
    // o de cima (0 a 255) saiu do menu, mas continua funcionando nos projetos antigos
    {
      type: "led_rgb_pct",
      message0: "LED r %1 g %2 b %3",
      args0: [
        { type: "input_value", name: "R", check: "Number" },
        { type: "input_value", name: "G", check: "Number" },
        { type: "input_value", name: "B", check: "Number" },
      ],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      colour: LED_COLOUR,
      tooltip:
        "Acende o LED RGB com a intensidade de cada cor, de 0 a 100% (a mesma medida do 'valor porta' e das saídas): " +
        "r = vermelho (porta 4), g = verde (porta 5), b = azul (porta 6).",
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
      tooltip: "Acende o LED RGB (portas 4, 5 e 6) com uma cor pronta.",
    },
    {
      type: "led_off",
      message0: "apagar LED",
      previousStatement: null,
      nextStatement: null,
      colour: LED_COLOUR,
      tooltip: "Apaga o LED RGB (portas 4, 5 e 6).",
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
      message0: "porta %1 está ligada",
      args0: [{ type: "field_number", name: "PIN", value: 1, min: 0, max: 48, precision: 1 }],
      output: "Boolean",
      colour: INPUT_COLOUR,
      tooltip: "Verdadeiro se a porta estiver recebendo 3,3 V (botão apertado, sensor ativo).",
    },
    {
      type: "input_analog",
      message0: "valor porta %1",
      args0: [{ type: "field_number", name: "PIN", value: 1, min: 1, max: 20, precision: 1 }],
      output: "Number",
      colour: INPUT_COLOUR,
      tooltip: "Lê um valor analógico (potenciômetro, LDR…) de 0 a 100%. Só portas 1 a 20.",
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
      type: "oled_pixel_on",
      message0: "pintar pixel x %1 y %2",
      args0: [
        { type: "input_value", name: "X", check: "Number" },
        { type: "input_value", name: "Y", check: "Number" },
      ],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      colour: OLED_COLOUR,
      tooltip:
        "Acende um pixel do visor. x vai de 0 (esquerda) a 127 (direita) e y de 0 (embaixo) a 63 (em cima). " +
        "Use com 'repetir' e contas para desenhar por código.",
    },
    {
      type: "oled_pixel_off",
      message0: "apagar pixel x %1 y %2",
      args0: [
        { type: "input_value", name: "X", check: "Number" },
        { type: "input_value", name: "Y", check: "Number" },
      ],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      colour: OLED_COLOUR,
      tooltip: "Apaga um pixel do visor. x vai de 0 (esquerda) a 127 (direita) e y de 0 (embaixo) a 63 (em cima).",
    },
    {
      type: "oled_line_to",
      message0: "traçar até x %1 y %2",
      args0: [
        { type: "input_value", name: "X", check: "Number" },
        { type: "input_value", name: "Y", check: "Number" },
      ],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      colour: OLED_COLOUR,
      tooltip:
        "Desenha uma linha do último ponto traçado até este, como uma caneta que não sai do papel: " +
        "o traço fica contínuo mesmo mexendo rápido (ex.: x e y vindo de dois potenciômetros). " +
        "x vai de 0 (esquerda) a 127 (direita) e y de 0 (embaixo) a 63 (em cima).",
    },
    {
      type: "oled_pen_up",
      message0: "levantar caneta",
      previousStatement: null,
      nextStatement: null,
      colour: OLED_COLOUR,
      tooltip: "O próximo 'traçar até' começa um traço novo, sem ligar ao ponto anterior.",
    },
    {
      type: "oled_snake",
      message0: "🐍 jogo da cobrinha",
      previousStatement: null,
      nextStatement: null,
      colour: GAME_COLOUR,
      tooltip:
        "Inicia o jogo da cobrinha no visor. Controle com as setas do teclado (pelo cabo ou pelo Bluetooth). " +
        "A tecla x sai do jogo e o programa segue para o próximo bloco.",
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
      nextStatement: null,
      colour: GAME_COLOUR,
      tooltip:
        "Flappy Bird no visor: ↑ ou espaço bate as asas para passar entre os canos. " +
        "Teclas pelo cabo ou pelo Bluetooth. A tecla x sai do jogo e o programa segue para o próximo bloco.",
    },
    {
      type: "oled_dino",
      message0: "🦖 jogo do dinossauro",
      previousStatement: null,
      nextStatement: null,
      colour: GAME_COLOUR,
      tooltip:
        "O jogo do dinossauro do Chrome no visor: ↑ ou espaço pula os cactos, ↓ agacha dos pássaros. " +
        "Teclas pelo cabo ou pelo Bluetooth. A tecla x sai do jogo e o programa segue para o próximo bloco.",
    },
    {
      type: "oled_breakout",
      message0: "🧱 jogo do Breakout (raquete na porta %1)",
      args0: [{ type: "field_number", name: "PIN", value: 7, min: 1, max: 20, precision: 1 }],
      previousStatement: null,
      nextStatement: null,
      colour: GAME_COLOUR,
      tooltip:
        "Quebre os tijolos com a bola! A raquete segue o potenciômetro ligado nessa porta (ou as setas ← →). " +
        "Espaço lança a bola, que também sai sozinha. A tecla x sai do jogo e o programa segue para o próximo bloco.",
    },
    {
      type: "oled_pong_cpu",
      message0: "🏓 jogo do Pong contra a máquina (raquete na porta %1)",
      args0: [{ type: "field_number", name: "PIN", value: 7, min: 1, max: 20, precision: 1 }],
      previousStatement: null,
      nextStatement: null,
      colour: GAME_COLOUR,
      tooltip:
        "Pong contra a máquina: a sua raquete (esquerda) segue o potenciômetro ligado nessa porta, ou as teclas ↑ ↓ (ou w s). " +
        "Ganha quem fizer 5 pontos. A tecla x sai do jogo e o programa segue para o próximo bloco.",
    },
    {
      type: "oled_pong_2",
      message0: "🏓 jogo do Pong para dois (raquetes nas portas %1 e %2)",
      args0: [
        { type: "field_number", name: "PIN", value: 7, min: 1, max: 20, precision: 1 },
        { type: "field_number", name: "PIN2", value: 8, min: 1, max: 20, precision: 1 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: GAME_COLOUR,
      tooltip:
        "Pong para dois na mesma placa: jogador 1 (esquerda) no primeiro potenciômetro ou nas teclas w s; " +
        "jogador 2 (direita) no segundo potenciômetro ou nas setas ↑ ↓. Ganha quem fizer 5 pontos. " +
        "A tecla x sai do jogo e o programa segue para o próximo bloco.",
    },
    {
      type: "oled_tetris",
      message0: "🧩 jogo do Tetris",
      previousStatement: null,
      nextStatement: null,
      colour: GAME_COLOUR,
      tooltip:
        "Tetris com a placa em pé (o visor gira: as peças caem ao longo do lado comprido). " +
        "← → levam a peça para os lados, ↑ gira, ↓ desce mais rápido e espaço derruba. " +
        "Teclas pelo cabo ou pelo Bluetooth. A tecla x sai do jogo e o programa segue para o próximo bloco.",
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
    {
      type: "radio_group",
      message0: "definir grupo do rádio %1",
      args0: [{ type: "field_number", name: "GROUP", value: 1, min: 0, max: 255, precision: 1 }],
      previousStatement: null,
      nextStatement: null,
      colour: RADIO_COLOUR,
      tooltip: "As placas só conversam com as do mesmo grupo (0 a 255). Coloque no 'ao iniciar'. Sem este bloco, o grupo é 0.",
    },
    {
      type: "radio_send_number",
      message0: "rádio envia número %1",
      args0: [{ type: "input_value", name: "VALUE", check: "Number" }],
      previousStatement: null,
      nextStatement: null,
      colour: RADIO_COLOUR,
      tooltip: "Manda um número para todas as placas do mesmo grupo que estão por perto.",
    },
    {
      type: "radio_send_value",
      message0: "rádio envia %1 = %2",
      args0: [
        { type: "input_value", name: "NAME" },
        { type: "input_value", name: "VALUE", check: "Number" },
      ],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      colour: RADIO_COLOUR,
      tooltip: "Manda um nome junto com um número (ex.: \"temp\" = 25). Quem recebe sabe qual valor é pelo nome.",
    },
    {
      type: "radio_send_text",
      message0: "rádio envia texto %1",
      args0: [{ type: "input_value", name: "TEXT" }],
      previousStatement: null,
      nextStatement: null,
      colour: RADIO_COLOUR,
      tooltip: "Manda um texto para todas as placas do mesmo grupo que estão por perto.",
    },
    {
      type: "radio_on_number",
      message0: "ao receber pelo rádio número = %1",
      args0: [{ type: "field_input", name: "NUM", text: "" }],
      extensions: ["radio_number_filter"],
      nextStatement: null,
      hat: "cap",
      colour: RADIO_COLOUR,
      tooltip:
        "Roda os blocos pendurados quando chega esse número de outra placa. " +
        "Deixe vazio para rodar com qualquer número e use o bloco 'número recebido'. " +
        "Mensagens para este mesmo bloco esperam a vez; uma mensagem para outro 'ao receber' ou uma tecla para o que estiver rodando aqui.",
    },
    {
      type: "radio_on_value",
      message0: "ao receber pelo rádio nome = %1",
      args0: [{ type: "field_input", name: "NAME", text: "" }],
      nextStatement: null,
      hat: "cap",
      colour: RADIO_COLOUR,
      tooltip:
        "Roda os blocos pendurados quando chega um nome = valor com esse nome (maiúsculas e minúsculas tanto faz). " +
        "Deixe vazio para rodar com qualquer nome. Use 'valor recebido' (e 'nome recebido'). " +
        "Mensagens para este mesmo bloco esperam a vez; uma mensagem para outro 'ao receber' ou uma tecla para o que estiver rodando aqui.",
    },
    {
      type: "radio_on_text",
      message0: "ao receber pelo rádio texto = %1",
      args0: [{ type: "field_input", name: "TEXT", text: "" }],
      nextStatement: null,
      hat: "cap",
      colour: RADIO_COLOUR,
      tooltip:
        "Roda os blocos pendurados quando chega esse texto de outra placa (maiúsculas e minúsculas tanto faz). " +
        "Deixe vazio para rodar com qualquer texto e use o bloco 'texto recebido'. " +
        "Mensagens para este mesmo bloco esperam a vez; uma mensagem para outro 'ao receber' ou uma tecla para o que estiver rodando aqui.",
    },
    {
      type: "radio_number",
      message0: "número recebido",
      output: "Number",
      colour: RADIO_COLOUR,
      tooltip: "O último número que chegou pelo rádio (0 se ainda não chegou nenhum).",
    },
    {
      type: "radio_name",
      message0: "nome recebido",
      output: "String",
      colour: RADIO_COLOUR,
      tooltip: "O nome do último nome = valor que chegou pelo rádio.",
    },
    {
      type: "radio_value",
      message0: "valor recebido",
      output: "Number",
      colour: RADIO_COLOUR,
      tooltip: "O valor do último nome = valor que chegou pelo rádio (0 se ainda não chegou nenhum).",
    },
    {
      type: "radio_text",
      message0: "texto recebido",
      output: "String",
      colour: RADIO_COLOUR,
      tooltip: "O último texto que chegou pelo rádio.",
    },
  ]);

  defineDrawBlock();
  defineTextJoinBlock();

  // ---- Geradores Python ----

  pythonGenerator.forBlock["oled_draw"] = (block) => {
    return `visor_desenho('${(block as DrawBlock).bitmapB64}')\n`;
  };

  // "alterar x por 1": o do Blockly usa "from numbers import Number", que o MicroPython não tem.
  // Variável ainda sem valor (ou com texto) conta como 0.
  pythonGenerator.forBlock["math_change"] = (block, gen) => {
    const v = gen.getVariableName(block.getFieldValue("VAR"));
    const delta = gen.valueToCode(block, "DELTA", Order.ADDITIVE) || "0";
    return `${v} = (${v} if isinstance(${v}, (int, float)) else 0) + ${delta}\n`;
  };

  pythonGenerator.forBlock["event_start"] = () => "";
  pythonGenerator.forBlock["event_key"] = () => "";
  pythonGenerator.forBlock["event_button"] = () => "";
  pythonGenerator.forBlock["event_threshold"] = () => "";

  pythonGenerator.forBlock["math_convert"] = (block, gen) => {
    const v = gen.valueToCode(block, "VALUE", Order.NONE) || "0";
    const de = gen.valueToCode(block, "FROM_MIN", Order.NONE) || "0";
    const ate = gen.valueToCode(block, "FROM_MAX", Order.NONE) || "100";
    const a = gen.valueToCode(block, "MIN", Order.NONE) || "0";
    const b = gen.valueToCode(block, "MAX", Order.NONE) || "0";
    const f = gen.provideFunction_("converter", [
      "# de de..ate para a..b; fora de de..ate fica no limite; com a e b inteiros, o resultado",
      "# tambem e inteiro (bom para o LED)",
      `def ${gen.FUNCTION_NAME_PLACEHOLDER_}(v, de, ate, a, b):`,
      "  if ate == de:",
      "    return a",
      "  t = max(0, min(1, (v - de) / (ate - de)))",
      "  r = a + (b - a) * t",
      "  return round(r) if a == int(a) and b == int(b) else r",
    ]);
    return [`${f}(${v}, ${de}, ${ate}, ${a}, ${b})`, Order.FUNCTION_CALL];
  };

  pythonGenerator.forBlock["led_rgb"] = (block, gen) => {
    const r = gen.valueToCode(block, "R", Order.NONE) || "0";
    const g = gen.valueToCode(block, "G", Order.NONE) || "0";
    const b = gen.valueToCode(block, "B", Order.NONE) || "0";
    return `led_rgb(${r}, ${g}, ${b})\n`;
  };

  pythonGenerator.forBlock["led_rgb_pct"] = (block, gen) => {
    const r = gen.valueToCode(block, "R", Order.NONE) || "0";
    const g = gen.valueToCode(block, "G", Order.NONE) || "0";
    const b = gen.valueToCode(block, "B", Order.NONE) || "0";
    return `led_pct(${r}, ${g}, ${b})\n`;
  };

  pythonGenerator.forBlock["led_color"] = (block) => {
    const [r, g, b] = NAMED_COLORS[block.getFieldValue("COLOR")] ?? [0, 0, 0];
    return `led_rgb(${r}, ${g}, ${b})\n`;
  };

  pythonGenerator.forBlock["led_off"] = () => "led_rgb(0, 0, 0)\n";

  pythonGenerator.forBlock["wait_ms"] = (block, gen) => {
    const t = gen.valueToCode(block, "TIME", Order.NONE) || "0";
    return block.getFieldValue("UNIT") === "S"
      ? `_bb_esperar((${t}) * 1000)\n`
      : `_bb_esperar(${t})\n`;
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

  pythonGenerator.forBlock["oled_text"] = (block, gen) => {
    const text = gen.valueToCode(block, "TEXT", Order.NONE) || "''";
    return `visor_texto(${text}, ${block.getFieldValue("LINE")})\n`;
  };

  pythonGenerator.forBlock["oled_plot"] = (block, gen) => {
    const v = gen.valueToCode(block, "VALUE", Order.NONE) || "0";
    return `visor_grafico(${v})\n`;
  };
  pythonGenerator.forBlock["oled_clear"] = () => "visor_limpar()\n";
  for (const [tipo, cor] of [["oled_pixel_on", 1], ["oled_pixel_off", 0]] as const) {
    pythonGenerator.forBlock[tipo] = (block, gen) => {
      const x = gen.valueToCode(block, "X", Order.NONE) || "0";
      const y = gen.valueToCode(block, "Y", Order.NONE) || "0";
      return `visor_pixel(${x}, ${y}, ${cor})\n`;
    };
  }
  pythonGenerator.forBlock["oled_line_to"] = (block, gen) => {
    const x = gen.valueToCode(block, "X", Order.NONE) || "0";
    const y = gen.valueToCode(block, "Y", Order.NONE) || "0";
    return `visor_tracar(${x}, ${y})\n`;
  };
  pythonGenerator.forBlock["oled_pen_up"] = () => "visor_levantar_caneta()\n";
  pythonGenerator.forBlock["oled_snake"] = () => "_jogo_rodar(visor_cobrinha)\n";
  pythonGenerator.forBlock["oled_dino"] = () => "_jogo_rodar(visor_dino)\n";
  pythonGenerator.forBlock["oled_flappy"] = () => "_jogo_rodar(visor_flappy)\n";
  const porta = (block: Blockly.Block, campo: string) => Math.round(Number(block.getFieldValue(campo)) || 7);
  pythonGenerator.forBlock["oled_pong_cpu"] = (block) => `_jogo_rodar(lambda: visor_pong(1, ${porta(block, "PIN")}, 0))\n`;
  pythonGenerator.forBlock["oled_pong_2"] = (block) =>
    `_jogo_rodar(lambda: visor_pong(2, ${porta(block, "PIN")}, ${porta(block, "PIN2")}))\n`;
  pythonGenerator.forBlock["oled_tetris"] = () => "_jogo_rodar(visor_tetris)\n";
  pythonGenerator.forBlock["oled_breakout"] = (block) =>
    `_jogo_rodar(lambda: visor_breakout(${Math.round(Number(block.getFieldValue("PIN")) || 7)}))\n`;
  pythonGenerator.forBlock["game_speed"] = (block) => {
    const v = Math.min(10, Math.max(1, Number(block.getFieldValue("SPEED")) || 5));
    return `_jogo_velocidade = ${v}\n`;
  };

  pythonGenerator.forBlock["radio_group"] = (block) => {
    const g = Math.min(255, Math.max(0, Math.round(Number(block.getFieldValue("GROUP")) || 0)));
    return `radio_grupo(${g})\n`;
  };
  pythonGenerator.forBlock["radio_send_number"] = (block, gen) =>
    `radio_enviar_numero(${gen.valueToCode(block, "VALUE", Order.NONE) || "0"})\n`;
  pythonGenerator.forBlock["radio_send_value"] = (block, gen) => {
    const nome = gen.valueToCode(block, "NAME", Order.NONE) || "''";
    return `radio_enviar_valor(${nome}, ${gen.valueToCode(block, "VALUE", Order.NONE) || "0"})\n`;
  };
  pythonGenerator.forBlock["radio_send_text"] = (block, gen) =>
    `radio_enviar_texto(${gen.valueToCode(block, "TEXT", Order.NONE) || "''"})\n`;
  for (const t of Object.keys(RADIO_HATS)) pythonGenerator.forBlock[t] = () => "";
  pythonGenerator.forBlock["radio_number"] = () => ["_radio_numero", Order.ATOMIC];
  pythonGenerator.forBlock["radio_name"] = () => ["_radio_nome", Order.ATOMIC];
  pythonGenerator.forBlock["radio_value"] = () => ["_radio_valor", Order.ATOMIC];
  pythonGenerator.forBlock["radio_text"] = () => ["_radio_texto", Order.ATOMIC];

  // todo laço passa por _bb_ponto() a cada volta: é onde um evento novo interrompe
  pythonGenerator.forBlock["forever"] = (block, gen) => {
    const branch = gen.statementToCode(block, "DO");
    return `while _bb_rodando:\n${gen.INDENT}_bb_ponto()\n${branch}`;
  };

  pythonGenerator.forBlock["controls_repeat_ext"] = (block, gen) => {
    const times = gen.valueToCode(block, "TIMES", Order.NONE) || "0";
    const branch = gen.statementToCode(block, "DO");
    return `for _ in range(int(${times})):\n${gen.INDENT}_bb_ponto()\n${branch}`;
  };

  pythonGenerator.forBlock["controls_whileUntil"] = (block, gen) => {
    const until = block.getFieldValue("MODE") === "UNTIL";
    const cond = gen.valueToCode(block, "BOOL", until ? Order.LOGICAL_NOT : Order.NONE) || "False";
    const branch = gen.statementToCode(block, "DO");
    return `while ${until ? `not ${cond}` : cond}:\n${gen.INDENT}_bb_ponto()\n${branch}`;
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
    "    _radio.active(False)",
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
      this.setTooltip(
        "Mostra um desenho no visor, por cima do que já está na tela (texto, outro desenho). " +
          "Clique em Editar para desenhar. Para trocar de desenho (animação), use 'limpar visor' antes.",
      );
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

// ---- bloco "juntar" (texto) com botões + e − ----

type JoinBlock = Blockly.BlockSvg & { itemCount: number; updateShape(): void };

const JOIN_MIN = 2;

const roundButton = (sign: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22">' +
      '<circle cx="11" cy="11" r="10" fill="#fff" stroke="#8a8f99"/>' +
      `<text x="11" y="16" font-family="sans-serif" font-size="16" font-weight="700" text-anchor="middle" fill="#333">${sign}</text>` +
      "</svg>",
  );
const PLUS_SRC = roundButton("+");
const MINUS_SRC = roundButton("−");

/** Aplica `change` no bloco registrando a mutação (desfazer, salvar e gerar código). */
function mutateJoin(block: JoinBlock, change: () => void, after?: () => void) {
  const old = JSON.stringify({ itemCount: block.itemCount });
  Blockly.Events.setGroup(true);
  try {
    change();
    block.updateShape();
    Blockly.Events.fire(
      new Blockly.Events.BlockChange(block, "mutation", null, old, JSON.stringify({ itemCount: block.itemCount })),
    );
    after?.();
  } finally {
    Blockly.Events.setGroup(false);
  }
}

function defineTextJoinBlock() {
  Blockly.Blocks["text_join_plus"] = {
    init(this: JoinBlock) {
      this.itemCount = JOIN_MIN;
      this.setOutput(true, null);
      this.setInputsInline(true);
      this.setColour(TEXT_COLOUR);
      this.setTooltip("Junta textos e números num texto só. Use + para juntar mais itens e − para tirar.");
      this.updateShape();
    },
    saveExtraState(this: JoinBlock) {
      return { itemCount: this.itemCount };
    },
    loadExtraState(this: JoinBlock, state: { itemCount?: number }) {
      this.itemCount = Math.max(JOIN_MIN, state.itemCount ?? JOIN_MIN);
      this.updateShape();
    },
    updateShape(this: JoinBlock) {
      if (this.getInput("BUTTONS")) this.removeInput("BUTTONS");
      for (let i = 0; i < this.itemCount; i++) {
        if (!this.getInput(`ADD${i}`)) {
          const input = this.appendValueInput(`ADD${i}`);
          if (i === 0) input.appendField("juntar");
        }
      }
      // itens a mais (botão −): o bloco encaixado sai e fica solto
      for (let i = this.itemCount; this.getInput(`ADD${i}`); i++) this.removeInput(`ADD${i}`);

      const buttons = this.appendDummyInput("BUTTONS");
      buttons.appendField(
        new Blockly.FieldImage(PLUS_SRC, 22, 22, "+", () => {
          if (this.isInFlyout) return;
          mutateJoin(
            this,
            () => this.itemCount++,
            // o novo item já vem com um texto vazio para digitar
            () => this.getInput(`ADD${this.itemCount - 1}`)!.connection!.setShadowState({ type: "text", fields: { TEXT: "" } }),
          );
        }),
      );
      if (this.itemCount > JOIN_MIN) {
        buttons.appendField(
          new Blockly.FieldImage(MINUS_SRC, 22, 22, "−", () => {
            if (this.isInFlyout) return;
            mutateJoin(this, () => this.itemCount--);
          }),
        );
      }
    },
  };

  pythonGenerator.forBlock["text_join_plus"] = (block, gen) => {
    const parts: string[] = [];
    for (let i = 0; i < (block as JoinBlock).itemCount; i++) {
      const code = gen.valueToCode(block, `ADD${i}`, Order.NONE);
      if (!code || code === "''") continue;
      // textos já são str; números, leituras e o resto viram texto
      parts.push(block.getInputTargetBlock(`ADD${i}`)?.type === "text" ? code : `str(${code})`);
    }
    if (parts.length === 0) return ["''", Order.ATOMIC];
    if (parts.length === 1) return [parts[0], Order.FUNCTION_CALL];
    return [parts.join(" + "), Order.ADDITIVE];
  };
}

/** Cabeçalho fixo do programa: imports e função auxiliar do LED. */
export function preamble(pin: number): string {
  return [
    "from machine import Pin, PWM, ADC, Timer",
    "from neopixel import NeoPixel",
    "import time",
    "",
    "# LED embutido (WS2812) fica apagado: os blocos de LED usam o LED RGB das portas 4, 5 e 6",
    `np = NeoPixel(Pin(${pin}, Pin.OUT), 1)`,
    "np[0] = (0, 0, 0)",
    "np.write()",
    "",
    "# vira False quando o app manda parar (botao Parar ou novo envio): encerra os lacos",
    "_bb_rodando = True",
    "",
    "# Ctrl-C (botao Parar) que cai dentro de um timer seria engolido por ele:",
    "# o timer so anota, e o programa para no proximo _bb_ponto()",
    "_bb_ctrl_c = False",
    "",
    "def _bb_protegido(f):",
    "    def cb(t):",
    "        global _bb_ctrl_c",
    "        try:",
    "            f(t)",
    "        except KeyboardInterrupt:",
    "            _bb_ctrl_c = True",
    "    return cb",
    "",
    "# --- eventos: o leitor de teclas (cabo ou Bluetooth) so anota o evento; quem roda e o programa ---",
    "# Todo repetir e esperar passa por _bb_ponto(): se chegou um evento novo, o evento",
    "# que estava rodando para (o ultimo comando manda) e o 'ao iniciar' so pausa.",
    "class _BBInterrompe(BaseException):",
    "    pass",
    "",
    "_bb_pendente = None",
    "_bb_em_evento = False",
    "",
    "def _bb_evento(f):",
    "    def disparar():",
    "        global _bb_pendente",
    "        _bb_pendente = f",
    "    return disparar",
    "",
    "# fila de eventos do radio: [(chave, f)], a chave diz quais blocos 'ao receber' rodam.",
    "# Rodam no proximo _bb_ponto(), pausando o que estiver rodando. Mensagens para os mesmos",
    "# blocos esperam a vez, em ordem; uma tecla ou uma mensagem para outros blocos corta",
    "# o que esta rodando (senao um 'repetir para sempre' la dentro seguraria tudo).",
    "_bb_fila = []",
    "_bb_na_fila = None  # chave do evento da fila que esta rodando",
    "_bb_cortar = False",
    "_bb_ler_radio = None  # le as mensagens que chegaram (so com blocos de radio)",
    "_bb_ler_entradas = None  # confere botoes e limites dos blocos 'quando clicar botao' e 'passar de'",
    "_bb_visor = None  # manda para a tela os pixels pintados/apagados (blocos 'pintar pixel')",
    "",
    "def _bb_rodar_fila():",
    "    global _bb_na_fila, _bb_cortar",
    "    try:",
    "        while _bb_fila and _bb_rodando:",
    "            _bb_na_fila, f = _bb_fila.pop(0)",
    "            _bb_cortar = False",
    "            try:",
    "                f()",
    "            except _BBInterrompe:",
    "                if _bb_pendente is not None:",
    "                    return  # uma tecla chegou: ela roda agora, o resto da fila depois",
    "    finally:",
    "        _bb_na_fila = None",
    "",
    "def _bb_rodar_eventos():",
    "    global _bb_pendente, _bb_em_evento",
    "    while _bb_pendente is not None and _bb_rodando:",
    "        f, _bb_pendente = _bb_pendente, None",
    "        _bb_em_evento = True",
    "        try:",
    "            f()",
    "        except _BBInterrompe:",
    "            pass",
    "        finally:",
    "            _bb_em_evento = False",
    "",
    "_bb_folga = time.ticks_ms()",
    "",
    "def _bb_ponto():",
    "    global _bb_folga",
    "    if _bb_ctrl_c:",
    "        raise KeyboardInterrupt()",
    "    # laco sem esperar: a cada 20 ms cede 1 ms, senao o USB e o Bluetooth (parar/enviar) nao rodam",
    "    agora = time.ticks_ms()",
    "    if time.ticks_diff(agora, _bb_folga) >= 20:",
    "        _bb_folga = agora",
    "        time.sleep_ms(1)",
    "        if _bb_ler_radio:",
    "            _bb_ler_radio()",
    "        if _bb_ler_entradas:",
    "            _bb_ler_entradas()",
    "        if _bb_visor:",
    "            _bb_visor()",
    "    if _bb_na_fila is not None:",
    "        if _bb_cortar or _bb_pendente is not None:",
    "            raise _BBInterrompe()",
    "        return  # mensagens para o mesmo bloco esperam ele acabar",
    "    if _bb_fila:",
    "        _bb_rodar_fila()",
    "    if _bb_pendente is not None:",
    "        if _bb_em_evento:",
    "            raise _BBInterrompe()",
    "        _bb_rodar_eventos()",
    "",
    "def _bb_esperar(ms):",
    "    fim = time.ticks_add(time.ticks_ms(), int(ms))",
    "    while True:",
    "        _bb_ponto()",
    "        falta = time.ticks_diff(fim, time.ticks_ms())",
    "        if falta <= 0:",
    "            return",
    "        time.sleep_ms(min(falta, 20))",
    "",
    "_pwms = {}",
    "",
    "_LED_PORTAS = (4, 5, 6)  # vermelho, verde, azul",
    "",
    "def led_rgb(r, g, b):",
    "    for n, v in zip(_LED_PORTAS, (r, g, b)):",
    "        v = max(0, min(255, int(v)))",
    "        if n not in _pwms:",
    "            _pwms[n] = PWM(Pin(n), freq=1000)",
    "        _pwms[n].duty_u16(v * 65535 // 255)",
    "",
    "def led_pct(r, g, b):  # bloco 'acender LED' de 0 a 100%",
    "    led_rgb(r * 255 / 100, g * 255 / 100, b * 255 / 100)",
    "",
    "led_rgb(0, 0, 0)  # comeca sempre com o LED apagado",
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
    "_adc_hist = {}  # ultimas leituras de cada porta, para a media movel",
    "_adc_topo = {}  # porta -> maior media ja vista (em % da escala): e o que vale 100%",
    "_adc_saida = {}  # porta -> ultimo valor devolvido (0..100)",
    "",
    "def porta_analogica(n):",
    "    if n not in _adcs:",
    "        _adcs[n] = ADC(Pin(n), atten=ADC.ATTN_11DB)",
    "        _adc_hist[n] = []",
    "    a = _adcs[n]",
    "    s = 0",
    "    for _ in range(16):  # 16 leituras seguidas (menos de 1 ms) tiram o ruido na hora",
    "        s += a.read_u16()",
    "    h = _adc_hist[n]",
    "    h.append(s / 16)",
    "    if len(h) > 20:",
    "        del h[0]",
    "    p = sum(h) / len(h) * 100 / 65535  # media movel dos 20 ultimos dados",
    "    # O ADC mede tensao, nao a posicao do potenciometro: com a alimentacao um pouco abaixo",
    "    # de 3,3 V (USB, pilhas) o maximo fica abaixo do topo da escala e nunca daria 100%.",
    "    # Por isso o 100% e o maior valor que essa porta ja mostrou (pelo menos 75% da escala):",
    "    # girar o potenciometro ate o fim uma vez ja acerta a escala. So aprende com a leitura",
    "    # firme (as 20 ultimas medidas a menos de 4% uma da outra): um pico ao mexer nos fios",
    "    # ou encaixar um componente nao vira o 100%.",
    "    topo = _adc_topo.get(n, 75)",
    "    if p > topo and len(h) == 20 and max(h) - min(h) < 65535 * 4 // 100:",
    "        topo = _adc_topo[n] = p",
    "    # ate 5% vale 0 e dos 4% de baixo do topo para cima vale 100; o meio vira 0..100.",
    "    # (o topo aprendido costuma ser um pico do ruido: os 4% seguram o maximo em 100)",
    "    if p <= 5:",
    "        v = 0",
    "    elif p >= topo - 4:",
    "        v = 100",
    "    else:",
    "        v = (p - 5) * 100 / (topo - 9)",
    "    # o numero so muda quando a leitura anda 2 pontos (0 e 100 valem na hora):",
    "    # assim o ruido do ADC nao faz o valor ficar tremendo",
    "    antes = _adc_saida.get(n)",
    "    if antes is None or v == 0 or v == 100 or abs(v - antes) >= 2:",
    "        antes = _adc_saida[n] = round(v)",
    "    return antes",
    "",
    "",
  ].join("\n");
}

/** Chapéus "ao receber ... pelo rádio" e o tipo de mensagem de cada um. */
const RADIO_HATS: Record<string, string> = { radio_on_number: "n", radio_on_value: "v", radio_on_text: "t" };

const HAT_TYPES = ["event_start", "event_key", "event_button", "event_threshold", ...Object.keys(RADIO_HATS)];

/** Teclas usadas pelos blocos "quando apertar a tecla". */
export function eventKeys(workspace: Blockly.Workspace): Set<string> {
  return new Set(
    workspace.getTopBlocks(false).filter((b) => b.type === "event_key").map((b) => b.getFieldValue("KEY") as string),
  );
}

/** Gera o código só das pilhas penduradas em eventos; blocos soltos são ignorados. */
export function programCode(workspace: Blockly.Workspace): string {
  pythonGenerator.init(workspace);
  const tops = workspace.getTopBlocks(true);
  let code = "";

  // cada evento vira uma função Python: sem "global", "definir x" lá dentro criaria outro x,
  // só daquela função, e o resto do programa não veria a mudança
  const variaveis = workspace.getVariableMap().getAllVariables().map((v) => pythonGenerator.getVariableName(v.getId()));
  const globais = variaveis.length ? `global ${variaveis.join(", ")}\n` : "";

  // "quando apertar a tecla": cada pilha vira uma função registrada em _teclas
  const keyHats = tops.filter((b) => b.type === "event_key");
  const jogos = gameKeys(workspace).size > 0;
  if (keyHats.length > 0 || jogos) code += keysRuntimeCode();
  if (jogos) code += gamesCode(workspace);
  const radioHats = tops.filter((b) => b.type in RADIO_HATS);
  const buttonHats = tops.filter((b) => b.type === "event_button");
  const thresholdHats = tops.filter((b) => b.type === "event_threshold");
  if (buttonHats.length > 0 || thresholdHats.length > 0) code += inputsRuntimeCode();
  if (usesRadio(workspace)) code += radioCode();
  keyHats.forEach((hat, i) => {
    const next = hat.getNextBlock();
    let body = next ? pythonGenerator.blockToCode(next) : "";
    if (Array.isArray(body)) body = body[0];
    body = globais + body;
    const key = hat.getFieldValue("KEY");
    code += `def _tecla_${i}():\n${pythonGenerator.prefixLines(body || pythonGenerator.PASS, pythonGenerator.INDENT)}`;
    code += `_teclas[${JSON.stringify(key)}] = _bb_evento(_tecla_${i})\n\n`;
  });

  // "quando clicar botão": cada pilha vira um evento ligado à porta do botão
  buttonHats.forEach((hat, i) => {
    const next = hat.getNextBlock();
    let body = next ? pythonGenerator.blockToCode(next) : "";
    if (Array.isArray(body)) body = body[0];
    body = globais + body;
    const pin = Math.round(Number(hat.getFieldValue("PIN")) || 0);
    code += `def _botao_${i}():\n${pythonGenerator.prefixLines(body || pythonGenerator.PASS, pythonGenerator.INDENT)}`;
    code += `_botoes.append((${pin}, _bb_evento(_botao_${i})))\n\n`;
  });

  // "quando valor porta passar de": cada pilha vira um evento ligado à porta e ao limite
  thresholdHats.forEach((hat, i) => {
    const next = hat.getNextBlock();
    let body = next ? pythonGenerator.blockToCode(next) : "";
    if (Array.isArray(body)) body = body[0];
    body = globais + body;
    const pin = Math.round(Number(hat.getFieldValue("PIN")) || 0);
    const limite = Math.min(100, Math.max(0, Number(hat.getFieldValue("LIMIT")) || 0));
    code += `def _limite_${i}():\n${pythonGenerator.prefixLines(body || pythonGenerator.PASS, pythonGenerator.INDENT)}`;
    code += `_limite_novo(${pin}, ${limite}, _bb_evento(_limite_${i}))\n\n`;
  });

  // "ao receber ... pelo rádio": cada pilha vira uma função da lista do seu tipo de mensagem
  radioHats.forEach((hat, i) => {
    const next = hat.getNextBlock();
    let body = next ? pythonGenerator.blockToCode(next) : "";
    if (Array.isArray(body)) body = body[0];
    body = globais + body;
    // o campo do chapéu filtra a mensagem (vazio: qualquer uma)
    let filtro = "None";
    if (hat.type === "radio_on_number") {
      const n = String(hat.getFieldValue("NUM") ?? "").trim();
      if (n !== "" && Number.isFinite(Number(n))) filtro = String(Number(n));
    } else {
      const t = String(hat.getFieldValue(hat.type === "radio_on_text" ? "TEXT" : "NAME") ?? "").trim();
      if (t) filtro = pythonGenerator.quote_(t);
    }
    code += `def _radio_ao_${i}():\n${pythonGenerator.prefixLines(body || pythonGenerator.PASS, pythonGenerator.INDENT)}`;
    code += `_radio_ao['${RADIO_HATS[hat.type]}'].append((${filtro}, _radio_ao_${i}))\n\n`;
  });

  // "ao iniciar" (existe só um no espaço de trabalho)
  for (const block of tops) {
    if (block.type !== "event_start") continue;
    let c = pythonGenerator.blockToCode(block);
    if (Array.isArray(c)) c = c[0];
    if (c) code += c;
  }
  // pixels pintados no fim do "ao iniciar" vão para a tela (sem esperar o próximo _bb_ponto)
  code += "_visor_pixels_na_tela()\n";

  // com teclas, botões ou rádio, o programa precisa continuar vivo para receber os eventos
  if (keyHats.length > 0 || buttonHats.length > 0 || thresholdHats.length > 0 || radioHats.length > 0) {
    code += "\n# roda os eventos que chegarem\nwhile True:\n    _bb_ponto()\n    time.sleep_ms(20)\n";
  }
  return pythonGenerator.finish(code);
}

/**
 * Entradas dos chapéus "quando clicar botão" e "quando valor porta passar de",
 * conferidas no _bb_ponto() a cada ~20 ms.
 * - botão: dispara quando passa de solto para apertado (a leitura a cada 20 ms já
 *   filtra o tremido do contato); se já estava apertado no começo, não conta.
 * - limite: dispara quando o valor sobe e passa do limite; só se arma de novo quando
 *   o valor desce 3% abaixo dele (o ruído do sensor perto do limite não dispara de novo).
 *   Se já estava acima no começo, não conta.
 */
function inputsRuntimeCode(): string {
  return [
    "# --- entradas ('quando clicar botao', 'quando valor porta passar de') ---",
    "_botoes = []  # (porta, evento)",
    "_botoes_antes = {}  # porta -> estava apertado na ultima leitura",
    "_limites = []  # [porta, limite, evento, armado]",
    "",
    "def _limite_novo(n, limite, evento):",
    "    _limites.append([n, limite, evento, porta_analogica(n) <= limite])",
    "",
    "def _ler_entradas():",
    "    for n, evento in _botoes:",
    "        agora = porta_ler(n)",
    "        if agora and not _botoes_antes.get(n, True):",
    "            evento()",
    "        _botoes_antes[n] = agora",
    "    for l in _limites:",
    "        v = porta_analogica(l[0])",
    "        if l[3] and v > l[1]:",
    "            l[3] = False",
    "            l[2]()",
    "        elif not l[3] and v <= l[1] - 3:",
    "            l[3] = True",
    "",
    "_bb_ler_entradas = _ler_entradas",
    "",
    "",
  ].join("\n");
}

/** Leitor de teclas: um timer lê a serial e chama a função da tecla recebida. */
function keysRuntimeCode(): string {
  return [
    "# --- teclas do computador (pelo cabo) ---",
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
    "                f = _teclas.get(nome[1:])",
    "                if f:",
    "                    f()",
    "        else:",
    "            _tecla_buf += c",
    "",
    "_key_timer = Timer(1)",
    "_key_timer.init(period=15, mode=Timer.PERIODIC, callback=_bb_protegido(_tecla_ler))",
    "",
    "",
  ].join("\n");
}

function usesRadio(workspace: Blockly.Workspace): boolean {
  return programBlocks(workspace).some((b) => b.type.startsWith("radio_"));
}

/**
 * Rádio entre placas por ESP-NOW: cada mensagem vai para todas as placas por
 * perto (sem roteador), e quem é de outro grupo ignora. Mensagem:
 * "BB" + grupo + número de sequência + tipo (n, v ou t) + dados.
 * O rádio do Wi-Fi é dividido com o Bluetooth do app, então cada mensagem vai
 * duas vezes e quem recebe descarta a cópia (mesma placa, mesma sequência).
 * As mensagens são lidas no _bb_ponto() (sem irq: a fila do micropython.schedule
 * já é dividida entre o Bluetooth e os timers) e rodam pela _bb_fila, em ordem.
 */
function radioCode(): string {
  return [
    "# --- radio entre placas (ESP-NOW) ---",
    "import network, espnow",
    "_radio_wlan = network.WLAN(network.STA_IF)",
    "_radio_wlan.active(True)",
    "try:",
    "    _radio_wlan.disconnect()",
    "    _radio_wlan.config(channel=1)  # todas as placas no mesmo canal",
    "except Exception:",
    "    pass",
    "_radio = espnow.ESPNow()",
    "try:",
    "    _radio.active(False)  # programa anterior pode ter deixado ligado",
    "except Exception:",
    "    pass",
    "_radio.config(rxbuf=4096)  # espaco para varias mensagens chegando juntas",
    "_radio.active(True)",
    "_RADIO_TODOS = b'\\xff' * 6",
    "try:",
    "    _radio.add_peer(_RADIO_TODOS)",
    "except OSError:",
    "    pass  # ja estava",
    "",
    "_radio_grupo = 0",
    "_radio_seq = time.ticks_ms() & 255",
    "_radio_visto = {}  # placa -> ultima sequencia recebida (descarta a copia)",
    "_radio_ao = {'n': [], 'v': [], 't': []}  # (texto do filtro ou None, bloco 'ao receber') de cada tipo",
    "_radio_numero = 0",
    "_radio_nome = ''",
    "_radio_valor = 0",
    "_radio_texto = ''",
    "",
    "def radio_grupo(g):",
    "    global _radio_grupo",
    "    _radio_grupo = int(g) & 255",
    "",
    "def _radio_enviar(tipo, dados):",
    "    global _radio_seq",
    "    _radio_seq = (_radio_seq + 1) & 255",
    "    msg = b'BB' + bytes((_radio_grupo, _radio_seq)) + tipo + dados",
    "    for _ in range(2):",
    "        try:",
    "            _radio.send(_RADIO_TODOS, msg, False)",
    "        except OSError:",
    "            pass  # fila de envio cheia: essa copia se perde",
    "",
    "def _radio_num_bytes(v):",
    "    try:",
    "        v = float(v)",
    "        if v == int(v):",
    "            v = int(v)",
    "    except (TypeError, ValueError, OverflowError):",
    "        v = 0",
    "    return str(v).encode()",
    "",
    "def _radio_num(b):",
    "    try:",
    "        v = float(_radio_str(b))",
    "        return int(v) if v == int(v) else v",
    "    except (ValueError, OverflowError):",
    "        return 0",
    "",
    "# texto -> bytes com no maximo n bytes, sem partir uma letra acentuada ao meio",
    "def _radio_cortar(txt, n):",
    "    txt = str(txt)[:n]",
    "    b = txt.encode()",
    "    while len(b) > n:",
    "        txt = txt[:-1]",
    "        b = txt.encode()",
    "    return b",
    "",
    "def _radio_str(b):",
    "    try:",
    "        return b.decode()",
    "    except Exception:",
    "        return ''",
    "",
    "# 'ao receber texto/nome = ...': sem diferenca de maiusculas nem espacos nas pontas",
    "def _radio_igual(a, b):",
    "    return a.strip().lower() == b.strip().lower()",
    "",
    "def radio_enviar_numero(v):",
    "    _radio_enviar(b'n', _radio_num_bytes(v))",
    "",
    "def radio_enviar_valor(nome, v):",
    "    _radio_enviar(b'v', _radio_cortar(nome, 40) + b'\\x00' + _radio_num_bytes(v))",
    "",
    "def radio_enviar_texto(txt):",
    "    _radio_enviar(b't', _radio_cortar(txt, 200))",
    "",
    "def _radio_tratar(tipo, dados, blocos):",
    "    global _radio_numero, _radio_nome, _radio_valor, _radio_texto",
    "    if tipo == 'n':",
    "        _radio_numero = _radio_num(dados)",
    "    elif tipo == 'v':",
    "        i = dados.find(b'\\x00')",
    "        if i < 0:",
    "            return",
    "        _radio_nome = _radio_str(dados[:i])",
    "        _radio_valor = _radio_num(dados[i + 1:])",
    "    else:",
    "        _radio_texto = _radio_str(dados)",
    "    for f in blocos:",
    "        f()",
    "",
    "def _radio_ler():",
    "    global _bb_cortar",
    "    while True:",
    "        mac, msg = _radio.irecv(0)",
    "        if mac is None:",
    "            return",
    "        if len(msg) < 5 or msg[0] != 66 or msg[1] != 66 or msg[2] != _radio_grupo:",
    "            continue  # nao e do Beta Blocks ou e de outro grupo",
    "        mac = bytes(mac)",
    "        if _radio_visto.get(mac) == msg[3]:",
    "            continue  # a segunda copia da mesma mensagem",
    "        _radio_visto[mac] = msg[3]",
    "        tipo = chr(msg[4])",
    "        if tipo not in _radio_ao:",
    "            continue",
    "        dados = bytes(msg[5:])",
    "        # o que o campo do 'ao receber' compara: o numero, o nome ou o texto",
    "        if tipo == 'n':",
    "            chave = _radio_num(dados)",
    "        elif tipo == 'v':",
    "            chave = _radio_str(dados[:dados.find(b'\\x00')])",
    "        else:",
    "            chave = _radio_str(dados)",
    "        blocos = tuple(f for filtro, f in _radio_ao[tipo] if filtro is None or",
    "                       (chave == filtro if tipo == 'n' else _radio_igual(chave, filtro)))",
    "        if not blocos:",
    "            _radio_tratar(tipo, dados, ())  # nenhum 'ao receber': so guarda para os blocos 'recebido'",
    "            continue",
    "        if _bb_na_fila is not None and _bb_na_fila != blocos:",
    "            # mensagem para outros blocos: corta o que esta rodando e passa na frente",
    "            _bb_fila.clear()",
    "            _bb_cortar = True",
    "        if len(_bb_fila) < 10:  # fila cheia: a mensagem se perde",
    "            _bb_fila.append((blocos, lambda t=tipo, d=dados, b=blocos: _radio_tratar(t, d, b)))",
    "",
    "_bb_ler_radio = _radio_ler",
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
    if (["input_analog", "event_threshold", "oled_breakout", "oled_pong_cpu", "oled_pong_2"].includes(block.type)) analog.add(pin);
    else if (["input_digital", "input_if", "input_ifelse", "event_button"].includes(block.type)) digital.add(pin);
  }
  // o Pong para dois tem a segunda raquete em outra porta
  for (const block of programBlocks(workspace)) {
    if (block.type === "oled_pong_2" && !block.isInsertionMarker()) analog.add(Number(block.getFieldValue("PIN2")));
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
    "    s = json.dumps(v)",
    "    print('\\x1e' + s)",
    "    try:",
    "        _ble_mon(s)  # boot.py: deixa a leitura para o app ler pelo Bluetooth",
    "    except NameError:  # boot.py antigo",
    "        pass",
    "",
    "try:",
    "    _bb_timer.deinit()",
    "except NameError:",
    "    pass",
    "_bb_timer = Timer(3)",
    "_bb_timer.init(period=100, mode=Timer.PERIODIC, callback=_bb_protegido(_monitor))",
    "",
    "",
  ].join("\n");
}


/** Jogos do visor e as teclas que cada um usa. */
const GAMES: Record<string, string[]> = {
  oled_snake: ["up", "down", "left", "right", "x"],
  oled_dino: ["up", "down", "space", "x"],
  oled_flappy: ["up", "space", "x"],
  oled_breakout: ["left", "right", "space", "x"],
  oled_pong_cpu: ["up", "down", "w", "s", "space", "x"],
  oled_pong_2: ["up", "down", "w", "s", "space", "x"],
  oled_tetris: ["left", "right", "up", "down", "space", "x"],
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
 * (_teclas), tanto pelo cabo quanto pelo Bluetooth (boot.py).
 */
function gamesCode(workspace: Blockly.Workspace): string {
  let code = gamesCommonCode();
  if (usesGame(workspace, "oled_snake")) code += snakeCode();
  if (usesGame(workspace, "oled_dino")) code += dinoCode();
  if (usesGame(workspace, "oled_flappy")) code += flappyCode();
  if (usesGame(workspace, "oled_breakout")) code += breakoutCode();
  if (usesGame(workspace, "oled_pong_cpu") || usesGame(workspace, "oled_pong_2")) code += pongCode();
  if (usesGame(workspace, "oled_tetris")) code += tetrisCode();
  return code;
}

function gamesCommonCode(): string {
  return [
    "# --- jogos ---",
    "import random",
    "_jogo_tecla = False  # alguma tecla do jogo foi apertada?",
    "_jogo_velocidade = 5  # 1..10, mudado pelo bloco 'velocidade do jogo'",
    "_jogo_sair = False  # a tecla x foi apertada: o jogo acaba na proxima pausa",
    "",
    "class _JogoSair(BaseException):",
    "    pass",
    "",
    "def _jogo_tecla_sair():",
    "    global _jogo_sair",
    "    _jogo_sair = True",
    "",
    "# toda pausa dos jogos passa por aqui: e onde a tecla x encerra o jogo",
    "def _jogo_pausa(ms):",
    "    _bb_esperar(ms)",
    "    if _jogo_sair:",
    "        raise _JogoSair()",
    "",
    "# o jogo troca as teclas dele em _teclas; ao sair (ou ser interrompido) devolve as do programa",
    "def _jogo_rodar(jogo):",
    "    global _jogo_sair",
    "    antes = dict(_teclas)",
    "    _jogo_sair = False",
    "    _teclas['x'] = _jogo_tecla_sair",
    "    try:",
    "        jogo()",
    "    except _JogoSair:",
    "        # saiu com x: visor e LED limpos, e o programa segue no proximo bloco",
    "        oled.fill(0)",
    "        _visor_mostrar()",
    "        led_rgb(0, 0, 0)",
    "    finally:",
    "        _jogo_sair = False",
    "        _teclas.clear()",
    "        _teclas.update(antes)",
    "",
    "def _jogo_centro(txt, y):",
    "    oled.text(txt, max(0, (oled.width - len(txt) * 8) // 2), y, 1)",
    "",
    "# tela de titulo / fim de jogo: espera uma tecla do jogo",
    "# mexeu (opcional): funcao que diz se o jogador mexeu em outro controle (ex.: girou o potenciometro)",
    "def _jogo_esperar(titulo, sub, dica, mexeu=None):",
    "    global _jogo_tecla",
    "    oled.fill(0)",
    "    alto = oled.height >= 64",
    "    _jogo_centro(titulo, 8 if alto else 0)",
    "    if sub:",
    "        _jogo_centro(sub, 26 if alto else 12)",
    "    _jogo_centro(dica, oled.height - (12 if alto else 8))",
    "    _visor_mostrar()",
    "    _jogo_pausa(500)",
    "    _jogo_tecla = False",
    "    while not _jogo_tecla and _bb_rodando and not (mexeu and mexeu()):",
    "        _jogo_pausa(50)",
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
    "_cob_dir = (1, 0)  # direcao atual",
    "# setas apertadas ainda nao usadas, uma por passo: duas setas rapidas (ex.: cima e",
    "# esquerda para fazer a curva) valem as duas, mesmo chegando no mesmo passo",
    "_cob_fila = []",
    "",
    "def _cob_seta(nome):",
    "    global _jogo_tecla",
    "    if len(_cob_fila) < 3:",
    "        _cob_fila.append(_COB_DIRS[nome])",
    "    _jogo_tecla = True",
    "",
    "def _cob_maca(cobra, w, h):",
    "    while True:",
    "        m = (random.randint(0, w - 1), random.randint(0, h - 1))",
    "        if m not in cobra:",
    "            return m",
    "",
    "def visor_cobrinha():",
    "    global _cob_dir",
    "    _visor_garantir()",
    "    for n in _COB_DIRS:",
    "        _teclas[n] = (lambda k: lambda: _cob_seta(k))(n)",
    "    C = 4  # tamanho de cada casa, em pixels",
    "    # moldura de 1 px na borda (a parede) e a arena centralizada dentro dela",
    "    W = (oled.width - 2) // C",
    "    H = (oled.height - 2) // C",
    "    OX = 1 + (oled.width - 2 - W * C) // 2",
    "    OY = 1 + (oled.height - 2 - H * C) // 2",
    "    _jogo_esperar('COBRINHA', 'x sai do jogo', 'aperte uma seta')",
    "    while _bb_rodando:",
    "        cobra = [(W // 2 - i, H // 2) for i in range(3)]  # cabeca primeiro",
    "        _cob_dir = (1, 0)",
    "        _cob_fila.clear()",
    "        pontos = 0",
    "        passo0 = 1000 // _jogo_velocidade  # ms entre passos (5 -> 200 ms)",
    "        passo = passo0",
    "        maca = _cob_maca(cobra, W, H)",
    "        led_ate = None",
    "        while _bb_rodando:",
    "            while _cob_fila:",
    "                d = _cob_fila.pop(0)",
    "                # ignora meia-volta e a direcao que ja esta: passa para a proxima seta",
    "                if d != _cob_dir and (d[0] + _cob_dir[0] != 0 or d[1] + _cob_dir[1] != 0):",
    "                    _cob_dir = d",
    "                    break",
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
    "            _jogo_pausa(passo)",
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
    "    _jogo_esperar('DINO', 'x sai do jogo', 'aperte uma tecla')",
    "    while _bb_rodando:",
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
    "        while vivo and _bb_rodando:",
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
    "            _jogo_pausa(25)",
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

/**
 * Pong: contra a máquina (modo 1) ou para dois na mesma placa (modo 2). Cada raquete
 * segue um potenciômetro ou as teclas (jogador 1: w s; jogador 2: ↑ ↓; contra a
 * máquina, ↑ ↓ também movem o jogador). Ganha quem fizer 5 pontos.
 */
function pongCode(): string {
  return [
    "# --- jogo do Pong ---",
    "_pong_modo = 1",
    "_pong_mov = [0, 0]  # teclas apertadas de cada raquete (-1 sobe, +1 desce)",
    "_pong_sacar = False",
    "",
    "def _pong_tecla(nome):",
    "    global _pong_sacar, _jogo_tecla",
    "    _jogo_tecla = True",
    "    if nome in ('w', 's'):",
    "        _pong_mov[0] += -1 if nome == 'w' else 1",
    "    elif nome in ('up', 'down'):",
    "        _pong_mov[0 if _pong_modo == 1 else 1] += -1 if nome == 'up' else 1",
    "    else:",
    "        _pong_sacar = True",
    "",
    "# rebateu: a direcao depende de onde bateu (meio sai reto, pontas inclinam) e a bola acelera 5%",
    "def _pong_rebate(vx, vy, by, y, ph, lado, vmax):",
    "    t = max(-1, min(1, (by + 1 - (y + ph / 2)) / (ph / 2)))",
    "    s = min(vmax, (vx * vx + vy * vy) ** 0.5 * 1.05)",
    "    vy = s * 0.75 * t",
    "    return lado * (s * s - vy * vy) ** 0.5, vy",
    "",
    "def visor_pong(modo, pino1, pino2):",
    "    global _pong_modo, _pong_sacar",
    "    _pong_modo = modo",
    "    _visor_garantir()",
    "    for n in ('up', 'down', 'w', 's', 'space'):",
    "        _teclas[n] = (lambda k: lambda: _pong_tecla(k))(n)",
    "    W, H = oled.width, oled.height",
    "    PH, TOPO = 14, 8  # altura das raquetes; o placar fica acima de TOPO",
    "    X1, X2 = 2, W - 4  # raquete da esquerda e da direita (2 px de largura)",
    "    pinos = (pino1, pino2) if modo == 2 else (pino1,)",
    "    base = [porta_analogica(p) for p in pinos]",
    "    def mexeu():  # girar um potenciometro tambem comeca o jogo",
    "        return any(abs(porta_analogica(p) - b) > 10 for p, b in zip(pinos, base))",
    "    def altura(v):  # potenciometro 0..100 -> raquete (girar para 100 sobe)",
    "        return TOPO + (100 - v) * (H - 1 - TOPO - PH) / 100",
    "    _jogo_esperar('PONG', 'x sai do jogo', 'gire ou aperte', mexeu)",
    "    while _bb_rodando:",
    "        placar = [0, 0]",
    "        ys = [(TOPO + H - PH) / 2] * 2",
    "        pots = [porta_analogica(p) for p in pinos]",
    "        saque = random.choice((-1, 1))",
    "        led_ate = 0",
    "        while max(placar) < 5 and _bb_rodando:",
    "            # saque do meio, para o lado de quem perdeu o ponto; pixels por SEGUNDO (pelo relogio)",
    "            vel = 30 * (0.8 + 0.12 * _jogo_velocidade)  # 42 px/s na velocidade 5",
    "            vmax = vel * 2.2",
    "            bx, by = W / 2 - 1, (TOPO + H) / 2 - 1",
    "            vx, vy = vel * 0.85 * saque, vel * random.choice((-0.5, 0.5))",
    "            antes = time.ticks_ms()",
    "            solta = time.ticks_add(antes, 1000)",
    "            _pong_sacar = False",
    "            ponto = None",
    "            erro = 0.0  # a maquina erra a mira um pouco (sorteado a cada rebatida do jogador)",
    "            while ponto is None and _bb_rodando:",
    "                agora = time.ticks_ms()",
    "                dt = min(0.1, time.ticks_diff(agora, antes) / 1000)",
    "                antes = agora",
    "                # raquetes: o potenciometro manda quando gira; as teclas empurram 6 px",
    "                for i, p in enumerate(pinos):",
    "                    v = porta_analogica(p)",
    "                    if v != pots[i]:",
    "                        pots[i] = v",
    "                        ys[i] = altura(v)",
    "                for i in (0, 1):",
    "                    if _pong_mov[i]:",
    "                        ys[i] += _pong_mov[i] * 6",
    "                        _pong_mov[i] = 0",
    "                if modo == 1:",
    "                    # a maquina: vai atras da bola quando ela vem para o seu lado, com velocidade limitada",
    "                    alvo = by + 1 - PH / 2 + erro if vx > 0 and bx > W * 0.35 else (TOPO + H - PH) / 2",
    "                    passo = (20 + 4 * _jogo_velocidade) * dt  # 40 px/s na velocidade 5",
    "                    ys[1] += max(-passo, min(passo, alvo - ys[1]))",
    "                for i in (0, 1):",
    "                    ys[i] = max(TOPO, min(H - 1 - PH, ys[i]))  # dentro do contorno",
    "                if _pong_sacar or time.ticks_diff(agora, solta) >= 0:",
    "                    # a bola anda em passos de no maximo 2 px: nao atravessa a raquete",
    "                    passos = int((vx * vx + vy * vy) ** 0.5 * dt / 2) + 1",
    "                    for _ in range(passos):",
    "                        bx += vx * dt / passos",
    "                        by += vy * dt / passos",
    "                        if by < TOPO:",
    "                            by, vy = float(TOPO), abs(vy)",
    "                        elif by > H - 3:  # 1 px acima do contorno",
    "                            by, vy = H - 3.0, -abs(vy)",
    "                        if vx < 0 and X1 - 1 <= bx <= X1 + 2 and ys[0] - 1 <= by + 1 <= ys[0] + PH + 1:",
    "                            vx, vy = _pong_rebate(vx, vy, by, ys[0], PH, 1, vmax)",
    "                            bx = X1 + 2.0",
    "                            erro = random.uniform(-10, 10)",
    "                        elif vx > 0 and X2 - 2 <= bx <= X2 + 1 and ys[1] - 1 <= by + 1 <= ys[1] + PH + 1:",
    "                            vx, vy = _pong_rebate(vx, vy, by, ys[1], PH, -1, vmax)",
    "                            bx = X2 - 2.0",
    "                        if bx < -2:",
    "                            ponto = 1  # passou pela esquerda: ponto do jogador da direita",
    "                            break",
    "                        if bx > W:",
    "                            ponto = 0",
    "                            break",
    "                oled.fill(0)",
    "                oled.rect(0, 0, W, H, 1)  # contorno da tela",
    "                for y in range(TOPO, H - 1, 4):",
    "                    oled.vline(W // 2, y, 2, 1)  # rede tracejada",
    "                _visor_mini(str(placar[0]), W // 2 - 8, 2)",
    "                _visor_mini(str(placar[1]), W // 2 + 6, 2)",
    "                oled.fill_rect(X1, int(ys[0]), 2, PH, 1)",
    "                oled.fill_rect(X2, int(ys[1]), 2, PH, 1)",
    "                oled.fill_rect(int(bx), int(by), 2, 2, 1)",
    "                _visor_mostrar()",
    "                if led_ate:",
    "                    led_ate -= 1",
    "                    if not led_ate:",
    "                        led_rgb(0, 0, 0)",
    "                _jogo_pausa(15)",
    "            if ponto is not None:",
    "                placar[ponto] += 1",
    "                saque = 1 if ponto == 0 else -1  # o proximo saque vai para quem perdeu",
    "                if ponto == 0:",
    "                    led_rgb(0, 40, 0)  # ponto do jogador 1: verde",
    "                elif modo == 1:",
    "                    led_rgb(40, 0, 0)  # ponto da maquina: vermelho",
    "                else:",
    "                    led_rgb(0, 0, 40)  # ponto do jogador 2: azul",
    "                led_ate = 12",
    "        if modo == 1:",
    "            quem = 'VOCE VENCEU!' if placar[0] > placar[1] else 'A MAQUINA VENCEU'",
    "        else:",
    "            quem = 'JOGADOR %d VENCEU' % (1 if placar[0] > placar[1] else 2)",
    "        base[:] = [porta_analogica(p) for p in pinos]",
    "        _jogo_esperar(quem, '%d x %d' % (placar[0], placar[1]), 'gire ou aperte', mexeu)",
    "        led_rgb(0, 0, 0)",
    "",
    "",
  ].join("\n");
}

/** Breakout: a raquete segue o potenciômetro (ou as setas) e a bola quebra os tijolos. */
function breakoutCode(): string {
  return [
    "# --- jogo do Breakout ---",
    "_brk_mov = 0  # setas apertadas: -1 esquerda, +1 direita",
    "_brk_lancar = False",
    "",
    "def _brk_tecla(nome):",
    "    global _brk_mov, _brk_lancar, _jogo_tecla",
    "    _jogo_tecla = True",
    "    if nome == 'left':",
    "        _brk_mov -= 1",
    "    elif nome == 'right':",
    "        _brk_mov += 1",
    "    else:",
    "        _brk_lancar = True",
    "",
    "def visor_breakout(pino):",
    "    global _brk_mov, _brk_lancar",
    "    _visor_garantir()",
    "    for n in ('left', 'right', 'space'):",
    "        _teclas[n] = (lambda k: lambda: _brk_tecla(k))(n)",
    "    W, H = oled.width, oled.height",
    "    PW, PY = 22, H - 3  # largura e altura da raquete",
    "    COLS, LINS, BW, BH = 10, 4, 11, 4  # tijolos",
    "    BX0 = (W - (COLS * (BW + 1) - 1)) // 2",
    "    BY0 = 9",
    "    base = [porta_analogica(pino)]",
    "    def mexeu():  # girar o potenciometro tambem comeca o jogo",
    "        return abs(porta_analogica(pino) - base[0]) > 10",
    "    _jogo_esperar('BREAKOUT', 'x sai do jogo', 'gire ou aperte', mexeu)",
    "    while _bb_rodando:",
    "        pontos, vidas, fase = 0, 3, 1",
    "        tijolos = bytearray(b'\\x01' * (COLS * LINS))",
    "        px = (W - PW) / 2",
    "        pot = porta_analogica(pino)",
    "        led_ate = 0",
    "        while vidas > 0 and _bb_rodando:",
    "            # pixels por SEGUNDO (pelo relogio): a mesma velocidade seja qual for o tempo de cada quadro",
    "            # 39 px/s na velocidade 5; cada fase deixa a bola 20% mais rapida",
    "            vel = 28 * (0.8 + 0.12 * _jogo_velocidade) * (1.2 ** (fase - 1))",
    "            vx, vy = vel * random.choice((-0.6, 0.6)), -vel * 0.8",
    "            antes = time.ticks_ms()",
    "            solta = time.ticks_add(antes, 1000)  # a bola fica ~1 s em cima da raquete",
    "            presa = True",
    "            _brk_lancar = False",
    "            fim = None",
    "            while fim is None and _bb_rodando:",
    "                agora = time.ticks_ms()",
    "                dt = min(0.1, time.ticks_diff(agora, antes) / 1000)  # segundos desde o quadro anterior",
    "                antes = agora",
    "                # raquete: o potenciometro manda quando gira; as setas empurram 8 px",
    "                v = porta_analogica(pino)",
    "                if v != pot:",
    "                    pot = v",
    "                    px = 1 + v * (W - 2 - PW) / 100",
    "                if _brk_mov:",
    "                    px += _brk_mov * 8",
    "                    _brk_mov = 0",
    "                px = max(1, min(W - 1 - PW, px))  # a raquete fica dentro do contorno",
    "                if presa:",
    "                    presa = not (_brk_lancar or time.ticks_diff(agora, solta) >= 0)",
    "                    bx, by = px + PW / 2 - 1, PY - 3.0",
    "                else:",
    "                    # a bola anda em passos de no maximo 2 px: rapida, ela nao atravessa tijolo nem raquete",
    "                    passos = int((vx * vx + vy * vy) ** 0.5 * dt / 2) + 1",
    "                    for _ in range(passos):",
    "                        if fim is not None:",
    "                            break",
    "                        bx += vx * dt / passos",
    "                        by += vy * dt / passos",
    "                        if bx < 1:  # paredes 1 px para dentro do contorno",
    "                            bx, vx = 1.0, abs(vx)",
    "                        elif bx > W - 3:",
    "                            bx, vx = W - 3.0, -abs(vx)",
    "                        if by < 8:",
    "                            by, vy = 8.0, abs(vy)",
    "                        # bateu na raquete: a direcao depende de onde (meio sobe reto, pontas inclinam)",
    "                        if vy > 0 and PY - 2 <= by + 1 <= PY + 1 and px - 1 <= bx + 1 <= px + PW:",
    "                            s = (vx * vx + vy * vy) ** 0.5",
    "                            vx = s * 0.8 * ((bx + 1 - px) / PW * 2 - 1)",
    "                            vy = -((s * s - vx * vx) ** 0.5)",
    "                            by = PY - 3.0",
    "                        # tijolo no centro da bola: some, a bola volta e vale 1 ponto",
    "                        c = int((bx + 1 - BX0) // (BW + 1))",
    "                        l = int((by + 1 - BY0) // (BH + 1))",
    "                        if 0 <= c < COLS and 0 <= l < LINS and tijolos[l * COLS + c]:",
    "                            tijolos[l * COLS + c] = 0",
    "                            vy = -vy",
    "                            pontos += 1",
    "                            led_rgb(0, 40, 0)",
    "                            led_ate = 5",
    "                            if not any(tijolos):",
    "                                fim = 'fase'",
    "                        if by > H:",
    "                            fim = 'perdeu'",
    "                oled.fill(0)",
    "                oled.rect(0, 0, W, H, 1)  # contorno da tela",
    "                _visor_mini(str(pontos), 2, 2)",
    "                for i in range(vidas):",
    "                    oled.fill_rect(W - 6 - i * 5, 2, 3, 3, 1)",
    "                for i in range(COLS * LINS):",
    "                    if tijolos[i]:",
    "                        oled.fill_rect(BX0 + (i % COLS) * (BW + 1), BY0 + (i // COLS) * (BH + 1), BW, BH, 1)",
    "                oled.fill_rect(int(px), PY, PW, 2, 1)",
    "                oled.fill_rect(int(bx), int(by), 2, 2, 1)",
    "                _visor_mostrar()",
    "                if led_ate:",
    "                    led_ate -= 1",
    "                    if not led_ate:",
    "                        led_rgb(0, 0, 0)",
    "                _jogo_pausa(20)",
    "            if fim == 'fase':  # limpou tudo: tijolos de volta e bola mais rapida",
    "                fase += 1",
    "                tijolos = bytearray(b'\\x01' * (COLS * LINS))",
    "            elif fim == 'perdeu':",
    "                vidas -= 1",
    "                led_rgb(40, 0, 0)",
    "                _jogo_pausa(400)",
    "                led_rgb(0, 0, 0)",
    "        led_rgb(40, 0, 0)",
    "        base[0] = porta_analogica(pino)",
    "        _jogo_esperar('FIM DE JOGO', '%d pontos' % pontos, 'gire ou aperte', mexeu)",
    "        led_rgb(0, 0, 0)",
    "",
    "",
  ].join("\n");
}

/** Tetris com a placa em pé: as peças caem ao longo do lado comprido do visor. */
function tetrisCode(): string {
  return [
    "# --- jogo do Tetris ---",
    "# a placa fica em pe (girada 90 graus no sentido do relogio): o lado esquerdo do visor vira o",
    "# de cima e as pecas caem ao longo do lado comprido. Tudo e desenhado nesse visor 'em pe'",
    "# (64 x 128) e _tet_ret / _tet_ponto passam para o visor de verdade (128 x 64).",
    "# pecas: casas dentro de uma caixa n x n (y cresce para baixo); girar = (x, y) -> (n-1-y, x)",
    "_TET_PECAS = (",
    "    (4, ((0, 1), (1, 1), (2, 1), (3, 1))),  # I",
    "    (2, ((0, 0), (1, 0), (0, 1), (1, 1))),  # O",
    "    (3, ((1, 0), (0, 1), (1, 1), (2, 1))),  # T",
    "    (3, ((1, 0), (2, 0), (0, 1), (1, 1))),  # S",
    "    (3, ((0, 0), (1, 0), (1, 1), (2, 1))),  # Z",
    "    (3, ((0, 0), (0, 1), (1, 1), (2, 1))),  # J",
    "    (3, ((2, 0), (0, 1), (1, 1), (2, 1))),  # L",
    ")",
    "_tet_fila = []  # teclas ainda nao usadas, na ordem (duas rapidas valem as duas)",
    "",
    "def _tet_tecla(nome):",
    "    global _jogo_tecla",
    "    _jogo_tecla = True",
    "    if len(_tet_fila) < 4:",
    "        _tet_fila.append(nome)",
    "",
    "def _tet_giros(n, cels):",
    "    g = [cels]",
    "    for _ in range(3):",
    "        g.append(tuple((n - 1 - y, x) for x, y in g[-1]))",
    "    return g",
    "",
    "def _tet_ret(x, y, w, h, c=1):",
    "    oled.fill_rect(y, oled.height - x - w, h, w, c)",
    "",
    "def _tet_contorno(x, y, w, h):",
    "    oled.rect(y, oled.height - x - w, h, w, 1)",
    "",
    "class _TetGirado:  # alvo do _visor_mini no visor em pe",
    "    def pixel(self, x, y, c):",
    "        oled.pixel(y, oled.height - 1 - x, c)",
    "",
    "def _tet_texto(txt, y):",
    "    if not txt:  # linha em branco: o MicroPython nao aceita FrameBuffer de largura 0",
    "        return",
    "    w = len(txt) * 8",
    "    fb = framebuf.FrameBuffer(bytearray(w), w, 8, framebuf.MONO_HLSB)",
    "    fb.text(txt, 0, 0, 1)",
    "    x0 = (oled.height - w) // 2",
    "    for j in range(8):",
    "        for i in range(w):",
    "            if fb.pixel(i, j):",
    "                oled.pixel(y + j, oled.height - 1 - x0 - i, 1)",
    "",
    "# tela de titulo / fim de jogo, em pe: espera uma tecla do jogo",
    "def _tet_esperar(linhas):",
    "    global _jogo_tecla",
    "    oled.fill(0)",
    "    y = (oled.width - len(linhas) * 12) // 2",
    "    for l in linhas:",
    "        _tet_texto(l, y)",
    "        y += 12",
    "    _visor_mostrar()",
    "    _jogo_pausa(500)",
    "    _jogo_tecla = False",
    "    while not _jogo_tecla and _bb_rodando:",
    "        _jogo_pausa(50)",
    "    _tet_fila.clear()",
    "",
    "def visor_tetris():",
    "    _visor_garantir()",
    "    for n in ('left', 'right', 'up', 'down', 'space'):",
    "        _teclas[n] = (lambda k: lambda: _tet_tecla(k))(n)",
    "    VW, VH = oled.height, oled.width  # visor em pe: 64 de largura, 128 de altura",
    "    C, COLS = 6, 10  # casas de 6 px (5 acesos + 1 de espaco), 10 colunas",
    "    ROWS = (VH - 10) // C  # 19 linhas",
    "    X0, Y0 = (VW - COLS * C + 1) // 2, VH - 1 - ROWS * C  # o poco encosta no contorno de baixo",
    "    pecas = [_tet_giros(n, c) for n, c in _TET_PECAS]",
    "    mini = _TetGirado()",
    "    _tet_esperar(('TETRIS', '', 'x sai', 'do jogo', '', 'aperte', 'uma seta'))",
    "    while _bb_rodando:",
    "        campo = bytearray(COLS * ROWS)",
    "        pontos, linhas = 0, 0",
    "        saco = []",
    "        def sortear():  # saco com as 7 pecas: nenhuma demora demais para vir",
    "            if not saco:",
    "                saco.extend(range(7))",
    "            return saco.pop(random.randint(0, len(saco) - 1))",
    "        def cabe(pc, px, py):",
    "            for x, y in pc:",
    "                x += px",
    "                y += py",
    "                if x < 0 or x >= COLS or y >= ROWS or (y >= 0 and campo[y * COLS + x]):",
    "                    return False",
    "            return True",
    "        def desenhar(pc, px, py, prox, cheias=()):",
    "            oled.fill(0)",
    "            oled.rect(0, 0, oled.width, oled.height, 1)  # contorno da tela",
    "            _visor_mini(str(pontos), 3, 3, mini)",
    "            for x, y in pecas[prox][0]:  # proxima peca, em casas de 2 px",
    "                _tet_ret(VW - 12 + x * 2, 3 + y * 2, 2, 2)",
    "            _tet_ret(1, Y0 - 2, VW - 2, 1)  # linha embaixo do placar",
    "            for i in range(COLS * ROWS):",
    "                if campo[i] and i // COLS not in cheias:",
    "                    _tet_ret(X0 + (i % COLS) * C, Y0 + (i // COLS) * C, C - 1, C - 1)",
    "            if pc:",
    "                sombra = py  # onde a peca vai cair",
    "                while cabe(pc, px, sombra + 1):",
    "                    sombra += 1",
    "                for x, y in pc:",
    "                    if sombra != py and y + sombra >= 0:",
    "                        _tet_contorno(X0 + (x + px) * C, Y0 + (y + sombra) * C, C - 1, C - 1)",
    "                    if y + py >= 0:",
    "                        _tet_ret(X0 + (x + px) * C, Y0 + (y + py) * C, C - 1, C - 1)",
    "            _visor_mostrar()",
    "        prox = sortear()",
    "        _tet_fila.clear()",
    "        while _bb_rodando:",
    "            tipo, prox = prox, sortear()",
    "            giro = 0",
    "            pc = pecas[tipo][0]",
    "            px, py = (COLS - _TET_PECAS[tipo][0]) // 2, -1 if tipo == 0 else 0",
    "            if not cabe(pc, px, py):",
    "                break  # sem espaco para a peca nova: fim de jogo",
    "            nivel = 1 + linhas // 10",
    "            # ms para a peca descer uma casa (800 na velocidade 5; mais rapido a cada 10 linhas)",
    "            queda = max(80, int(800 * (1.6 - 0.12 * _jogo_velocidade) * 0.85 ** (nivel - 1)))",
    "            cair = time.ticks_add(time.ticks_ms(), queda)",
    "            mudou, travar = True, False",
    "            while _bb_rodando and not travar:",
    "                while _tet_fila and not travar:",
    "                    t = _tet_fila.pop(0)",
    "                    if t == 'left' or t == 'right':",
    "                        d = -1 if t == 'left' else 1",
    "                        if cabe(pc, px + d, py):",
    "                            px += d",
    "                    elif t == 'up':  # gira; encostada na parede ou em pecas, desliza para caber",
    "                        g = pecas[tipo][(giro + 1) % 4]",
    "                        for dx in (0, -1, 1, -2, 2):",
    "                            if cabe(g, px + dx, py):",
    "                                giro, pc, px = (giro + 1) % 4, g, px + dx",
    "                                break",
    "                    elif t == 'down':",
    "                        if cabe(pc, px, py + 1):",
    "                            py += 1",
    "                            cair = time.ticks_add(time.ticks_ms(), queda)",
    "                        else:",
    "                            travar = True",
    "                    else:  # espaco: derruba de uma vez",
    "                        while cabe(pc, px, py + 1):",
    "                            py += 1",
    "                        travar = True",
    "                    mudou = True",
    "                agora = time.ticks_ms()",
    "                if not travar and time.ticks_diff(agora, cair) >= 0:",
    "                    cair = time.ticks_add(agora, queda)",
    "                    if cabe(pc, px, py + 1):",
    "                        py += 1",
    "                        mudou = True",
    "                    else:",
    "                        travar = True  # ja estava no chao ha uma descida inteira",
    "                if mudou and not travar:",
    "                    desenhar(pc, px, py, prox)",
    "                    mudou = False",
    "                _jogo_pausa(20)",
    "            if not _bb_rodando:",
    "                break",
    "            fora = False",
    "            for x, y in pc:",
    "                if y + py < 0:",
    "                    fora = True",
    "                else:",
    "                    campo[(y + py) * COLS + x + px] = 1",
    "            if fora:",
    "                break  # a peca parou saindo do poco: fim de jogo",
    "            cheias = [r for r in range(ROWS) if all(campo[r * COLS:(r + 1) * COLS])]",
    "            if cheias:",
    "                led_rgb(0, 40, 0)",
    "                for i in range(3):  # as linhas completas piscam antes de sumir",
    "                    desenhar(None, 0, 0, prox, cheias)",
    "                    _jogo_pausa(70)",
    "                    desenhar(None, 0, 0, prox)",
    "                    _jogo_pausa(70)",
    "                led_rgb(0, 0, 0)",
    "                resto = bytearray()",
    "                for r in range(ROWS):",
    "                    if r not in cheias:",
    "                        resto += campo[r * COLS:(r + 1) * COLS]",
    "                campo[:] = bytearray(COLS * len(cheias)) + resto",
    "                pontos += (0, 1, 3, 5, 8)[len(cheias)] * nivel",
    "                linhas += len(cheias)",
    "            desenhar(None, 0, 0, prox)",
    "        led_rgb(40, 0, 0)",
    "        _tet_esperar(('FIM DE', 'JOGO', '', str(pontos), 'pontos', '', 'aperte', 'uma seta'))",
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
    "    _jogo_esperar('FLAPPY', 'x sai do jogo', 'aperte uma tecla')",
    "    while _bb_rodando:",
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
    "        while vivo and _bb_rodando:",
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
    "            _jogo_pausa(25)",
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

/** Marca que inicia um quadro do visor na serial: "\x1f<w>,<h>,<base64 do framebuffer>". */
export const DISPLAY_MARK = "\x1f";

/**
 * Logo da Beta Kit (src/lib/betakit-logo.svg) em 128x64, 1 bit por pixel, no formato
 * do buffer do SSD1306 (MONO_VLSB) em base64. Feito desenhando o SVG com 120 px de
 * largura, centralizado, num canvas 128x64 e acendendo os pixels com mais de metade coberta.
 */
const LOGO_B64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+/v7+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP7+/v4AAAAAAAAAAAAAAAAAgMDg4MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/////AwODg8PDw8ODg4MCAAAAAAACAwODg8PDw8PDw8ODgwIAAAADg4OD/////4ODg4OAAAACAwMDg4ODw8PDg4ODA4ODg4AAAAAAAAAAAAAAA/////wAAAIDA4ODg4CAAAAAB4+fn4wAA4ODg/v/////g4ODgAAAAAAAAAAAA//////8DAQEAAAABAQP////+AAAA/v///395eHh4eHh4eX9/f38AAAAAAP////8AAAAAAAAA/v///wcBAQAAAAAAAQP/////AAAAAAAAAAAAAAD/////ePz+/++HAwEAAAAAAAD/////AAAAAQH//////wEBAQEAAAAAAAAAAAAfPz8fDx8ePDw8PDweHx8PBwEAAAABBw8fHz48PDw8PDwcHh4MAAAAAAAABx8fPz48PDwYAAABBw8fPz48PDw8PDweDz8/Pz8AAAAAAAAAAAAAAD8/Pz8AAAEDBw8fPjw4MAAAAD8/Pz8AAAAAAAEPHz8/PDw8PBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
/** Pingo do i do logo (a parte azul no SVG): anima separado, caindo e quicando. */
const LOGO_PINGO = "106,21,107,21,105,22,106,22,107,22,108,22,104,23,105,23,106,23,107,23,108,23,104,24,105,24,106,24,107,24,108,24,105,25,106,25,107,25,108,25,106,26,107,26";
/** Onde cada letra de "beta kit" termina (coluna seguinte à última acesa): aparecem uma a uma. */
const LOGO_LETRAS = "22,42,56,76,102,109,124";

/**
 * Funções auxiliares do visor OLED (precisa do arquivo ssd1306.py na placa).
 * A tela fica sempre ligada nas portas 8 (SDA) e 9 (SCL): todo programa já começa com ela.
 * Sem o OLED físico, usa um visor virtual na memória; em ambos os casos o
 * conteúdo é enviado ao app (no máximo 10 quadros/s) para o preview.
 */
export function oledCode(): string {
  return [
    "# --- visor OLED ---",
    "from machine import I2C, SoftI2C",
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
    "# copia do ultimo quadro completo: o preview nunca pega a tela no meio de um redesenho",
    "_vis_quadro = None",
    "",
    "def _visor_flush(t=None):",
    "    global _vis_dirty",
    "    if _vis_dirty and _vis_quadro is not None:",
    "        _vis_dirty = False",
    "        print('\\x1f%d,%d,' % (oled.width, oled.height) + binascii.b2a_base64(_vis_quadro).decode().strip())",
    "",
    "_vis_timer = Timer(2)",
    "_vis_timer.init(period=100, mode=Timer.PERIODIC, callback=_bb_protegido(_visor_flush))",
    "",
    "def _visor_mostrar():",
    "    global _vis_dirty, _vis_quadro, _vis_pixels",
    "    _vis_pixels = False",
    "    oled.show()",
    "    if _vis_quadro is None or len(_vis_quadro) != len(oled.buffer):",
    "        _vis_quadro = bytearray(len(oled.buffer))",
    "    _vis_quadro[:] = oled.buffer",
    "    _vis_dirty = True",
    "",
    "def visor_iniciar(sda, scl, w, h):",
    "    global oled",
    "    oled = None",
    "    try:",
    "        try:",
    "            i2c = I2C(0, sda=Pin(sda), scl=Pin(scl), freq=400000)  # por hardware: bem mais rapido",
    "        except Exception:",
    "            i2c = SoftI2C(sda=Pin(sda), scl=Pin(scl), freq=400000)",
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
    "    # o visor ja foi ligado no inicio; so por garantia",
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
    "# 'pintar/apagar pixel' so muda a memoria: mandar a tela inteira leva ~25 ms, entao ela vai",
    "# de uma vez no proximo _bb_ponto (no maximo a cada 20 ms) ou no fim do 'ao iniciar'",
    "_vis_pixels = False  # tem pixel mudado que ainda nao foi para a tela",
    "",
    "def visor_pixel(x, y, cor):",
    "    global _vis_pixels",
    "    _visor_garantir()",
    "    # y cresce para cima, como num grafico (na tela, a linha 0 e a de cima)",
    "    oled.pixel(int(x), oled.height - 1 - int(y), cor)  # fora da tela (x 0..127, y 0..63) e ignorado",
    "    _vis_pixels = True",
    "",
    "# caneta do 'tracar ate': ultimo ponto tracado (na tela), ou None com a caneta levantada",
    "_vis_caneta = None",
    "",
    "def visor_tracar(x, y):",
    "    global _vis_caneta, _vis_pixels",
    "    _visor_garantir()",
    "    p = (int(x), oled.height - 1 - int(y))  # y cresce para cima, como no 'pintar pixel'",
    "    if _vis_caneta is None:",
    "        oled.pixel(p[0], p[1], 1)",
    "    else:",
    "        oled.line(_vis_caneta[0], _vis_caneta[1], p[0], p[1], 1)  # linha de 1 px, sem buracos",
    "    _vis_caneta = p",
    "    _vis_pixels = True",
    "",
    "def visor_levantar_caneta():",
    "    global _vis_caneta",
    "    _vis_caneta = None",
    "",
    "def _visor_pixels_na_tela():",
    "    if _vis_pixels:",
    "        _visor_mostrar()",
    "",
    "_bb_visor = _visor_pixels_na_tela",
    "",
    "def visor_limpar():",
    "    _visor_garantir()",
    "    oled.fill(0)",
    "    _visor_mostrar()",
    "",
    "# fonte miniatura 3x5 para os rotulos do grafico (cada letra: 5 linhas de 3 colunas)",
    "_MINI = {",
    "    '0': '###|#.#|#.#|#.#|###', '1': '.#.|##.|.#.|.#.|###', '2': '###|..#|###|#..|###',",
    "    '3': '###|..#|###|..#|###', '4': '#.#|#.#|###|..#|..#', '5': '###|#..|###|..#|###',",
    "    '6': '###|#..|###|#.#|###', '7': '###|..#|..#|..#|..#', '8': '###|#.#|###|#.#|###',",
    "    '9': '###|#.#|###|..#|###', '%': '#.#|..#|.#.|#..|#.#', 's': '.##|#..|.#.|..#|##.',",
    "    't': '.#.|###|.#.|.#.|..#', 'e': '###|#.#|###|#..|###', 'm': '#.#|###|#.#|#.#|#.#',",
    "    'p': '##.|#.#|##.|#..|#..', 'o': '###|#.#|#.#|#.#|###',",
    "}",
    "",
    "def _visor_mini(txt, x, y, alvo=None):",
    "    alvo = alvo or oled",
    "    for ch in txt:",
    "        g = _MINI.get(ch)",
    "        if g:",
    "            for r, linha in enumerate(g.split('|')):",
    "                for c in range(3):",
    "                    if linha[c] == '#':",
    "                        alvo.pixel(x + c, y + r, 1)",
    "        x += 4",
    "",
    "# grafico: um ponto por chamada, eixo Y em % e eixo X no tempo",
    "_graf = []",
    "_graf_t0 = None",
    "_graf_fundo = None  # (largura, altura, bytes) dos eixos e rotulos fixos",
    "",
    "def visor_grafico(v):",
    "    global _graf_t0, _graf_fundo",
    "    _visor_garantir()",
    "    if _graf_t0 is None:",
    "        _graf_t0 = time.ticks_ms()",
    "    try:",
    "        v = max(0, min(100, float(v)))",
    "    except (TypeError, ValueError):",
    "        v = 0",
    "    alto = oled.height >= 64",
    "    X0 = 17                    # inicio da area do grafico (esquerda ficam os rotulos)",
    "    Y0 = 2 if alto else 1      # topo (100%)",
    "    Y1 = 56 if alto else 25    # linha do eixo do tempo (0%)",
    "    W = oled.width - X0",
    "    _graf.append(v)",
    "    if len(_graf) > W:",
    "        del _graf[0]",
    "    if _graf_fundo is None or _graf_fundo[:2] != (oled.width, oled.height):",
    "        buf = bytearray(len(oled.buffer))",
    "        f = framebuf.FrameBuffer(buf, oled.width, oled.height, framebuf.MONO_VLSB)",
    "        f.vline(X0 - 1, Y0, Y1 - Y0 + 1, 1)  # eixo %",
    "        f.hline(X0 - 1, Y1, W + 1, 1)        # eixo tempo",
    "        _visor_mini('100%', 0, Y0 - 2 if alto else 0, f)",
    "        _visor_mini('0%', 8, Y1 - 4, f)",
    "        if alto:",
    "            _visor_mini('50%', 4, (Y0 + Y1) // 2 - 2, f)",
    "            f.hline(X0 - 3, (Y0 + Y1) // 2, 2, 1)",
    "        _visor_mini('tempo', X0, Y1 + 2, f)",
    "        for i in range(10, W, 10):  # marquinhas de tempo",
    "            f.pixel(X0 + i, Y1 - 1, 1)",
    "        _graf_fundo = (oled.width, oled.height, buf)",
    "    oled.buffer[:] = _graf_fundo[2]  # copia o fundo pronto (bem mais rapido que redesenhar)",
    "    seg = '%ds' % (time.ticks_diff(time.ticks_ms(), _graf_t0) // 1000)",
    "    _visor_mini(seg, oled.width - len(seg) * 4 + 1, Y1 + 2)",
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
    "    # por cima: so os pixels acesos do desenho (128x64) entram; o resto da tela fica como estava",
    "    oled.blit(framebuf.FrameBuffer(bytearray(b), 128, 64, framebuf.MONO_VLSB), 0, 0, 0)",
    "    _visor_mostrar()",
    "",
    "",
    "# a tela fica sempre nas portas 8 (SDA) e 9 (SCL): todo programa ja comeca com ela ligada",
    "visor_iniciar(8, 9, 128, 64)",
    "",
    "# ao ligar (ou reset, ou programa novo): animacao do logo da Beta Kit (~5 s), a tela apaga e o projeto comeca",
    `_LOGO = '${LOGO_B64}'`,
    `_LOGO_PINGO = (${LOGO_PINGO})  # x, y de cada pixel do pingo do i`,
    `_LOGO_LETRAS = (${LOGO_LETRAS})  # coluna onde cada letra termina`,
    "",
    "def _visor_logo():",
    "    if isinstance(oled, _VisorVirtual) or len(oled.buffer) != 1024:",
    "        return  # sem tela de verdade: sem animacao",
    "    import random",
    "    W = 128",
    "    t0 = time.ticks_ms()",
    "    tela = oled.buffer",
    "    cheio = bytearray(binascii.a2b_base64(_LOGO))  # logo inteiro",
    "    letras = bytearray(cheio)  # o logo sem o pingo do i",
    "    fb = framebuf.FrameBuffer(letras, W, 64, framebuf.MONO_VLSB)",
    "    pingo = [(_LOGO_PINGO[i], _LOGO_PINGO[i + 1]) for i in range(0, len(_LOGO_PINGO), 2)]",
    "    for x, y in pingo:",
    "        fb.pixel(x, y, 0)",
    "    # LED azul (porta 6) acompanha a animacao pelo relogio: acende na entrada, fica ligado",
    "    # com a palavra e apaga junto com ela. A potencia vai ao quadrado para o brilho parecer",
    "    # subir e descer por igual (o olho ve os primeiros passos como um salto grande).",
    "    def azul(f):",
    "        f = max(0, min(1, f))",
    "        led_rgb(0, 0, 255 * f * f)",
    "    ENTRADA = 1300  # ms: as letras e o pingo; o azul chega a 100% junto com o logo completo",
    "    def esperar_acendendo(ms):",
    "        fim = time.ticks_add(time.ticks_ms(), ms)",
    "        while time.ticks_diff(fim, time.ticks_ms()) > 0:",
    "            azul(time.ticks_diff(time.ticks_ms(), t0) / ENTRADA)",
    "            _bb_esperar(10)",
    "    # 1) as letras aparecem uma a uma",
    "    oled.fill(0)",
    "    for fim in _LOGO_LETRAS:",
    "        for p in range(8):",
    "            tela[p * W:p * W + fim] = letras[p * W:p * W + fim]",
    "        _visor_mostrar()",
    "        esperar_acendendo(130)",
    "    # 2) o pingo cai do alto e quica ate parar em cima do i",
    "    dy = -(min(y for x, y in pingo) + 8.0)  # comeca acima da tela",
    "    vy = 0.0",
    "    quiques = 0",
    "    while True:",
    "        vy += 1.2",
    "        dy += vy",
    "        if dy >= 0:",
    "            dy = 0.0",
    "            quiques += 1",
    "            vy = -vy * 0.45",
    "            if quiques > 2 or abs(vy) < 1.5:",
    "                break",
    "        tela[:] = letras",
    "        d = int(dy)",
    "        for x, y in pingo:",
    "            oled.pixel(x, y + d, 1)",
    "        _visor_mostrar()",
    "        esperar_acendendo(33)",
    "    tela[:] = cheio",
    "    _visor_mostrar()",
    "    azul(1)  # logo completo: azul ligado enquanto a palavra fica na tela",
    "    # 3) parado ate completar 4 s; antes, sorteia a ordem em que os pixels vao sumir",
    "    acesos = []",
    "    for i in range(len(cheio)):",
    "        v = cheio[i]",
    "        if v:",
    "            x, y0 = i % W, (i // W) * 8",
    "            for bit in range(8):",
    "                if (v >> bit) & 1:",
    "                    acesos.append((x, y0 + bit))",
    "    for i in range(len(acesos) - 1, 0, -1):  # embaralha (o random do MicroPython nao tem shuffle)",
    "        j = random.randint(0, i)",
    "        acesos[i], acesos[j] = acesos[j], acesos[i]",
    "    _bb_esperar(max(0, 4000 - time.ticks_diff(time.ticks_ms(), t0)))",
    "    # 4) os pixels somem em 1 s, pelo relogio: quantos ja apagaram acompanha o tempo que passou",
    "    #    (assim dura 1 s mesmo com o tempo que cada quadro leva para chegar na tela)",
    "    ini = time.ticks_ms()",
    "    n = len(acesos)",
    "    feitos = 0",
    "    while feitos < n:",
    "        passou = time.ticks_diff(time.ticks_ms(), ini)",
    "        azul(1 - passou / 1000)  # o azul apaga junto com a palavra",
    "        alvo = min(n, n * passou // 1000)",
    "        if alvo > feitos:",
    "            for x, y in acesos[feitos:alvo]:",
    "                oled.pixel(x, y, 0)",
    "            feitos = alvo",
    "            _visor_mostrar()",
    "        _bb_esperar(10)",
    "    azul(0)",
    "    oled.fill(0)",
    "    _visor_mostrar()",
    "    # 5) 1 s com a tela apagada, e ai o projeto comeca",
    "    _bb_esperar(1000)",
    "",
    "_visor_logo()",
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
        // "ao iniciar" não fica na biblioteca: existe sempre um, e só um, no espaço de trabalho
        { kind: "block", type: "event_key" },
      ],
    },
    {
      kind: "category",
      name: "LED",
      colour: LED_COLOUR,
      contents: [
        {
          kind: "block",
          type: "led_rgb_pct",
          inputs: {
            R: { shadow: { type: "math_number", fields: { NUM: 100 } } },
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
        // "se a porta...", "se/senão" e "mostrar" saíram do menu, mas continuam
        // funcionando nos projetos que já os usam
        { kind: "block", type: "event_button" },
        { kind: "block", type: "event_threshold" },
        { kind: "block", type: "input_analog" },
        { kind: "block", type: "input_digital" },
      ],
    },
    {
      kind: "category",
      name: "Visor",
      colour: OLED_COLOUR,
      contents: [
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
        {
          kind: "block",
          type: "oled_pixel_on",
          inputs: {
            X: { shadow: { type: "math_number", fields: { NUM: 64 } } },
            Y: { shadow: { type: "math_number", fields: { NUM: 32 } } },
          },
        },
        {
          kind: "block",
          type: "oled_pixel_off",
          inputs: {
            X: { shadow: { type: "math_number", fields: { NUM: 64 } } },
            Y: { shadow: { type: "math_number", fields: { NUM: 32 } } },
          },
        },
        {
          kind: "block",
          type: "oled_line_to",
          inputs: {
            X: { shadow: { type: "math_number", fields: { NUM: 64 } } },
            Y: { shadow: { type: "math_number", fields: { NUM: 32 } } },
          },
        },
        { kind: "block", type: "oled_pen_up" },
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
        { kind: "block", type: "oled_breakout" },
        { kind: "block", type: "oled_pong_cpu" },
        { kind: "block", type: "oled_pong_2" },
        { kind: "block", type: "oled_tetris" },
      ],
    },
    {
      kind: "category",
      name: "Rádio",
      colour: RADIO_COLOUR,
      contents: [
        { kind: "label", text: "Grupo" },
        { kind: "block", type: "radio_group" },
        { kind: "label", text: "Enviar" },
        {
          kind: "block",
          type: "radio_send_number",
          inputs: { VALUE: { shadow: { type: "math_number", fields: { NUM: 0 } } } },
        },
        {
          kind: "block",
          type: "radio_send_value",
          inputs: {
            NAME: { shadow: { type: "text", fields: { TEXT: "nome" } } },
            VALUE: { shadow: { type: "math_number", fields: { NUM: 0 } } },
          },
        },
        {
          kind: "block",
          type: "radio_send_text",
          inputs: { TEXT: { shadow: { type: "text", fields: { TEXT: "" } } } },
        },
        { kind: "label", text: "Receber" },
        { kind: "block", type: "radio_on_number" },
        { kind: "block", type: "radio_number" },
        { kind: "block", type: "radio_on_value" },
        { kind: "block", type: "radio_name" },
        { kind: "block", type: "radio_value" },
        { kind: "block", type: "radio_on_text" },
        { kind: "block", type: "radio_text" },
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
    {
      kind: "category",
      name: "Texto",
      colour: TEXT_COLOUR,
      contents: [
        { kind: "block", type: "text", fields: { TEXT: "Ola" } },
        {
          kind: "block",
          type: "text_join_plus",
          inputs: {
            ADD0: { shadow: { type: "text", fields: { TEXT: "Valor: " } } },
            ADD1: { shadow: { type: "text", fields: { TEXT: "" } } },
          },
        },
      ],
    },
    {
      kind: "category",
      name: "Matemática",
      colour: MATH_COLOUR,
      contents: [
        {
          kind: "block",
          type: "math_convert",
          inputs: {
            VALUE: { shadow: { type: "math_number", fields: { NUM: 50 } } },
            FROM_MIN: { shadow: { type: "math_number", fields: { NUM: 0 } } },
            FROM_MAX: { shadow: { type: "math_number", fields: { NUM: 100 } } },
            MIN: { shadow: { type: "math_number", fields: { NUM: 100 } } },
            MAX: { shadow: { type: "math_number", fields: { NUM: 0 } } },
          },
        },
        { kind: "block", type: "math_number" },
        {
          kind: "block",
          type: "math_arithmetic",
          inputs: {
            A: { shadow: { type: "math_number", fields: { NUM: 1 } } },
            B: { shadow: { type: "math_number", fields: { NUM: 1 } } },
          },
        },
        {
          kind: "block",
          type: "math_random_int",
          inputs: {
            FROM: { shadow: { type: "math_number", fields: { NUM: 1 } } },
            TO: { shadow: { type: "math_number", fields: { NUM: 10 } } },
          },
        },
        {
          kind: "block",
          type: "math_round",
          inputs: { NUM: { shadow: { type: "math_number", fields: { NUM: 3.1 } } } },
        },
      ],
    },
    // "criar variável", "definir", "alterar por" e o bloco redondo de cada variável (do Blockly)
    { kind: "category", name: "Variáveis", colour: VARIABLE_COLOUR, custom: "VARIABLE" },
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
                              type: "led_rgb_pct",
                              inputs: {
                                R: { shadow: { type: "math_number", fields: { NUM: 0 } } },
                                G: { shadow: { type: "math_number", fields: { NUM: 0 } } },
                                B: { shadow: { type: "math_number", fields: { NUM: 100 } } },
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
