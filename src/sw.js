// Service worker do app instalado (PWA). Modelo: o build (vite.config.ts) preenche a versão e a
// lista de arquivos e grava o resultado em dist/sw.js.
const CACHE = "bb-__VERSAO__";
const CACHE_FIRMWARE = "bb-firmware";
const ARQUIVOS = "__ARQUIVOS__";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith("bb-") && n !== CACHE && n !== CACHE_FIRMWARE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return; // Google Drive etc.: direto na rede

  // Páginas: rede primeiro (pega a versão nova logo depois de publicar); sem internet, a guardada.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r ?? caches.match("./"))));
    return;
  }

  // Firmware: guarda na primeira vez que for baixado.
  if (req.url.includes("/firmware/")) {
    e.respondWith(
      caches.open(CACHE_FIRMWARE).then((c) =>
        c.match(req).then(
          (r) =>
            r ??
            fetch(req).then((res) => {
              if (res.ok) c.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }

  // Scripts, estilos, ícones: os nomes têm hash, então o guardado vale.
  e.respondWith(caches.match(req).then((r) => r ?? fetch(req)));
});
