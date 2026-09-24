import { useMemo, type MouseEvent } from 'react';
import MarkdownIt from 'markdown-it';

type MD = InstanceType<typeof MarkdownIt>;
type Token = ReturnType<MD['parse']>[number];
import { revealPath } from '../store.ts';

const EXT = 'ts|tsx|js|jsx|mjs|cjs|json|md|css|scss|html|py|go|rs|java|kt|rb|php|c|h|cc|cpp|hpp|cs|swift|sh|ya?ml|toml|sql|vue|svelte|txt|lock';
/** `src/auth/session.ts:142`, `findings-001.md`, `tests/a.test.ts` — the prototype's inline() linkifier. */
export const PATH_RE = new RegExp(`(?<![\\w/.-])((?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\\.(?:${EXT})(?::\\d+(?:[-–]\\d+)?)?)(?![\\w/])`, 'g');

const pathRefPlugin = (md: MD): void => {
  md.core.ruler.after('inline', 'pathref', (state) => {
    for (const block of state.tokens) {
      if (block.type !== 'inline' || !block.children) continue;
      const out: Token[] = [];
      let inLink = 0;
      for (const tok of block.children) {
        if (tok.type === 'link_open') inLink++;
        if (tok.type === 'link_close') inLink--;
        if (tok.type !== 'text' || inLink > 0) {
          out.push(tok);
          continue;
        }
        const text = tok.content;
        let last = 0;
        PATH_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = PATH_RE.exec(text))) {
          if (m.index > last) {
            const t = new state.Token('text', '', 0);
            t.content = text.slice(last, m.index);
            out.push(t);
          }
          const p = new state.Token('pathref', '', 0);
          p.content = m[1];
          out.push(p);
          last = m.index + m[1].length;
        }
        if (last === 0) out.push(tok);
        else if (last < text.length) {
          const t = new state.Token('text', '', 0);
          t.content = text.slice(last);
          out.push(t);
        }
      }
      block.children = out;
    }
  });
  md.renderer.rules.pathref = (tokens, idx) => {
    const c = md.utils.escapeHtml(tokens[idx].content);
    return `<button type="button" class="mdlink" data-path="${c}" title="Open in Files">${c}</button>`;
  };
  const dflt = md.renderer.rules.link_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
    return dflt(tokens, idx, options, env, self);
  };
};

// html: false — agents write these files, so raw HTML is never rendered.
const md = new MarkdownIt({ html: false, linkify: true, breaks: false }).use(pathRefPlugin);

export function renderMarkdown(src: string): string {
  return md.render(src);
}

export function Markdown({ src, className = 'md' }: { src: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(src), [src]);
  const onClick = (e: MouseEvent) => {
    const b = (e.target as HTMLElement).closest('.mdlink') as HTMLElement | null;
    if (b?.dataset.path) revealPath(b.dataset.path);
  };
  return <div className={className} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
