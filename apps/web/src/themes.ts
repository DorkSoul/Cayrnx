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
    // Purple night with hot-pink highlights.
    { bg: '#1b1726', panel: '#231e33', raised: '#2c2640', elev: '#342d4c', line: '#3b3354', line2: '#57497e', text: '#f8f8f2', muted: '#d2c8ee', dim: '#9488b8', accent: '#ff79c6', accentInk: '#2a0f22', blue: '#8be9fd', green: '#50fa7b', red: '#ff5555', purple: '#bd93f9', teal: '#8be9fd', term: '#211c30', termfg: '#f8f8f2' },
    ansi('#211c30', '#f8f8f2', '#ff79c6', 'rgba(189,147,249,.3)', ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2'], ['#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff']),
  ),
  palette(
    'nord',
    'Nord',
    'dark',
    // Lighter slate greys and icy frost blue: the softest of the dark themes.
    { bg: '#2e3440', panel: '#3b4252', raised: '#434c5e', elev: '#4c566a', line: '#4c566a', line2: '#616e88', text: '#eceff4', muted: '#d8dee9', dim: '#a5afc2', accent: '#88c0d0', accentInk: '#2e3440', blue: '#81a1c1', green: '#a3be8c', red: '#bf616a', purple: '#b48ead', teal: '#8fbcbb', term: '#353c4a', termfg: '#e5e9f0' },
    ansi('#353c4a', '#e5e9f0', '#88c0d0', 'rgba(136,192,208,.28)', ['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0'], ['#616e88', '#d08770', '#b5d19c', '#f0d399', '#94b4d4', '#c7a0c0', '#8fbcbb', '#eceff4']),
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
    // Warm browns with an orange accent, like an old wooden desk.
    { bg: '#221c16', panel: '#2b241d', raised: '#372e25', elev: '#41362b', line: '#4a3d30', line2: '#6b5840', text: '#ebdbb2', muted: '#d5c4a1', dim: '#a89984', accent: '#fe8019', accentInk: '#221c16', blue: '#83a598', green: '#b8bb26', red: '#fb4934', purple: '#d3869b', teal: '#8ec07c', term: '#282018', termfg: '#ebdbb2' },
    ansi('#282018', '#ebdbb2', '#fe8019', 'rgba(254,128,25,.25)', ['#3c3836', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984'], ['#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2']),
  ),
  palette(
    'tokyo-night',
    'Tokyo Night',
    'dark',
    // Deep indigo with city-light blue and magenta.
    { bg: '#0e0f1c', panel: '#141628', raised: '#1b1e38', elev: '#222646', line: '#262b52', line2: '#3a4180', text: '#c0caf5', muted: '#a9b1d6', dim: '#6f78a8', accent: '#7aa2f7', accentInk: '#0e0f1c', blue: '#7dcfff', green: '#9ece6a', red: '#f7768e', purple: '#bb9af7', teal: '#73daca', term: '#11132a', termfg: '#c0caf5' },
    ansi('#11132a', '#c0caf5', '#7aa2f7', 'rgba(122,162,247,.28)', ['#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6'], ['#414868', '#ff8fa5', '#b4e38a', '#f0c585', '#95b8ff', '#cfb2ff', '#a0dcff', '#c0caf5']),
  ),
  palette(
    'catppuccin',
    'Catppuccin Mocha',
    'dark',
    // Soft pastel: mauve-grey surfaces with a peach accent.
    { bg: '#1e1e2e', panel: '#26263a', raised: '#302f47', elev: '#393852', line: '#3d3c58', line2: '#595878', text: '#cdd6f4', muted: '#bac2de', dim: '#8a8fad', accent: '#fab387', accentInk: '#1e1e2e', blue: '#89b4fa', green: '#a6e3a1', red: '#f38ba8', purple: '#cba6f7', teal: '#94e2d5', term: '#24243a', termfg: '#cdd6f4' },
    ansi('#24243a', '#cdd6f4', '#f5e0dc', 'rgba(250,179,135,.22)', ['#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de'], ['#585b70', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#a6adc8']),
  ),
  palette(
    'one-dark',
    'One Dark',
    'dark',
    // Plain charcoal with no tint, and a gold accent.
    { bg: '#1c1e22', panel: '#23262b', raised: '#2b2f35', elev: '#33373e', line: '#363a42', line2: '#4b515c', text: '#dcdfe4', muted: '#abb2bf', dim: '#7f848e', accent: '#e5c07b', accentInk: '#1c1e22', blue: '#61afef', green: '#98c379', red: '#e06c75', purple: '#c678dd', teal: '#56b6c2', term: '#23262b', termfg: '#abb2bf' },
    ansi('#23262b', '#abb2bf', '#e5c07b', 'rgba(229,192,123,.2)', ['#3f4451', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#d7dae0'], ['#4f5666', '#ff7b86', '#b1e18b', '#efcb87', '#67cdff', '#e48bff', '#63d4e0', '#e6e6e6']),
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
  palette(
    'forest',
    'Forest',
    'dark',
    // Deep pine greens with an amber accent (full colour, unlike Green Phosphor).
    { bg: '#0d1712', panel: '#12201a', raised: '#182a21', elev: '#1e3429', line: '#234031', line2: '#33604a', text: '#dce8d6', muted: '#b5c9ad', dim: '#7f9a86', accent: '#e0b252', accentInk: '#0d1712', blue: '#6aa6c4', green: '#8fc46a', red: '#e06c5a', purple: '#c48fc4', teal: '#6ac4a6', term: '#101c15', termfg: '#d6e4cf' },
    ansi('#101c15', '#d6e4cf', '#e0b252', 'rgba(224,178,82,.25)', ['#1b2e23', '#e06c5a', '#8fc46a', '#e0b252', '#6aa6c4', '#c48fc4', '#6ac4a6', '#cfdcc8'], ['#4a6654', '#f08a78', '#a8dc84', '#f0c872', '#88bcd8', '#d8a8d8', '#88dcc0', '#f0f5ec']),
  ),
  palette(
    'amber',
    'Amber CRT',
    'dark',
    // A monochrome amber terminal: every colour is a shade of orange-gold.
    { bg: '#0a0600', panel: '#110a00', raised: '#1a1000', elev: '#221500', line: '#2e1d00', line2: '#4d3200', text: '#ffb000', muted: '#e69a00', dim: '#9a6800', accent: '#ffcc33', accentInk: '#1a1000', blue: '#ffc266', green: '#ffb000', red: '#ff7a1a', purple: '#ffd699', teal: '#ffc266', term: '#0c0700', termfg: '#ffb000' },
    ansi('#0c0700', '#ffb000', '#ffcc33', 'rgba(255,176,0,.25)', ['#2a1a00', '#ff7a1a', '#ffb000', '#ffd24d', '#e69a00', '#ffa640', '#ffc266', '#ffcf80'], ['#7a4d00', '#ff9a4d', '#ffc233', '#ffe08a', '#ffb733', '#ffbf73', '#ffd699', '#ffe7bf']),
  ),
  palette(
    'high-contrast',
    'High Contrast',
    'dark',
    // Pure black and white with a yellow accent, for bright rooms and tired eyes.
    { bg: '#000000', panel: '#000000', raised: '#0d0d0d', elev: '#1a1a1a', line: '#5c5c5c', line2: '#9a9a9a', text: '#ffffff', muted: '#e6e6e6', dim: '#b3b3b3', accent: '#ffe600', accentInk: '#000000', blue: '#5cb8ff', green: '#4dff4d', red: '#ff5c5c', purple: '#ff80ff', teal: '#33ffff', term: '#000000', termfg: '#ffffff' },
    ansi('#000000', '#ffffff', '#ffe600', 'rgba(255,230,0,.35)', ['#000000', '#ff5c5c', '#4dff4d', '#ffff33', '#5c9dff', '#ff66ff', '#33ffff', '#e6e6e6'], ['#808080', '#ff8080', '#80ff80', '#ffff80', '#80b3ff', '#ff99ff', '#80ffff', '#ffffff']),
  ),
  palette(
    'paper',
    'Paper',
    'light',
    // Off-white paper, near-black ink and a burnt-orange accent.
    { bg: '#efebe2', panel: '#fbfaf6', raised: '#ffffff', elev: '#ffffff', line: '#e2dccf', line2: '#c9c0ad', text: '#1f1d1a', muted: '#4d4840', dim: '#8a8374', accent: '#c2410c', accentInk: '#ffffff', blue: '#1f5fa8', green: '#3a7d2a', red: '#b3261e', purple: '#8a3ea8', teal: '#1f7d80', term: '#fbfaf6', termfg: '#2b2925' },
    ansi('#fbfaf6', '#2b2925', '#c2410c', 'rgba(194,65,12,.18)', ['#1f1d1a', '#b3261e', '#3a7d2a', '#9a6a00', '#1f5fa8', '#8a3ea8', '#1f7d80', '#d9d3c5'], ['#6b665c', '#d1452b', '#4f9a3b', '#b78400', '#3a7bd1', '#a857c7', '#2e9a9d', '#fbfaf6']),
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
