import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GitFileDiff } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { enc, get } from '../api.ts';
import { openFile, useStore, type DocTab } from '../store.ts';
import { cls } from '../util.ts';

// A file's uncommitted diff, drawn like VS Code's diff editor: side by side (or inline), with
// line numbers on both sides, from git's own unified diff.

interface DLine {
  kind: 'ctx' | 'add' | 'del';
  old: number | null;
  new: number | null;
  text: string;
  /** "\ No newline at end of file" follows this line. */
  noNl?: boolean;
}

interface Hunk {
  head: string;
  lines: DLine[];
}

export function parseUnified(text: string): Hunk[] {
  const hunks: Hunk[] = [];
  let h: Hunk | null = null;
  let o = 0;
  let n = 0;
  for (const raw of text.split('\n')) {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(raw);
    if (m) {
      h = { head: m[3].trim(), lines: [] };
      hunks.push(h);
      o = Number(m[1]);
      n = Number(m[2]);
      continue;
    }
    if (!h) continue; // file header (diff --git, index, ---, +++)
    const c = raw[0];
    const body = raw.slice(1);
    if (c === ' ') h.lines.push({ kind: 'ctx', old: o++, new: n++, text: body });
    else if (c === '-') h.lines.push({ kind: 'del', old: o++, new: null, text: body });
    else if (c === '+') h.lines.push({ kind: 'add', old: null, new: n++, text: body });
    else if (c === '\\') {
      const last = h.lines[h.lines.length - 1];
      if (last) last.noNl = true;
    }
  }
  return hunks;
}

/** Side-by-side rows: a run of removals next to the run of additions that replaces it. */
function splitRows(lines: DLine[]): [DLine | null, DLine | null][] {
  const rows: [DLine | null, DLine | null][] = [];
  for (let i = 0; i < lines.length; ) {
    if (lines[i].kind === 'ctx') {
      rows.push([lines[i], lines[i]]);
      i++;
      continue;
    }
    const dels: DLine[] = [];
    const adds: DLine[] = [];
    while (i < lines.length && lines[i].kind === 'del') dels.push(lines[i++]);
    while (i < lines.length && lines[i].kind === 'add') adds.push(lines[i++]);
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push([dels[k] || null, adds[k] || null]);
  }
  return rows;
}

const PREF = 'cayrnx.diff.v1';
function loadPref(): { split: boolean; full: boolean } {
  try {
    return { split: true, full: false, ...JSON.parse(localStorage.getItem(PREF) || '{}') };
  } catch {
    return { split: true, full: false };
  }
}
function savePref(p: { split: boolean; full: boolean }) {
  try {
    localStorage.setItem(PREF, JSON.stringify(p));
  } catch {
    /* private mode */
  }
}

const Txt = ({ l }: { l: DLine }) => (
  <>
    {l.text || ' '}
    {l.noNl && <span className="gdnonl" title="No newline at end of file">⏎̸</span>}
  </>
);

