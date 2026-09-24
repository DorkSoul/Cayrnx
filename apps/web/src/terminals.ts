import { Terminal, type ITheme } from '@xterm/xterm';
import { paletteById } from './themes.ts';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { TERM_FONTS, type ServerMsg, type Settings, type TermColors } from '@cayrnx/shared';
import { socket } from './ws.ts';
import { copyText } from './util.ts';
import { errToast, toast } from './store.ts';

interface Entry {
  tab: string;
  term: Terminal;
  fit: FitAddon;
  el: HTMLDivElement;
  detach: () => void;
  webgl: WebglAddon | null;
  opened: boolean;
  lastUsed: number;
  replayed: boolean;
  onReplay: Set<() => void>;
}

const cache = new Map<string, Entry>();
const MAX_CACHED = 14;
let rootEl: HTMLElement | null = null;
let current: { settings: Settings | null; mobile: boolean } = { settings: null, mobile: false };

export function setTerminalRoot(el: HTMLElement | null): void {
  rootEl = el;
}

function cssVar(name: string, fallback: string): string {
  const el = rootEl || document.querySelector('.cx');
  if (!el) return fallback;
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

/** Terminal "glass" follows the app theme (spec §4.5): palette derived from the CSS tokens. */
export function themeFromTokens(): ITheme {
  // A colour theme brings its own 16-colour palette; the Cayrnx theme derives one from the tokens.
  const pal = paletteById(current.settings?.appearance.palette);
  if (pal) return pal.term;
  const light = (rootEl || document.querySelector('.cx'))?.classList.contains('light');
  const fg = cssVar('--termfg', '#d9d5cc');
  return {
    background: cssVar('--term', '#0b0d0f'),
    foreground: fg,
    cursor: fg,
    cursorAccent: cssVar('--term', '#0b0d0f'),
    selectionBackground: light ? 'rgba(163,94,10,.22)' : 'rgba(227,168,87,.28)',
    black: light ? '#26282b' : '#1b1f23',
    red: cssVar('--red', '#f08474'),
    green: cssVar('--green', '#6fc893'),
    yellow: cssVar('--accent', '#e3a857'),
    blue: cssVar('--blue', '#7db0ff'),
    magenta: cssVar('--purple', '#bea4f3'),
    cyan: cssVar('--teal', '#5fc6c0'),
    white: light ? '#b8b2a7' : '#d9d5cc',
    brightBlack: cssVar('--dim', '#858b92'),
    brightRed: cssVar('--red', '#f08474'),
    brightGreen: cssVar('--green', '#6fc893'),
    brightYellow: cssVar('--accent', '#e3a857'),
    brightBlue: cssVar('--blue', '#7db0ff'),
    brightMagenta: cssVar('--purple', '#bea4f3'),
    brightCyan: cssVar('--teal', '#5fc6c0'),
    brightWhite: light ? '#1c1e21' : '#f4f1ea',
  };
}

function termOptions() {
  const a = current.settings?.appearance;
  return {
    fontFamily: TERM_FONTS[a?.monoFont || 'JetBrains Mono'] || TERM_FONTS['JetBrains Mono'],
    fontSize: current.mobile ? Math.min(a?.fontSize ?? 13, 12) : a?.fontSize ?? 13,
    lineHeight: a?.lineHeight ?? 1.3,
    cursorStyle: a?.cursor ?? 'block',
    theme: themeFromTokens(),
  } as const;
}

/** Any CSS colour → `#rrggbb` (null if the browser can't parse it). */
function toHex(c: string | undefined): string | null {
  if (!c) return null;
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${c.slice(1).replace(/./g, '$&$&')}`.toLowerCase();
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c);
  return m ? `#${[m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, '0')).join('')}` : null;
}

const ANSI_KEYS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'] as const;

/** The server answers the CLIs' colour queries with these (OpenCode's "system" theme reads them). */
function termColors(t: ITheme): TermColors | null {
  const bg = toHex(t.background);
  const fg = toHex(t.foreground);
  const ansi = ANSI_KEYS.map((k) => toHex(t[k]));
  if (!bg || !fg || ansi.some((a) => !a)) return null;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
  return { mode: 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? 'light' : 'dark', bg, fg, cursor: toHex(t.cursor) || fg, ansi: ansi as string[] };
}

/** Re-apply appearance settings and the theme to every cached terminal. */
export function configureTerminals(settings: Settings | null, mobile: boolean): void {
  current = { settings, mobile };
  const o = termOptions();
  const colors = settings ? termColors(o.theme) : null;
  if (colors) socket.setColors(colors);
  for (const e of cache.values()) {
    e.term.options.fontFamily = o.fontFamily;
    e.term.options.fontSize = o.fontSize;
    e.term.options.lineHeight = o.lineHeight;
    e.term.options.cursorStyle = o.cursorStyle;
    e.term.options.theme = o.theme;
  }
}

function evict(): void {
  if (cache.size <= MAX_CACHED) return;
  const lru = [...cache.values()].filter((e) => !e.el.isConnected).sort((a, b) => a.lastUsed - b.lastUsed);
  for (const e of lru.slice(0, cache.size - MAX_CACHED)) disposeTerminal(e.tab);
}

export function getTerminal(tab: string): Entry {
  let e = cache.get(tab);
  if (e) {
    e.lastUsed = Date.now();
    return e;
  }
  const o = termOptions();
  const term = new Terminal({
    ...o,
    cursorBlink: true,
    scrollback: 5000,
    allowProposedApi: true,
    macOptionIsMeta: true,
    convertEol: false,
    drawBoldTextInBrightColors: false,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const uni = new Unicode11Addon();
  term.loadAddon(uni);
  term.unicode.activeVersion = '11';
  term.loadAddon(new WebLinksAddon((_ev, uri) => window.open(uri, '_blank', 'noopener')));
  const el = document.createElement('div');
  el.style.height = '100%';
  el.style.width = '100%';
  const entry: Entry = { tab, term, fit, el, detach: () => undefined, webgl: null, opened: false, lastUsed: Date.now(), replayed: false, onReplay: new Set() };
  term.onData((data) => socket.send({ t: 'input', tab, data }));
  term.onBinary((data) => socket.send({ t: 'input', tab, data }));
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type !== 'keydown') return true;
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.shiftKey && ev.code === 'KeyC') {
      const sel = term.getSelection();
      if (sel) void copyText(sel);
      return false;
    }
    // Alt+R / Alt+W open Read / Write even while the terminal has focus.
    if (ev.altKey && !mod && (ev.code === 'KeyR' || ev.code === 'KeyW')) return false;
    // Ctrl/Cmd+V: let the browser paste (text, or an image we upload) instead of sending ^V —
    // on ^V the CLI looks for an image on the *server's* clipboard, which is never yours.
    if (mod && !ev.shiftKey && !ev.altKey && ev.code === 'KeyV') return false;
    return true;
  });
  attachImagePaste(tab, el);
  const handler = (m: ServerMsg) => {
    if (m.t === 'replay') {
      term.reset();
      if (term.cols !== m.cols || term.rows !== m.rows) term.resize(m.cols, m.rows);
      term.write(m.data, () => {
        entry.replayed = true;
        for (const f of entry.onReplay) f();
      });
    } else if (m.t === 'data') term.write(m.data);
    else if (m.t === 'size') {
      if (term.cols !== m.cols || term.rows !== m.rows) term.resize(m.cols, m.rows);
    }
  };
  entry.detach = socket.attach(tab, handler, () => proposed(entry));
  cache.set(tab, entry);
  evict();
  return entry;
}

