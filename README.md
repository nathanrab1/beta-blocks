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
src/serial/board.ts        cliente raw-REPL do MicroPython (cabo) e comandos pelo Bluetooth
src/serial/ble.ts          canal Bluetooth (Web Bluetooth, serviço UART da Nordic)
src/controle.ts            página de controle do celular (controle.html)
src/serial/flasher.ts      gravação do firmware com esptool-js
public/firmware/           MicroPython v1.29.0 (ESP32_GENERIC_S3)
```

## Conexão por Bluetooth

Sem cabo: o computador (ou celular Android) fala direto com a placa por BLE. Enviar, parar e teclas funcionam igual ao cabo. O monitor de entradas também aparece (algumas leituras por segundo, com o programa rodando). O console e o visor ao vivo só aparecem pelo cabo.

1. Uma vez pelo cabo: enviar qualquer programa. Isso instala o `boot.py`, que liga o Bluetooth sempre que a placa liga.
2. Depois, com a placa em qualquer fonte: **ᛒ Bluetooth** → escolher a placa na lista (`Beta-XXXX`; o nome aparece no console ao ligar a placa pelo cabo).

Depois de cada envio a placa reinicia e a ligação cai por 1–2 s; o app reconecta sozinho. Cada placa aceita um computador por vez.

Funciona no Chrome e Edge (Windows, macOS, ChromeOS) e no Chrome do Android. No iPhone/iPad, só pelo app gratuito **Bluefy** (os outros navegadores do iPhone não têm Bluetooth para páginas). No macOS, confira Ajustes → Privacidade e Segurança → Bluetooth → Google Chrome ligado.

### Controle pelo celular

A página `controle.html` (link **📱 Controle no celular** no app) conecta na placa e mostra um botão para cada tecla que o programa rodando usa — direcional ▲▼◀▶ para as setas, e um botão para as outras teclas — além das entradas ao vivo. Tocar no botão é o mesmo que apertar a tecla no computador. A lista vem da própria placa (comando `L`), então os botões acompanham o programa enviado; nos jogos aparecem quando o jogo começa.

A placa fica com um aparelho por vez, e quem conecta por último fica com ela: conectar o celular tira a placa do computador e vice-versa (o aparelho que perdeu a placa avisa e não tenta tomá-la de volta). Assim, um celular que saiu da página sem desconectar não prende a placa.

### Se travar em "ler os serviços"

A placa conecta mas o Chrome não termina de abrir a ligação — costuma ser estado preso no Mac depois de tentativas que falharam. Fechar o Chrome (Cmd+Q), desligar e ligar o Bluetooth do Mac e tentar de novo. Para saber se o problema é da placa: o app **nRF Connect** (celular) deve conectar e mostrar o "Nordic UART Service" — e precisa ser desconectado depois, porque a placa aceita um aparelho por vez.

Por dentro: serviço "UART" da Nordic (NUS) com um protocolo curto próprio — o app escreve `<id> <comando>` e lê a resposta no valor da característica TX (`src/lib/boot.py`, `src/serial/ble.ts`). Não passa a REPL pelo Bluetooth: com o terminal no BLE, cada linha impressa virava uma notificação chamada segurando o GIL, e a placa congelava inteira.

## Projetos no Google Drive

Os botões **☁ Salvar no Drive** e **☁ Meus projetos** fazem login com a conta Google e guardam os projetos (`.json` com miniatura) na pasta **Beta Kit** do Drive da pessoa. Não há servidor nem banco de dados: tudo roda no navegador (`src/drive.ts`).

O app usa o escopo `drive.file`: só enxerga a pasta e os arquivos que ele mesmo criou, nada mais do Drive. Os botões só aparecem depois de configurar o ID do cliente:

1. [Google Cloud Console](https://console.cloud.google.com/) → criar um projeto.
2. **APIs e serviços → Biblioteca** → ativar a **Google Drive API**.
3. **Tela de consentimento OAuth** (Google Auth Platform): tipo **Externo**; nome do app, e-mail de suporte; em **Acesso a dados** adicionar o escopo `.../auth/drive.file`.
4. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**. Em **Origens JavaScript autorizadas**: `https://nathanrab1.github.io` e `http://localhost:5173`.
5. Colar o ID (`....apps.googleusercontent.com`) em `GOOGLE_CLIENT_ID`, no começo de `src/drive.ts`. Ele não é segredo.

Enquanto o app estiver em **modo de teste**, só as contas cadastradas como usuários de teste (até 100) conseguem entrar. Para liberar a todos: **Publicar app** e fazer a verificação da marca (página inicial, política de privacidade, domínio verificado).

Contas de escola (Google Workspace for Education): o administrador pode bloquear apps de terceiros. Para alunos menores de 18 anos, o admin precisa liberar o app em **Admin → Segurança → Controles de acesso a API → Apps de terceiros**, usando o ID do cliente.
