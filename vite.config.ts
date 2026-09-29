import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Gera dist/sw.js depois do build, com a lista de todos os arquivos publicados: o app instalado
 * (PWA) abre sem internet. O firmware (1,7 MB, só serve para gravar pelo cabo) fica de fora e é
 * guardado na primeira vez que for usado.
 */
function serviceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "beta-blocks-sw",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const arquivos: string[] = [];
      const andar = (dir: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name);
          if (e.isDirectory()) andar(p);
          else arquivos.push(relative(outDir, p).split(sep).join("/"));
        }
      };
      andar(outDir);
      const lista = arquivos.filter((f) => f !== "sw.js" && !f.startsWith("firmware/") && !f.endsWith(".DS_Store")).sort();
      const hash = createHash("sha256");
      for (const f of lista) hash.update(f).update(readFileSync(join(outDir, f)));
      const versao = hash.digest("hex").slice(0, 12);
      const modelo = readFileSync("src/sw.js", "utf8");
      writeFileSync(
        join(outDir, "sw.js"),
        modelo.replace("__VERSAO__", versao).replace('"__ARQUIVOS__"', JSON.stringify(["./", ...lista.map((f) => `./${f}`)])),
      );
    },
  };
}

export default defineConfig({
  base: "./",
  server: { port: 5173 },
  plugins: [serviceWorker()],
  build: {
    target: "es2022",
    rollupOptions: {
      // app principal e a página de controle do celular (controle.html)
      input: { main: "index.html", controle: "controle.html" },
    },
  },
});
