/**
 * Manual do Beta Blocks: desenha os blocos de verdade (o mesmo Blockly do app) e monta as páginas.
 * Gerar o PDF: npm run manual (docs/manual/gerar.mjs).
 */
import * as Blockly from "blockly";
import * as ptBr from "blockly/msg/pt-br";
import { defineBlocks, RENDERER, THEME, toolbox } from "../../src/blocks/betablocks";

Blockly.setLocale(ptBr as unknown as { [key: string]: string });
defineBlocks();

// ---------- textos de cada bloco (para crianças) ----------
const TEXTOS: Record<string, string> = {
  event_start:
    "Tudo começa aqui: os blocos embaixo dele rodam quando a placa liga. Ele já está sempre na tela e não pode ser apagado.",
  event_key: "Quando você aperta essa tecla no computador (ou no controle 🎮), os blocos embaixo dele rodam.",
  led_rgb_pct: "Acende o LED misturando vermelho (r), verde (g) e azul (b), cada um de 0 a 100. Misture e invente cores!",
  led_color: "Acende o LED com uma cor pronta. O 🌈 arco-íris fica trocando de cor sozinho.",
  led_off: "Apaga o LED.",
  port_onoff: "Liga ou desliga uma porta (1, 2 ou 3). Serve para acender um módulo de LED, por exemplo.",
  port_pwm: "Liga uma porta com força de 0 a 100%: dá para deixar um LED mais fraco ou mais forte.",
  motor_onoff: "Liga o motor com toda a força ou desliga. Escolha o motor (M1 ou M2) e o sentido: ↻ horário ou ↺ anti-horário.",
  motor_slider: "Liga o motor com a velocidade que você escolher: arraste a bolinha de 0 (parado) até 100 (bem rápido).",
  motor_run: "Liga o motor com a velocidade que vem de outro bloco, como uma variável ou o valor de um sensor.",
  event_button: "Quando você aperta o botão ligado nessa porta, os blocos embaixo dele rodam.",
  event_threshold: "Quando o valor de um sensor passa do número escolhido (por exemplo, quando bate luz no sensor), os blocos embaixo rodam.",
  input_analog: "Lê um sensor (potenciômetro, sensor de luz...) e dá um número de 0 a 100.",
  input_digital: "Diz se a porta está ligada (verdadeiro) ou desligada (falso). Ótimo para botões.",
  input_dht: "Lê o sensor DHT11: a temperatura (em °C) ou a umidade do ar (em %).",
  wait_ms: "Espera um tempinho antes de ir para o próximo bloco. 1000 milissegundos = 1 segundo.",
  forever: "Repete os blocos de dentro para sempre, sem parar.",
  controls_repeat_ext: "Repete os blocos de dentro o número de vezes que você escolher.",
  controls_if: "Se a condição for verdadeira, faz os blocos de dentro. Na engrenagem dá para pôr \"senão\".",
  controls_whileUntil: "Repete enquanto a condição for verdadeira (ou até ela ficar verdadeira).",
  oled_text: "Escreve um texto ou número no visor, na linha escolhida (de 1 a 8).",
  oled_plot: "Desenha um gráfico no visor, um ponto de cada vez. Use dentro de \"repetir para sempre\".",
  oled_clear: "Apaga tudo o que está no visor.",
  oled_draw: "Desenha no visor um desenho feito por você: clique em ✎ Editar e pinte os quadradinhos.",
  oled_pixel_on: "Acende um pontinho do visor. x vai de 0 a 127 (esquerda para direita) e y de 0 a 63 (de baixo para cima).",
  oled_pixel_off: "Apaga um pontinho do visor.",
  oled_line_to: "Desenha uma linha até esse ponto, como uma caneta que não sai do papel.",
  oled_pen_up: "Levanta a caneta: o próximo traço começa em outro lugar.",
  text: "Um texto: escreva o que quiser dentro.",
  text_join_plus: "Junta textos e números num texto só. Use + para juntar mais coisas.",
  sound_note: "Toca uma nota musical no buzzer (Dó, Ré, Mi...). O número é a oitava: maior = mais agudo.",
  sound_rest: "Fica em silêncio pelo tempo de uma nota.",
  sound_melody: "Toca uma música pronta, como Refazenda ou Parabéns a você.",
  sound_effect: "Toca um efeito de som: moeda, pulo, laser...",
  sound_compose: "Toca a sua música! Clique em ✎ Editar e escolha as notas.",
  sound_tempo: "Muda a velocidade da música: mais batidas por minuto = música mais rápida.",
  sound_hz: "Toca um som numa frequência (em Hz) por um tempo.",
  sound_start: "Começa a tocar um som e não para até usar \"parar o som\".",
  sound_stop: "Para o som.",
  logic_compare: "Compara dois números: igual, maior, menor... A resposta é verdadeiro ou falso.",
  logic_operation: "Junta duas condições: \"e\" (as duas verdadeiras) ou \"ou\" (pelo menos uma).",
  logic_negate: "Troca a resposta: verdadeiro vira falso e falso vira verdadeiro.",
  logic_boolean: "O valor verdadeiro ou falso.",
  math_convert: "Muda um número de uma faixa para outra. Ex.: de 0–100 para 0–10.",
  math_number: "Um número.",
  math_arithmetic: "Faz contas: somar, subtrair, multiplicar, dividir.",
  math_random_int: "Sorteia um número entre os dois que você escolher.",
  math_round: "Arredonda um número (3,7 vira 4).",
  variables_set: "Guarda um valor na variável. A variável é uma caixinha com nome que guarda um número ou texto.",
  math_change: "Soma um número ao que já está na variável. Ótimo para contar pontos!",
  variables_get: "O valor guardado na variável.",
  keyboard_press: "Faz a placa apertar uma tecla no computador, como um teclado. Assim dá para controlar jogos do Scratch!",
  radio_group: "Escolhe o grupo do rádio: só placas no mesmo grupo conversam.",
  radio_send_number: "Envia um número pelo rádio para outras placas.",
  radio_send_value: "Envia um nome e um número pelo rádio (ex.: \"temp\" = 25).",
  radio_send_text: "Envia um texto pelo rádio.",
  radio_on_number: "Quando chega um número pelo rádio, os blocos embaixo rodam.",
  radio_number: "O número que chegou pelo rádio.",
  radio_on_value: "Quando chega um nome e um número pelo rádio, os blocos embaixo rodam.",
  radio_name: "O nome que chegou pelo rádio.",
  radio_value: "O número que chegou junto com o nome.",
  radio_on_text: "Quando chega um texto pelo rádio, os blocos embaixo rodam.",
  radio_text: "O texto que chegou pelo rádio.",
  game_speed: "Escolhe a velocidade dos jogos, de 1 (bem devagar) a 10 (bem rápido). Coloque antes do jogo.",
  oled_snake: "Jogo da cobrinha: coma as frutinhas sem bater na parede nem em você mesmo! Use as setas.",
  oled_dino: "O jogo do dinossauro: pule os cactos e abaixe dos pássaros, com botões ou com as setas.",
  oled_flappy: "Jogo do passarinho: cada aperto bate as asas para passar entre os canos.",
  oled_breakout: "Quebre todos os tijolos com a bolinha, controlando a raquete com o potenciômetro.",
  oled_pong_cpu: "Pong contra a máquina: escolha a dificuldade de 1 (fácil) a 5 (difícil).",
  oled_pong_2: "Pong para dois jogadores, cada um com seu potenciômetro.",
  oled_tetris: "Tetris: encaixe as peças para completar linhas.",
  oled_invasores: "Invasores do espaço: mova a nave e derrube os aliens antes que eles cheguem embaixo!",
};

