import type { ITheme } from '@xterm/xterm';

// Colour themes (Settings → Appearance). Each one sets the app's CSS tokens *and* a full 16-colour
// terminal palette, so the CLIs inside the tabs match the chrome around them. `cayrnx` is the
// built-in look and follows the Dark / Light / System switch; the others have a fixed mode.

export interface Palette {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  /** Four colours for the picker's swatch. */
  swatch: [string, string, string, string];
  tokens: Record<string, string>;
  term: ITheme;
}

const rgba = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

interface Base {
  bg: string;
  panel: string;
  raised: string;
  elev: string;
  line: string;
  line2: string;
  text: string;
  muted: string;
  dim: string;
  accent: string;
  accentInk: string;
  blue: string;
  green: string;
  red: string;
  purple: string;
  teal: string;
  term: string;
  termfg: string;
}

/** The CSS tokens every screen uses, from a palette's base colours. */
function tokens(b: Base, mode: 'dark' | 'light'): Record<string, string> {
  const dark = mode === 'dark';
  return {
    '--bg': b.bg,
    '--panel': b.panel,
    '--raised': b.raised,
    '--elev': b.elev,
    '--line': b.line,
    '--line2': b.line2,
    '--text': b.text,
    '--muted': b.muted,
    '--dim': b.dim,
    '--accent': b.accent,
    '--accent-ink': b.accentInk,
    '--accent-soft': rgba(b.accent, dark ? 0.16 : 0.12),
    '--blue': b.blue,
    '--blue-soft': rgba(b.blue, dark ? 0.16 : 0.1),
    '--green': b.green,
    '--green-soft': rgba(b.green, dark ? 0.15 : 0.1),
    '--red': b.red,
    '--red-soft': rgba(b.red, dark ? 0.15 : 0.09),
    '--purple': b.purple,
    '--teal': b.teal,
    '--hover': dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.045)',
    '--hover2': b.line,
    '--term': b.term,
    '--termfg': b.termfg,
    '--shadow': dark ? '0 18px 50px rgba(0,0,0,.55),0 2px 8px rgba(0,0,0,.4)' : '0 18px 50px rgba(20,20,30,.18),0 2px 8px rgba(20,20,30,.1)',
    '--scrim': dark ? 'rgba(5,6,8,.62)' : 'rgba(20,20,30,.32)',
  };
}

/** 16-colour ANSI palette: [black, red, green, yellow, blue, magenta, cyan, white] × normal, bright. */
function ansi(bg: string, fg: string, cursor: string, selection: string, normal: string[], bright: string[]): ITheme {
  const [black, red, green, yellow, blue, magenta, cyan, white] = normal;
  const [bBlack, bRed, bGreen, bYellow, bBlue, bMagenta, bCyan, bWhite] = bright;
  return {
    background: bg,
    foreground: fg,
    cursor,
    cursorAccent: bg,
    selectionBackground: selection,
    black,
    red,
    green,
    yellow,
    blue,
    magenta,
    cyan,
    white,
    brightBlack: bBlack,
    brightRed: bRed,
    brightGreen: bGreen,
    brightYellow: bYellow,
    brightBlue: bBlue,
    brightMagenta: bMagenta,
    brightCyan: bCyan,
    brightWhite: bWhite,
  };
}

function palette(id: string, name: string, mode: 'dark' | 'light', b: Base, term: ITheme): Palette {
  return { id, name, mode, swatch: [b.bg, b.accent, b.blue, b.green], tokens: tokens(b, mode), term };
}

