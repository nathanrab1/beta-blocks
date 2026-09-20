# Beta Blocks

Programação em blocos (Blockly) para o **ESP32-S3-Zero**, rodando no navegador.
Os blocos geram MicroPython e o código é enviado para a placa direto pelo Chrome/Edge (Web Serial) — nada para instalar no computador.

## Rodando

```sh
npm install
npm run dev        # abre em http://localhost:5173
npm run build      # gera a pasta dist/ (pode ser hospedada em qualquer servidor HTTPS)
```

Web Serial funciona em `localhost` ou em páginas HTTPS, só no Chrome e Edge (desktop).

## Primeiro uso da placa (uma vez só)

1. Segure **BOOT**, conecte o USB (ou aperte **RESET**), solte **BOOT**.
2. Clique em **Gravar MicroPython** e escolha a porta "ESP32-S3"/usbmodem.
3. Quando terminar, a placa reinicia com MicroPython. Clique em **Conectar** e escolha a porta de novo.

Depois disso o fluxo é só: **Conectar → montar os blocos → ▶ Enviar**. O programa fica salvo na placa (`main.py`) e roda sozinho ao ligar.

Se a placa já tem MicroPython, "Gravar MicroPython" reinicia ela em modo de gravação automaticamente (não precisa apertar BOOT).

## Blocos

| Categoria | Blocos |
|---|---|
| LED | acender LED (vermelho / verde / azul 0–255), acender LED cor (lista), apagar LED |
| Tempo | esperar N ms / segundos |
| Controle | repetir para sempre, repetir N vezes, se, enquanto |
| Lógica / Matemática / Variáveis | blocos padrão do Blockly |

O pino do LED WS2812 é selecionável no topo (GPIO 21 na S3-Zero; 48 ou 38 no DevKitC).

## Estrutura

```
index.html                 layout da página
src/main.ts                Blockly, botões, fluxo de conexão/envio/gravação
src/blocks/betablocks.ts   blocos customizados, geradores Python, toolbox
src/serial/board.ts        cliente raw-REPL do MicroPython (Web Serial)
src/serial/flasher.ts      gravação do firmware com esptool-js
public/firmware/           MicroPython v1.29.0 (ESP32_GENERIC_S3)
```