/** Explicação curta de cada categoria (aparece no começo da seção). */
const CATEGORIAS: Record<string, string> = {
  Eventos: "Os blocos de evento são o começo de tudo: os blocos só rodam se estiverem pendurados num evento.",
  Outputs: "Outputs são as saídas: coisas que a placa liga — LED, módulos e motores.",
  Inputs: "Inputs são as entradas: a placa lê botões e sensores para saber o que está acontecendo.",
  Controle: "Os blocos de controle decidem a ordem: esperar, repetir e escolher o que fazer.",
  Visor: "O visor é a telinha da placa: escreva, desenhe e faça gráficos.",
  Texto: "Blocos para escrever e juntar textos.",
  Som: "Faça música e efeitos com o buzzer (porta 13).",
  Lógica: "Contas, comparações e perguntas de verdadeiro ou falso.",
  Variáveis: "Variáveis são caixinhas com nome que guardam números e textos.",
  Teclado: "A placa vira um teclado do computador — ótimo para controlar jogos no Scratch.",
  Rádio: "Faça placas conversarem sem fio. Atenção: o rádio gasta bastante bateria.",
  Jogos: "Jogos prontos para o visor. Use o controle 🎮, as setas ou botões e potenciômetros.",
};

// ---------- desenhar blocos ----------
const area = document.getElementById("blockly-area")!;
const ws = Blockly.inject(area, { renderer: RENDERER, theme: THEME, readOnly: false, scrollbars: false, zoom: { startScale: 1 } });
ws.getVariableMap().createVariable("pontos");
// as regras de CSS do Blockly (texto branco em negrito, campos brancos) valem dentro destas classes
// (sem "blocklySvg": ela traz position: absolute e o desenho sairia do fluxo da página)
const classesSvg = `${RENDERER}-renderer ${THEME.name}-theme`;