/** Image files in a paste or drop (any image type; odd ones are converted to PNG on upload). */
function imagesOf(list: DataTransferItemList | FileList | null | undefined): File[] {
  if (!list) return [];
  const out: File[] = [];
  for (const it of Array.from(list as ArrayLike<DataTransferItem | File>)) {
    const f = it instanceof File ? it : it.kind === 'file' ? it.getAsFile() : null;
    if (f && f.type.startsWith('image/')) out.push(f);
  }
  return out;
}

/** BMP, TIFF, AVIF… (some Windows tools copy those) → PNG, which every CLI reads. */
async function asUploadable(f: File): Promise<Blob> {
  if (/^image\/(png|jpeg|gif|webp)$/.test(f.type)) return f;
  const bmp = await createImageBitmap(f).catch(() => null);
  if (!bmp) throw new Error(`This image type can't be read by the browser (${f.type}) — copy it as PNG or JPEG`);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  const png = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!png) throw new Error('Could not convert the image to PNG');
  return png;
}

/** Upload pasted/dropped images; the server saves each one and pastes its path into the CLI. */
async function uploadImages(tab: string, files: File[]): Promise<void> {
  for (const f of files) {
    try {
      const body = await asUploadable(f);
      const r = await fetch(`/api/tabs/${encodeURIComponent(tab)}/paste-image`, { method: 'POST', headers: { 'content-type': body.type, 'x-cayrnx': '1' }, body, credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `upload failed (${r.status})`);
      toast(`Image attached · ${Math.max(1, Math.round(j.bytes / 1024))} KB`, 'ok');
    } catch (e) {
      errToast(e);
    }
  }
}

/**
 * The CLI runs on the server, so it can't read this computer's clipboard: images pasted or
 * dropped on a terminal are uploaded and their saved path is pasted instead. Text pastes are
 * left to xterm as before.
 */
function attachImagePaste(tab: string, el: HTMLElement): void {
  el.addEventListener(
    'paste',
    (ev) => {
      const cd = ev.clipboardData;
      const imgs = imagesOf(cd?.items);
      if (imgs.length) {
        ev.preventDefault();
        ev.stopPropagation();
        void uploadImages(tab, imgs);
        return;
      }
      // Nothing xterm can paste: an empty paste makes the CLI hunt the *server's* clipboard
      // ("No image found in clipboard"), so stop it here and say what was on this one.
      if (!cd?.getData('text/plain')) {
        ev.preventDefault();
        ev.stopPropagation();
        const kinds = cd ? [...new Set(Array.from(cd.items).map((i) => i.type || i.kind))].join(', ') : '';
        toast(kinds ? `Nothing to paste — the clipboard holds ${kinds}, not text or an image` : 'Nothing to paste — the clipboard is empty', 'warn');
      }
    },
    true,
  );
  el.addEventListener('dragover', (ev) => {
    if (ev.dataTransfer?.types.includes('Files')) {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
    }
  });
  el.addEventListener('drop', (ev) => {
    const imgs = imagesOf(ev.dataTransfer?.files);
    if (!ev.dataTransfer?.files.length) return;
    ev.preventDefault();
    if (imgs.length) void uploadImages(tab, imgs);
    else toast('Only images can be dropped on a terminal (PNG, JPEG, GIF, WebP)', 'warn');
  });
}

function proposed(e: Entry): { cols: number; rows: number } {
  if (e.opened && e.el.isConnected) {
    try {
      const d = e.fit.proposeDimensions();
      if (d && d.cols > 0 && d.rows > 0) return { cols: d.cols, rows: d.rows };
    } catch {
      /* not measurable yet */
    }
  }
  return { cols: 120, rows: 32 };
}

/** Mount a cached terminal into a container. Returns an unmount function. */
export function mountTerminal(tab: string, container: HTMLElement, opts: { focus: boolean }): () => void {
  const e = getTerminal(tab);
  container.appendChild(e.el);
  if (!e.opened) {
    e.term.open(e.el);
    e.opened = true;
  }
  try {
    const gl = new WebglAddon();
    gl.onContextLoss(() => {
      gl.dispose();
      if (e.webgl === gl) e.webgl = null;
    });
    e.term.loadAddon(gl);
    e.webgl = gl;
  } catch {
    e.webgl = null; // DOM renderer fallback
  }
  const sendFocus = () => socket.send({ t: 'focus', tab, ...proposed(e) });
  requestAnimationFrame(() => {
    sendFocus();
    e.term.refresh(0, e.term.rows - 1);
    if (opts.focus) e.term.focus();
  });
  let t: number | null = null;
  const ro = new ResizeObserver(() => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => socket.send({ t: 'resize', tab, ...proposed(e) }), 80);
  });
  ro.observe(container);
  // The last-focused client sets the PTY size (plan §3.3): interacting reclaims it.
  const reclaim = () => sendFocus();
  e.el.addEventListener('mousedown', reclaim);
  e.el.addEventListener('touchstart', reclaim, { passive: true });
  e.term.textarea?.addEventListener('focus', reclaim);
  return () => {
    ro.disconnect();
    if (t) window.clearTimeout(t);
    e.el.removeEventListener('mousedown', reclaim);
    e.el.removeEventListener('touchstart', reclaim);
    e.term.textarea?.removeEventListener('focus', reclaim);
    e.webgl?.dispose();
    e.webgl = null;
    if (e.el.parentElement === container) container.removeChild(e.el);
    e.lastUsed = Date.now();
  };
}

export function focusTerminal(tab: string): void {
  cache.get(tab)?.term.focus();
}

export function clearTerminal(tab: string): void {
  cache.get(tab)?.term.clear();
}

export function disposeTerminal(tab: string): void {
  const e = cache.get(tab);
  if (!e) return;
  e.detach();
  e.webgl?.dispose();
  e.term.dispose();
  e.el.remove();
  cache.delete(tab);
}

/** Drop terminals whose tabs no longer exist. */
export function pruneTerminals(alive: Set<string>): void {
  for (const tab of [...cache.keys()]) if (!alive.has(tab)) disposeTerminal(tab);
}

/** Text currently on screen (tests and the "copy output" affordance). */
export function screenText(tab: string): string {
  const e = cache.get(tab);
  if (!e) return '';
  const b = e.term.buffer.active;
  const out: string[] = [];
  for (let y = 0; y < b.length; y++) out.push(b.getLine(y)?.translateToString(true) || '');
  return out.join('\n');
}
