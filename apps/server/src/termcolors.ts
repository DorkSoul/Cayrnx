import type { TermColors } from '@cayrnx/shared';

// Answering the CLIs' colour queries (OSC 4 palette, OSC 10/11/12 foreground/background/cursor)
// on the server, from the colours the browser renders with. OpenCode's "system" theme and other
// palette-aware TUIs build their look from these answers — and they get one even when no browser
// is attached. The queries are removed from the stream so an attached xterm.js doesn't answer twice.

const HEX = /^#[0-9a-f]{6}$/i;

export function validColors(c: unknown): c is TermColors {
  const x = c as TermColors;
  return !!x && (x.mode === 'dark' || x.mode === 'light') && HEX.test(x.bg) && HEX.test(x.fg) && HEX.test(x.cursor) && Array.isArray(x.ansi) && x.ansi.length === 16 && x.ansi.every((a) => HEX.test(a));
}

/** xterm's 256-colour table: the 16 themed colours, a 6×6×6 cube, then 24 greys. */
export function paletteColor(c: TermColors, i: number): string | null {
  if (i < 0 || i > 255 || !Number.isInteger(i)) return null;
  if (i < 16) return c.ansi[i];
  const h = (v: number) => v.toString(16).padStart(2, '0');
  if (i < 232) {
    const n = i - 16;
    const lv = (v: number) => (v ? 55 + v * 40 : 0);
    return `#${h(lv(Math.floor(n / 36)))}${h(lv(Math.floor(n / 6) % 6))}${h(lv(n % 6))}`;
  }
  const g = 8 + (i - 232) * 10;
  return `#${h(g)}${h(g)}${h(g)}`;
}

/** `#rrggbb` → the X11 `rgb:rrrr/gggg/bbbb` form terminals reply with. */
export const x11 = (hex: string) => {
  const p = (o: number) => hex.slice(o, o + 2).repeat(2);
  return `rgb:${p(1)}/${p(3)}/${p(5)}`;
};

const QUERY = /\x1b\](4|10|11|12);([^\x07\x1b]*)(\x07|\x1b\\)/g;
/** A colour query that may still be arriving (its terminator is in the next chunk). */
const PARTIAL = /\x1b(?:\](?:(?:4|1[0-2])(?:;[^\x07\x1b]*\x1b?)?|1)?)?$/;

export interface OscState {
  carry: string;
}

/**
 * Remove the colour queries from `data` and return the replies to write back to the CLI.
 * Colour *sets* (no `?`) pass through untouched.
 */
export function answerColorQueries(data: string, colors: TermColors, st: OscState): { out: string; reply: string } {
  let d = st.carry + data;
  st.carry = '';
  const m = PARTIAL.exec(d);
  if (m && m[0].length <= 256) {
    st.carry = m[0];
    d = d.slice(0, m.index);
  }
  let reply = '';
  const out = d.replace(QUERY, (all, code: string, body: string, end: string) => {
    if (!body.includes('?')) return all;
    if (code === '4') {
      const parts = body.split(';');
      for (let i = 0; i + 1 < parts.length; i += 2) {
        if (parts[i + 1] !== '?') continue;
        const col = paletteColor(colors, Number(parts[i]));
        if (col) reply += `\x1b]4;${parts[i]};${x11(col)}${end}`;
      }
      return '';
    }
    // OSC 10;? may chain: `10;?;?` asks for 10 and then 11.
    let n = Number(code);
    for (const q of body.split(';')) {
      if (q === '?') {
        const col = n === 10 ? colors.fg : n === 11 ? colors.bg : n === 12 ? colors.cursor : null;
        if (col) reply += `\x1b]${n};${x11(col)}${end}`;
      }
      n++;
    }
    return '';
  });
  return { out, reply };
}