/** Copia o desenho do que está no espaço de trabalho para um <svg> independente. */
function copiarSvg(escala = 1): SVGSVGElement {
  // o Blockly desenha os blocos no próximo quadro da tela: termina agora, antes de medir
  Blockly.renderManagement.triggerQueuedRenders(ws);
  const canvas = ws.getCanvas();
  const caixa = canvas.getBBox();
  const pad = 4;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", classesSvg);
  svg.setAttribute("viewBox", `${caixa.x - pad} ${caixa.y - pad} ${caixa.width + 2 * pad} ${caixa.height + 2 * pad}`);
  svg.setAttribute("width", String((caixa.width + 2 * pad) * escala));
  svg.setAttribute("height", String((caixa.height + 2 * pad) * escala));
  const copia = canvas.cloneNode(true) as SVGGElement;
  copia.removeAttribute("transform");
  svg.appendChild(copia);
  return svg;
}

function desenharBloco(info: object): { svg: SVGSVGElement; tipo: string; dica: string } | null {
  ws.clear();
  ws.getVariableMap().createVariable("pontos");
  try {
    const b = Blockly.serialization.blocks.append(info as Blockly.serialization.blocks.State, ws) as Blockly.BlockSvg;
    b.moveTo(new Blockly.utils.Coordinate(0, 0));
    const dica = typeof b.tooltip === "string" ? b.tooltip : "";
    return { svg: copiarSvg(0.85), tipo: b.type, dica };
  } catch (e) {
    console.error("bloco", info, e);
    return null;
  }
}

function desenharPrograma(estado: object): SVGSVGElement {
  ws.clear();
  Blockly.serialization.workspaces.load(estado, ws);
  return copiarSvg(0.8);
}

// ---------- seções das categorias ----------
type Item = { kind: string; type?: string; text?: string; [k: string]: unknown };
const blocosEl = document.getElementById("blocos")!;
const sumarioEl = document.getElementById("sumario-categorias")!;

for (const cat of toolbox.contents as unknown as { name: string; colour: string; contents?: Item[]; custom?: string }[]) {
  const sec = document.createElement("section");
  sec.className = "categoria";
  sec.style.setProperty("--cor", String(cat.colour));
  sec.innerHTML = `<h2><span class="ponto"></span>${cat.name}</h2><p class="intro">${CATEGORIAS[cat.name] ?? ""}</p>`;
  const lista = document.createElement("div");
  lista.className = "lista";
  sec.appendChild(lista);

  let itens: Item[] = cat.contents ?? [];
  // o "ao iniciar" não fica na biblioteca (já está sempre na tela), mas é o primeiro bloco a conhecer
  if (cat.name === "Eventos") itens = [{ kind: "block", type: "event_start" }, ...itens];
  if (cat.custom === "VARIABLE") {
    const v = { name: "pontos" };
    itens = [
      { kind: "block", type: "variables_set", fields: { VAR: v }, inputs: { VALUE: { shadow: { type: "math_number", fields: { NUM: 0 } } } } },
      { kind: "block", type: "math_change", fields: { VAR: v }, inputs: { DELTA: { shadow: { type: "math_number", fields: { NUM: 1 } } } } },
      { kind: "block", type: "variables_get", fields: { VAR: v } },
    ];
  }
  for (const item of itens) {
    if (item.kind === "label") {
      const l = document.createElement("p");
      l.className = item.text?.startsWith("⚠") ? "aviso" : "rotulo";
      l.textContent = item.text ?? "";
      lista.appendChild(l);
      continue;
    }
    if (item.kind !== "block") continue;
    const { kind: _k, ...info } = item;
    const r = desenharBloco(info);
    if (!r) continue;
    const card = document.createElement("div");
    card.className = "card";
    const img = document.createElement("div");
    img.className = "img";
    img.appendChild(r.svg);
    const txt = document.createElement("p");
    txt.textContent = TEXTOS[r.tipo] ?? r.dica;
    card.append(img, txt);
    lista.appendChild(card);
  }
  blocosEl.appendChild(sec);
  const chip = `<li style="--cor:${cat.colour}"><span class="ponto"></span>${cat.name}</li>`;
  sumarioEl.insertAdjacentHTML("beforeend", chip);
  document.getElementById("legenda-cores")?.insertAdjacentHTML("beforeend", chip);
}

