/**
 * Projetos no Google Drive, sem servidor: login pelo Google Identity Services
 * (token OAuth direto no navegador) e a API REST do Drive. Com o escopo
 * drive.file o app só enxerga o que ele mesmo criou: a pasta "Beta Kit" e os
 * projetos dentro dela.
 */

// ID do cliente OAuth (Google Cloud Console → Credenciais → "Aplicativo da Web").
// Não é segredo: vai no código da página de qualquer jeito. Vazio = Drive desligado.
export const GOOGLE_CLIENT_ID: string = "960463729319-usqha41doqtbv3rs5dpth9n4k2np2gqn.apps.googleusercontent.com";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_NAME = "Beta Kit";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const HINT_KEY = "betablocks.googleEmail";

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

export class DriveError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}

// ---- tipos mínimos do Google Identity Services ----
interface TokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(o?: { prompt?: string; login_hint?: string }): void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(c: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

export const driveConfigured = () => GOOGLE_CLIENT_ID !== "";

let gisLoading = false;
/** Carrega o script do Google cedo: o pedido de login precisa sair direto do clique. */
export function preloadGoogle() {
  if (!driveConfigured() || gisLoading) return;
  gisLoading = true;
  const s = document.createElement("script");
  s.src = "https://accounts.google.com/gsi/client";
  s.async = true;
  s.onerror = () => {
    gisLoading = false;
    s.remove();
  };
  document.head.appendChild(s);
}

// ---- login ----
let token: string | null = null;
let tokenExpiresAt = 0;
let tokenClient: TokenClient | null = null;
let pending: { resolve: () => void; reject: (e: Error) => void } | null = null;
let email: string | null = null;
let folderId: string | null = null;

const hasToken = () => token !== null && Date.now() < tokenExpiresAt - 60_000;

export const signedInEmail = () => (hasToken() ? email : null);

/** Conta usada da última vez: o app continua "conectado" entre visitas e renova o token no clique. */
export const rememberedEmail = () => localStorage.getItem(HINT_KEY);

function settle(err: Error | null) {
  const p = pending;
  pending = null;
  if (err) p?.reject(err);
  else p?.resolve();
}

/**
 * Garante o token do Google. Tem que ser chamada direto no clique (antes de
 * qualquer await), senão o navegador bloqueia o pop-up de login.
 */
export function signIn(): Promise<void> {
  if (hasToken()) return Promise.resolve();
  const oauth2 = window.google?.accounts.oauth2;
  if (!oauth2) {
    preloadGoogle();
    return Promise.reject(new DriveError("o login do Google ainda está carregando, tente de novo"));
  }
  tokenClient ??= oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPE,
    callback: (r) => {
      if (r.error) return settle(new DriveError(r.error_description ?? r.error));
      token = r.access_token;
      tokenExpiresAt = Date.now() + r.expires_in * 1000;
      settle(null);
    },
    error_callback: (e) =>
      settle(new DriveError(e.type === "popup_closed" ? "login cancelado" : "o pop-up do Google foi bloqueado")),
  });
  settle(new DriveError("login cancelado")); // um pedido anterior que ficou sem resposta
  return new Promise<void>((resolve, reject) => {
    pending = { resolve, reject };
    tokenClient!.requestAccessToken({ prompt: "", login_hint: localStorage.getItem(HINT_KEY) ?? undefined });
  }).then(fetchEmail);
}

/** Sai da conta e revoga a permissão (computador compartilhado na escola). */
export function signOut() {
  if (token) window.google?.accounts.oauth2.revoke(token);
  token = email = folderId = null;
  tokenExpiresAt = 0;
  localStorage.removeItem(HINT_KEY);
}

// ---- API ----
async function api(url: string, init: RequestInit = {}): Promise<Response> {
  if (!hasToken()) throw new DriveError("entre com o Google de novo", 401);
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (res.ok) return res;
  if (res.status === 401) {
    token = null;
    throw new DriveError("a sessão do Google expirou, clique de novo", 401);
  }
  let msg = `erro ${res.status}`;
  try {
    msg = (await res.json()).error?.message ?? msg;
  } catch {
    /* resposta sem JSON */
  }
  throw new DriveError(msg, res.status);
}

const query = (params: Record<string, string>) => new URLSearchParams(params).toString();

async function fetchEmail() {
  if (email) return;
  const r = await api(`${API}/about?fields=user(emailAddress)`);
  email = (await r.json()).user.emailAddress as string;
  localStorage.setItem(HINT_KEY, email);
}

/** Id da pasta "Beta Kit", criando na primeira vez. */
async function folder(): Promise<string> {
  if (folderId) return folderId;
  const q = `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`;
  const r = await api(`${API}/files?${query({ q, fields: "files(id)", spaces: "drive" })}`);
  const found = (await r.json()).files as { id: string }[];
  if (found.length) return (folderId = found[0].id);
  const created = await api(`${API}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
  });
  return (folderId = (await created.json()).id as string);
}

const FILE_FIELDS = "id,name,modifiedTime";

/** Projetos da pasta, do mais recente para o mais antigo. */
export async function listProjects(): Promise<DriveFile[]> {
  const q = `'${await folder()}' in parents and mimeType='application/json' and trashed=false`;
  const r = await api(
    `${API}/files?${query({ q, orderBy: "modifiedTime desc", pageSize: "200", fields: `files(${FILE_FIELDS})` })}`,
  );
  return (await r.json()).files;
}

/**
 * Cria (sem `id`) ou sobrescreve um projeto. A miniatura (JPEG em data URL)
 * também vai para o Drive mostrar o arquivo com a cara dos blocos.
 */
export async function saveProject(name: string, content: string, thumbnail: string | null, id?: string) {
  const meta: Record<string, unknown> = { name, mimeType: "application/json" };
  if (!id) meta.parents = [await folder()];
  if (thumbnail) {
    const b64 = thumbnail.slice(thumbnail.indexOf(",") + 1).replace(/\+/g, "-").replace(/\//g, "_");
    meta.contentHints = { thumbnail: { image: b64, mimeType: "image/jpeg" } };
  }
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
  form.append("file", new Blob([content], { type: "application/json" }));
  const params = query({ uploadType: "multipart", fields: FILE_FIELDS });
  const r = await api(id ? `${UPLOAD}/files/${id}?${params}` : `${UPLOAD}/files?${params}`, {
    method: id ? "PATCH" : "POST",
    body: form,
  });
  return (await r.json()) as DriveFile;
}

export async function loadProject(id: string): Promise<unknown> {
  return (await api(`${API}/files/${id}?alt=media`)).json();
}

/** Manda para a lixeira do Drive (dá para recuperar por lá). */
export async function trashProject(id: string) {
  await api(`${API}/files/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}