export function GitDiffView({ d }: { d: DocTab }) {
  const mobile = useStore((s) => s.isMobile);
  const activity = useStore((s) => (d.change ? (s.changes[d.projectId] || []).find((c) => c.slug === d.change)?.activity : undefined));
  const [pref, setPref] = useState(loadPref);
  const [data, setData] = useState<GitFileDiff | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const split = pref.split && !mobile;
  const load = useCallback(async () => {
    try {
      setData(await get<GitFileDiff>(`/api/projects/${d.projectId}/git-diff?root=${enc(d.root || '')}&path=${enc(d.path || '')}&staged=${d.staged ? 1 : 0}&full=${pref.full ? 1 : 0}`));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [d.projectId, d.root, d.path, d.staged, pref.full]);
  useEffect(() => {
    void load();
    const f = () => void load();
    window.addEventListener('focus', f);
    return () => window.removeEventListener('focus', f);
  }, [load, activity]);
  const set = (p: Partial<typeof pref>) => {
    const next = { ...pref, ...p };
    setPref(next);
    savePref(next);
  };
  const hunks = useMemo(() => (data ? parseUnified(data.text) : []), [data]);
  const adds = hunks.reduce((n, h) => n + h.lines.filter((l) => l.kind === 'add').length, 0);
  const dels = hunks.reduce((n, h) => n + h.lines.filter((l) => l.kind === 'del').length, 0);
  const untracked = !!data && /^--- \/dev\/null$/m.test(data.text) && !d.staged;

  return (
    <div className="docview">
      <div className="dochead" style={{ flexWrap: 'wrap', rowGap: 6 }}>
        <Icon d={I.diff} size={18} cls="dim" />
        <span className="mono ell" style={{ fontWeight: 600, fontSize: 13.5 }} title={d.path}>
          {d.path}
        </span>
        <span className="pill">{d.staged ? 'staged' : untracked ? 'new file' : 'not staged'}</span>
        {data && !data.binary && (
          <span className="mono" style={{ fontSize: 12 }}>
            <span className="gcn add">+{adds}</span> <span className="gcn del">−{dels}</span>
          </span>
        )}
        <div className="grow" />
        {!mobile && (
          <div className="seg" role="group" aria-label="Diff layout">
            <button className={cls(split && 'on')} onClick={() => set({ split: true })} data-testid="diff-split">
              Side by side
            </button>
            <button className={cls(!split && 'on')} onClick={() => set({ split: false })} data-testid="diff-inline">
              Inline
            </button>
          </div>
        )}
        <div className="seg">
          <button className={cls(pref.full && 'on')} onClick={() => set({ full: !pref.full })} aria-pressed={pref.full} title="Show the whole file, not just the changed parts" data-testid="diff-full">
            Whole file
          </button>
        </div>
        <button className="ibtn" onClick={() => void load()} aria-label="Refresh" title="Refresh">
          <Icon d={I.refresh} size={15} />
        </button>
        {data && (
          <button className="ibtn" onClick={() => openFile(`${data.top}/${d.path}`)} aria-label="Open file" title="Open the file">
            <Icon d={I.file} size={15} />
          </button>
        )}
      </div>
      <div className="docbody gdbody">
        {err && <div className="warnrow">{err} — it may have been committed or reverted. Pick it again in Changes.</div>}
        {!data && !err && <div className="dim">Loading…</div>}
        {data?.binary && <div className="dim">Binary file — no text diff.</div>}
        {data && !data.binary && !hunks.length && <div className="dim">No line changes (only the file mode or name changed).</div>}
        {data?.truncated && <div className="warnrow">The diff is over 1 MB; only the start is shown.</div>}
        {hunks.length > 0 && (
          <div className={cls('gd', split ? 'split' : 'inline')} data-testid="git-diff">
            {hunks.map((h, hi) => (
              <div key={hi} className="gdhunk">
                {(!pref.full || hunks.length > 1) && <div className="gdhead">{`Line ${h.lines.find((l) => l.new !== null)?.new ?? h.lines[0]?.old ?? ''}${h.head ? ` · ${h.head}` : ''}`}</div>}
                {split
                  ? splitRows(h.lines).map(([a, b], i) => (
                      <div key={i} className="gdrow">
                        <span className="gdn">{a?.old ?? ''}</span>
                        <span className={cls('gdt', a ? (a.kind === 'del' ? 'del' : '') : 'gap')}>{a && <Txt l={a} />}</span>
                        <span className="gdn">{b?.new ?? ''}</span>
                        <span className={cls('gdt', b ? (b.kind === 'add' ? 'add' : '') : 'gap')}>{b && <Txt l={b} />}</span>
                      </div>
                    ))
                  : h.lines.map((l, i) => (
                      <div key={i} className="gdrow">
                        <span className="gdn">{l.old ?? ''}</span>
                        <span className="gdn">{l.new ?? ''}</span>
                        <span className={cls('gdt', l.kind !== 'ctx' && l.kind)}>
                          <span className="gdsign">{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}</span>
                          <Txt l={l} />
                        </span>
                      </div>
                    ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