// ---------- projetos de exemplo ----------
const num = (n: number) => ({ shadow: { type: "math_number", fields: { NUM: n } } });
const esperar = (ms: number, next?: object) => ({
  type: "wait_ms",
  fields: { UNIT: "MS" },
  inputs: { TIME: num(ms) },
  ...(next ? { next: { block: next } } : {}),
});
const PROGRAMAS: Record<string, object> = {
  piscar: {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: "event_start", x: 0, y: 0,
          next: { block: { type: "forever", inputs: { DO: { block: {
            type: "led_color", fields: { COLOR: "VERMELHO" },
            next: { block: esperar(500, { type: "led_off", next: { block: esperar(500) } }) },
          } } } } },
        },
      ],
    },
  },
  termometro: {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: "event_start", x: 0, y: 0,
          next: { block: { type: "forever", inputs: { DO: { block: {
            type: "oled_text", fields: { LINE: "1" },
            inputs: { TEXT: { block: {
              type: "text_join_plus", extraState: { itemCount: 3 },
              inputs: {
                ADD0: { shadow: { type: "text", fields: { TEXT: "Temp: " } } },
                ADD1: { block: { type: "input_dht", fields: { WHAT: "T", PIN: "3" } } },
                ADD2: { shadow: { type: "text", fields: { TEXT: " °C" } } },
              },
            } } },
            next: { block: esperar(2000) },
          } } } } },
        },
      ],
    },
  },
  ventilador: {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: "event_start", x: 0, y: 0,
          next: { block: { type: "forever", inputs: { DO: { block: {
            type: "motor_run", fields: { MOTOR: "1", DIR: "CW" },
            inputs: { SPEED: { block: { type: "input_analog", fields: { PIN: "1" } } } },
            next: { block: esperar(50) },
          } } } } },
        },
      ],
    },
  },
  musica: {
    blocks: {
      languageVersion: 0,
      blocks: [
        { type: "event_start", x: 0, y: 0 },
        {
          type: "event_button", x: 0, y: 70, fields: { PIN: "1" },
          next: { block: { type: "led_color", fields: { COLOR: "ARCOIRIS" },
            next: { block: { type: "sound_melody", fields: { MELODY: "REFAZENDA", MODE: "FIM" },
              next: { block: { type: "led_off" } } } } } },
        },
      ],
    },
  },
  scratch: {
    blocks: {
      languageVersion: 0,
      blocks: [
        { type: "event_start", x: 0, y: 0 },
        { type: "event_button", x: 0, y: 80, fields: { PIN: "1" }, next: { block: { type: "keyboard_press", fields: { KEY: "space" } } } },
        { type: "event_button", x: 0, y: 200, fields: { PIN: "2" }, next: { block: { type: "keyboard_press", fields: { KEY: "right" } } } },
      ],
    },
  },
  dino: {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: "event_start", x: 0, y: 0,
          next: { block: { type: "game_speed", fields: { SPEED: 5 },
            next: { block: { type: "oled_dino", fields: { AGACHAR: "1", PULAR: "2" } } } } },
        },
      ],
    },
  },
};
for (const [id, estado] of Object.entries(PROGRAMAS)) {
  const alvo = document.querySelector(`[data-programa="${id}"]`);
  if (alvo) alvo.appendChild(desenharPrograma(estado));
}

area.remove();
document.body.dataset.pronto = "1";
