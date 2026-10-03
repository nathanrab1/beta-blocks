// Gera docs/manual/manual-beta-blocks.pdf: monta a página do manual com o Vite (os blocos são
// desenhados pelo próprio Blockly do app), serve os arquivos prontos e imprime em PDF com o Chrome
// sem janela. Uso: npm run manual
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build, preview } from "vite";

const CHROMES = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);
const chrome = CHROMES.find((c) => existsSync(c));
if (!chrome) throw new Error("Chrome não encontrado (defina a variável CHROME com o caminho)");

const saida = resolve("docs/manual/manual-beta-blocks.pdf");
const tmp = mkdtempSync(join(tmpdir(), "bb-manual-"));
const pasta = join(tmp, "site");
const perfil = join(tmp, "chrome");

// a página pronta (sem o servidor de desenvolvimento, que deixa uma conexão aberta e o Chrome não
// termina de "carregar")
await build({
  logLevel: "error",
  base: "/",
  build: { outDir: pasta, emptyOutDir: true, rollupOptions: { input: { manual: resolve("docs/manual/index.html") } } },
});
const servidor = await preview({ logLevel: "error", base: "/", build: { outDir: pasta }, preview: { port: 5199, strictPort: true } });
rmSync(saida, { force: true });
// o Chrome grava o PDF mas às vezes não fecha sozinho (timers da página): espera o arquivo parar de
// crescer e encerra o Chrome
const tamanho = () => (existsSync(saida) ? statSync(saida).size : 0);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let proc;
try {
  proc = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${perfil}`,
      "--no-pdf-header-footer",
      "--virtual-time-budget=15000",
      `--print-to-pdf=${saida}`,
      "http://localhost:5199/docs/manual/",
    ],
    { stdio: "ignore" },
  );
  let antes = -1;
  for (let i = 0; i < 240; i++) {
    await dormir(500);
    const t = tamanho();
    if (t > 0 && t === antes) break;
    antes = t;
  }
  if (!tamanho()) throw new Error("o Chrome não gerou o PDF");
  console.log(`Manual gerado: ${saida} (${Math.round(tamanho() / 1024)} KB)`);
} finally {
  proc?.kill();
  await new Promise((r) => servidor.httpServer.close(r));
  rmSync(tmp, { recursive: true, force: true });
}