export const PALETTES: Palette[] = [
  palette(
    'dracula',
    'Dracula',
    'dark',
    { bg: '#21222c', panel: '#282a36', raised: '#2f3241', elev: '#343746', line: '#383a4a', line2: '#44475a', text: '#f8f8f2', muted: '#c5c8d6', dim: '#8b8fa8', accent: '#bd93f9', accentInk: '#1b1528', blue: '#8be9fd', green: '#50fa7b', red: '#ff5555', purple: '#ff79c6', teal: '#8be9fd', term: '#282a36', termfg: '#f8f8f2' },
    ansi('#282a36', '#f8f8f2', '#f8f8f2', 'rgba(68,71,90,.8)', ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2'], ['#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff']),
  ),
  palette(
    'nord',
    'Nord',
    'dark',
    { bg: '#242933', panel: '#2e3440', raised: '#3b4252', elev: '#3b4252', line: '#3b4252', line2: '#4c566a', text: '#eceff4', muted: '#d8dee9', dim: '#8d96a8', accent: '#88c0d0', accentInk: '#1d232c', blue: '#81a1c1', green: '#a3be8c', red: '#bf616a', purple: '#b48ead', teal: '#8fbcbb', term: '#2e3440', termfg: '#d8dee9' },
    ansi('#2e3440', '#d8dee9', '#d8dee9', 'rgba(76,86,106,.7)', ['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0'], ['#4c566a', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#8fbcbb', '#eceff4']),
  ),
  palette(
    'solarized-dark',
    'Solarized Dark',
    'dark',
    { bg: '#00212b', panel: '#002b36', raised: '#073642', elev: '#073642', line: '#073642', line2: '#1d4b57', text: '#eee8d5', muted: '#93a1a1', dim: '#6c8387', accent: '#b58900', accentInk: '#002b36', blue: '#268bd2', green: '#859900', red: '#dc322f', purple: '#6c71c4', teal: '#2aa198', term: '#002b36', termfg: '#93a1a1' },
    ansi('#002b36', '#93a1a1', '#93a1a1', 'rgba(7,54,66,.9)', ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5'], ['#586e75', '#cb4b16', '#93a1a1', '#b58900', '#839496', '#6c71c4', '#2aa198', '#fdf6e3']),
  ),
  palette(
    'solarized-light',
    'Solarized Light',
    'light',
    { bg: '#eee8d5', panel: '#fdf6e3', raised: '#fffbf0', elev: '#fffbf0', line: '#e4ddc8', line2: '#d3cbb7', text: '#073642', muted: '#586e75', dim: '#839496', accent: '#b58900', accentInk: '#fdf6e3', blue: '#268bd2', green: '#859900', red: '#dc322f', purple: '#6c71c4', teal: '#2aa198', term: '#fdf6e3', termfg: '#586e75' },
    ansi('#fdf6e3', '#586e75', '#586e75', 'rgba(147,161,161,.3)', ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5'], ['#002b36', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3']),
  ),
  palette(
    'gruvbox',
    'Gruvbox',
    'dark',
    { bg: '#1d2021', panel: '#282828', raised: '#32302f', elev: '#3c3836', line: '#3c3836', line2: '#504945', text: '#ebdbb2', muted: '#d5c4a1', dim: '#928374', accent: '#fabd2f', accentInk: '#282828', blue: '#83a598', green: '#b8bb26', red: '#fb4934', purple: '#d3869b', teal: '#8ec07c', term: '#282828', termfg: '#ebdbb2' },
    ansi('#282828', '#ebdbb2', '#ebdbb2', 'rgba(80,73,69,.8)', ['#282828', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984'], ['#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2']),
  ),
  palette(
    'tokyo-night',
    'Tokyo Night',
    'dark',
    { bg: '#16161e', panel: '#1a1b26', raised: '#1f2335', elev: '#24283b', line: '#232433', line2: '#2f334d', text: '#c0caf5', muted: '#a9b1d6', dim: '#6b7394', accent: '#7aa2f7', accentInk: '#16161e', blue: '#7dcfff', green: '#9ece6a', red: '#f7768e', purple: '#bb9af7', teal: '#73daca', term: '#1a1b26', termfg: '#c0caf5' },
    ansi('#1a1b26', '#c0caf5', '#c0caf5', 'rgba(40,52,87,.9)', ['#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6'], ['#414868', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5']),
  ),
  palette(
    'catppuccin',
    'Catppuccin Mocha',
    'dark',
    { bg: '#181825', panel: '#1e1e2e', raised: '#232336', elev: '#313244', line: '#2a2b3c', line2: '#45475a', text: '#cdd6f4', muted: '#bac2de', dim: '#7f849c', accent: '#cba6f7', accentInk: '#1e1e2e', blue: '#89b4fa', green: '#a6e3a1', red: '#f38ba8', purple: '#f5c2e7', teal: '#94e2d5', term: '#1e1e2e', termfg: '#cdd6f4' },
    ansi('#1e1e2e', '#cdd6f4', '#f5e0dc', 'rgba(88,91,112,.6)', ['#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de'], ['#585b70', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#a6adc8']),
  ),
  palette(
    'one-dark',
    'One Dark',
    'dark',
    { bg: '#21252b', panel: '#282c34', raised: '#2c313a', elev: '#323842', line: '#2f343e', line2: '#3e4452', text: '#dcdfe4', muted: '#abb2bf', dim: '#7f848e', accent: '#61afef', accentInk: '#1b1f25', blue: '#61afef', green: '#98c379', red: '#e06c75', purple: '#c678dd', teal: '#56b6c2', term: '#282c34', termfg: '#abb2bf' },
    ansi('#282c34', '#abb2bf', '#528bff', 'rgba(62,68,82,.9)', ['#3f4451', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#d7dae0'], ['#4f5666', '#ff7b86', '#b1e18b', '#efcb87', '#67cdff', '#e48bff', '#63d4e0', '#e6e6e6']),
  ),
  palette(
    'cyberpunk',
    'Cyberpunk',
    'dark',
    { bg: '#07021a', panel: '#0d0524', raised: '#150a33', elev: '#1c0e42', line: '#241254', line2: '#3a1c7a', text: '#f2e9ff', muted: '#c3b2e8', dim: '#8a76b8', accent: '#ff2a6d', accentInk: '#0d0524', blue: '#05d9e8', green: '#00ff9f', red: '#ff3864', purple: '#d300c5', teal: '#05d9e8', term: '#0a0320', termfg: '#e8dcff' },
    ansi('#0a0320', '#e8dcff', '#05d9e8', 'rgba(255,42,109,.3)', ['#1c0e42', '#ff3864', '#00ff9f', '#f9f002', '#2d7dff', '#ff2a6d', '#05d9e8', '#d7c9f5'], ['#6b52a8', '#ff6b8f', '#6affc4', '#fffb7a', '#5e9cff', '#ff66a3', '#6cf6ff', '#ffffff']),
  ),
  palette(
    'phosphor',
    'Green Phosphor',
    'dark',
    { bg: '#010601', panel: '#020b02', raised: '#041304', elev: '#061a06', line: '#0a260a', line2: '#124012', text: '#4dff7a', muted: '#33d65f', dim: '#1f9a40', accent: '#7dff9b', accentInk: '#021002', blue: '#57ffa0', green: '#33ff66', red: '#d4ff4a', purple: '#9dffb4', teal: '#57ffa0', term: '#010801', termfg: '#33ff66' },
    // A monochrome CRT: every colour is a shade of green (red is a yellow-green so diffs still read).
    ansi('#010801', '#33ff66', '#66ff8c', 'rgba(51,255,102,.25)', ['#062806', '#b8f24a', '#33ff66', '#8cff5a', '#2bd96b', '#5cff8a', '#4dffb0', '#9dffb4'], ['#1f7a3a', '#d4ff4a', '#66ff8c', '#b8ff7a', '#4dff9a', '#8cffb0', '#80ffd0', '#d9ffe3']),
  ),
];

export const THEME_OPTIONS = [{ id: 'cayrnx', name: 'Cayrnx', mode: null as 'dark' | 'light' | null }, ...PALETTES.map((p) => ({ id: p.id, name: p.name, mode: p.mode }))];

export function paletteById(id: string | undefined): Palette | null {
  return PALETTES.find((p) => p.id === id) || null;
}

/** Scoped CSS for every palette: `.cx[data-palette=…]` overrides the dark/light tokens. */
export function paletteCss(): string {
  return PALETTES.map((p) => `.cx.cx[data-palette="${p.id}"]{${Object.entries(p.tokens).map(([k, v]) => `${k}:${v}`).join(';')}}`).join('\n');
}
