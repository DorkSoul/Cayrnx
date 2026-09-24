import type { DocMode } from './types.ts';
import { docFile, pad } from './version.ts';

/**
 * What each built-in doc should contain. Distilled from how practitioners run agent work through
 * markdown artifacts: research → plan → implement with a fresh context per phase (HumanLayer's
 * RPI, Anthropic's explore → plan → code → commit, Harper Reed's spec/plan/todo, Addy Osmani's
 * spec guidance). Editable per doc type in Setups → Doc types.
 */
export const DOC_GUIDES: Record<string, string> = {
  brief:
    'Cover the goal and why it matters, acceptance criteria that can be checked, what is out of scope, and boundaries: what to always do, what to ask about first, what never to touch.',
  findings:
    'Document what the code does today, with path:line evidence for each point: the question, what you found, and what is still unknown. Facts only: no fixes or recommendations (the plan decides).',
  plan:
    "Give the approach, then phases in order, each with the files to change (path:line) and success criteria split into automated checks (exact commands) and manual checks. Add a 'Not doing' list. No open questions: resolve them first, or stop and ask me.",
  code:
    'Say what changed in each plan phase (path:line), how you verified it (the commands you ran and their results), and any deviation from the plan and why. List anything left undone.',
  review:
    "Start with a verdict (approve / changes needed). List issues by severity with path:line, then check the result against the brief's acceptance criteria and the plan's success criteria, naming any that aren't met.",
};

/** The guidance a doc type's Write carries: its own (editable) text, else the built-in default. */
export function docGuide(dt: { slug: string; guide?: string }): string {
  return (dt.guide ?? DOC_GUIDES[dt.slug] ?? '').trim();
}

/**
 * Default Write message (Settings → Briefs). Placeholders: {{file}} (briefs/<change>/<doc>.md),
 * {{doc}}, {{type}}, {{slug}}, {{what}} (complete document / delta phrase), {{guide}} (the doc
 * type's guidance). Written for a fresh session: each doc is the hand-off between phases.
 */
export const DEFAULT_WRITE_TEMPLATE =
  "Create {{file}} as {{what}}. Write it for a fresh session that hasn't seen this chat. {{guide}} Keep it short: cite path:line instead of pasting code, and mark anything you didn't verify. If the file already exists, stop and don't overwrite it.";

/** Default Read message (Settings → Briefs). Placeholders: {{slug}}, {{files}}. */
export const DEFAULT_READ_TEMPLATE =
  "Read from briefs/{{slug}}/: {{files}}. They're this change's working docs: treat them as the current state, and tell me where the code disagrees with them before acting.";

const fillPlaceholders = (tpl: string, vals: Record<string, string>) =>
  tpl
    .replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in vals ? vals[k] : m))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;:])/g, '$1')
    .trim();

/**
 * The exact Write instruction (spec S12). The client preview and the server send both call this,
 * so what the user reads in the popover is byte-identical to what reaches the PTY.
 */
export function writeMsg(o: { slug: string; type: string; mode: DocMode; next: number; guide?: string; template?: string }): string {
  const doc = `${o.type}-${pad(o.next)}`;
  const prev = o.next > 1 ? `${o.type}-${pad(o.next - 1)}` : null;
  const what =
    o.mode === 'delta'
      ? `a delta${prev ? ` against ${prev}` : ''}: only what changed since then`
      : `a complete, self-contained document${prev ? ` (supersedes ${prev})` : ''}`;
  return fillPlaceholders(o.template?.trim() || DEFAULT_WRITE_TEMPLATE, {
    file: `briefs/${o.slug}/${docFile(o.type, o.next)}`,
    doc,
    type: o.type,
    slug: o.slug,
    what,
    guide: o.guide ?? DOC_GUIDES[o.type] ?? '',
  });
}

/** The Read staging message (spec S11). Never sent by Cayrnx on its own. */
export function readMsg(o: { slug: string; files: string[]; customPath?: string; allLatest?: boolean; template?: string }): string {
  let s = o.files.length ? fillPlaceholders(o.template?.trim() || DEFAULT_READ_TEMPLATE, { slug: o.slug, files: o.files.join(', ') }) : '';
  const cp = (o.customPath || '').trim();
  if (cp) s += (s ? ' ' : '') + `Also read ${cp}.`;
  if (o.files.length && o.allLatest) s += ' (latest versions only.)';
  return s;
}

/** Seed staged in each new tab when "stage Read brief-001" is ticked in New Change. */
export function seedReadMsg(slug: string): string {
  return `Read briefs/${slug}/brief-001.md first.`;
}

/**
 * Fill a change type's brief-001 template. Unknown placeholders become `[fill in]`.
 * `brief` is what the change is about, as typed in New change (the bug, the story, the ask). It
 * goes where the template says `{{brief}}`, else as a "## Request" section before the first heading.
 */
export function fillBriefTemplate(tpl: string, o: { name: string; branch: string; type: string; date: string; brief?: string }): string {
  const text = (o.brief || '').replace(/\r\n/g, '\n').trim();
  let t = tpl;
  if (t.includes('{{brief}}')) t = text ? t.replace(/\{\{brief\}\}/g, () => text) : t.replace(/^##[^\n]*\n\{\{brief\}\}\n*/m, '').replace(/\{\{brief\}\}/g, '');
  else if (text) {
    const section = `## Request\n${text}\n\n`;
    const at = t.search(/^## /m);
    t = at >= 0 ? t.slice(0, at) + section + t.slice(at) : `${t.replace(/\n*$/, '')}\n\n${section}`;
  }
  // The request is the user's own words: keep any {{x}} in it from being filled.
  const parts = text ? t.split(text) : [t];
  return parts.map((part) => part
    .replace(/\{\{name\}\}/g, o.name.replace(/-/g, ' '))
    .replace(/\{\{branch\}\}/g, o.branch)
    .replace(/\{\{type\}\}/g, o.type)
    .replace(/\{\{date\}\}/g, o.date)
    .replace(/\{\{[a-z]+\}\}/g, '[fill in]')).join(text);
}

/** `{{change}}` in a seed prompt → the change slug. */
export function fillSeed(seed: string, slug: string): string {
  return seed.replace(/\{\{change\}\}/g, slug);
}
