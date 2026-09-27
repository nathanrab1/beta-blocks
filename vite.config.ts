import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { port: 5173 },
  build: {
    target: "es2022",
    rollupOptions: {
      // app principal e a página de controle do celular (controle.html)
      input: { main: "index.html", controle: "controle.html" },
    },
  },
});
