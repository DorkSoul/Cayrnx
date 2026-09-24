import { useEffect, useState } from 'react';
import { byType, diffLines, pad, type Change } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { del, enc, get, put } from '../api.ts';
import { closeDocTab, errToast, markViewed, openDialog, revealPath, setActive, stage, termTabsFor, toast, togglePop, useStore, type DocTab } from '../store.ts';
import { Glyph, Popover, StateChip, docTypeCls } from '../components/common.tsx';
import { Markdown } from '../components/Markdown.tsx';
import { CodeEditor } from '../components/CodeEditor.tsx';
import { cls, copyText } from '../util.ts';
import { tabLabel } from './Terminal.tsx';

function useDocText(pid: string, slug: string, file: string | null, mtime: number | undefined) {
  const [state, setState] = useState<{ key: string; text: string | null; err: string | null }>({ key: '', text: null, err: null });
  const key = `${pid}/${slug}/${file}@${mtime}`;
  useEffect(() => {
    if (!file) return;
    let alive = true;
    get<{ text: string }>(`/api/projects/${pid}/changes/${slug}/docs/${file}`).then(
      (r) => alive && setState({ key, text: r.text, err: null }),
      (e) => alive && setState({ key, text: null, err: e.message }),
    );
    return () => {
      alive = false;
    };
  }, [key, pid, slug, file]);
  return state.key === key ? state : { key, text: null, err: null };
}

/** S7 — read/edit a brief doc without leaving the main area. */
export function DocView({ d, change }: { d: DocTab; change: Change }) {
  const s = useStore();
  const pid = d.projectId;
  const type = d.type!;
  const vs = byType(change.docs)[type] || [];
  const latest = vs[vs.length - 1];
  const cur = vs.find((v) => v.n === d.n) || latest;
  const idx = cur ? vs.indexOf(cur) : -1;
  const prev = idx > 0 ? vs[idx - 1] : null;
  const [mode, setMode] = useState<'view' | 'diff' | 'edit'>('view');
  // "Diff since last read" (spec §14 tagged option): the newest older version you had viewed,
  // captured before opening this one marks it read.
  const [lastRead] = useState(() => {
    const v = useStore.getState().viewed[pid] || {};
    const opened = vs.find((x) => x.n === d.n) || vs[vs.length - 1];
    const older = vs.filter((x) => opened && x.n < opened.n && (v[`${change.slug}/${x.type}-${pad(x.n)}`] ?? -1) >= x.mtime);
    return older.length ? older[older.length - 1].n : null;
  });
  const [diffFrom, setDiffFrom] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const doc = useDocText(pid, change.slug, cur?.file || null, cur?.mtime);
  const base = diffFrom !== null ? vs.find((x) => x.n === diffFrom) || prev : prev;
  const prevDoc = useDocText(pid, change.slug, mode === 'diff' && base ? base.file : null, base?.mtime);
  useEffect(() => {
    if (cur && doc.text !== null) void markViewed(pid, change.slug, cur);
  }, [pid, change.slug, cur, doc.text]);
  useEffect(() => setMode((m) => (m === 'edit' ? m : 'view')), [cur?.n]);
  if (!cur) {
    return (
      <div className="docview">
        <div className="empty">
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No {type} docs in {change.slug}</div>
          <button className="btn" onClick={() => closeDocTab(d.id)}>
            Close tab
          </button>
        </div>
      </div>
    );
  }
  const go = (n: number) => useStore.setState((st) => ({ docTabs: st.docTabs.map((x) => (x.id === d.id ? { ...x, n } : x)) }));
  const fileBase = `${type}-${pad(cur.n)}`;
  const path = `briefs/${change.slug}/${cur.file}`;
  const writing = Object.values(s.tabs).some((t) => t.projectId === pid && t.change === change.slug && t.pendingWrite?.startsWith(type + '-'));
  const termTabs = termTabsFor(s, pid, change.slug).filter((t) => t.kind === 'term');
  const save = async () => {
    setSaving(true);
    try {
      await put(`/api/projects/${pid}/changes/${change.slug}/docs/${cur.file}`, { text: draft });
      toast(`${fileBase} saved`, 'ok');
      setMode('view');
    } catch (e) {
      errToast(e);
    } finally {
      setSaving(false);
    }
  };
  const diff = mode === 'diff' && prevDoc.text !== null && doc.text !== null ? diffLines(prevDoc.text, doc.text) : [];
  return (
    <div className="docview">
      <div className="dochead" style={{ flexWrap: s.isMobile ? 'wrap' : 'nowrap' }}>
        <Icon d={I.file} size={18} cls={docTypeCls(type)} />
        <span className="mono" style={{ fontWeight: 600, fontSize: 14 }}>
          {fileBase}
        </span>
        <span className="tchip tc-custom" style={{ color: 'var(--muted)', background: 'var(--hover)' }}>
          {type}
        </span>
        {!s.isMobile && (
          <span className="mono dim ell" style={{ fontSize: 11.5 }}>
            briefs/{change.slug}/
          </span>
        )}
        {writing && (
          <span className="writing">
            <span className="stc st-busy" />
            agent writing…
          </span>
        )}
        <div className="row" style={{ gap: 2, marginLeft: 8, border: '1px solid var(--line2)', borderRadius: 8, padding: 2 }}>
          <button className="ibtn sm" onClick={() => prev && go(prev.n)} disabled={!prev} aria-label="Previous version">
            <Icon d={I.left} size={13} />
          </button>
          <span style={{ fontSize: 12, padding: '0 6px' }} className={cur === latest ? '' : 'dim'}>
            {cur === latest ? `current of ${vs.length} version${vs.length > 1 ? 's' : ''}` : `${pad(cur.n)} of ${vs.length} · history`}
          </span>
          <button className="ibtn sm" onClick={() => idx < vs.length - 1 && go(vs[idx + 1].n)} disabled={idx >= vs.length - 1} aria-label="Next version">
            <Icon d={I.right} size={13} />
          </button>
        </div>
        <div className="grow" />
        {mode !== 'edit' && (
          <>
            <button className="btn sm" onClick={() => (setDraft(doc.text || ''), setMode('edit'))} disabled={doc.text === null}>
              <Icon d={I.pencil} size={13} />
              Edit
            </button>
            <button className={cls('btn sm', mode === 'diff' && diffFrom === null && 'on')} onClick={() => (setDiffFrom(null), setMode(mode === 'diff' && diffFrom === null ? 'view' : 'diff'))} disabled={!prev} title={prev ? `Diff ${prev.file} → ${cur.file}` : 'No previous version'}>
              <Icon d={I.diff} size={13} />
              Diff vs previous
            </button>
            {lastRead !== null && prev && lastRead < prev.n && cur === latest && (
              <button className={cls('btn sm', mode === 'diff' && diffFrom !== null && 'on')} onClick={() => (setDiffFrom(lastRead), setMode(mode === 'diff' && diffFrom !== null ? 'view' : 'diff'))} title={`Diff ${type}-${pad(lastRead)} (the last one you read) → ${cur.file}`} data-testid="diff-since-read">
                Since last read ({pad(lastRead)})
              </button>
            )}
            <div className="rel">
              <button className="btn sm primary" onClick={() => togglePop('stagetab')}>
                <Icon d={I.read} size={13} />
                Stage in tab
                <Icon d={I.down} size={12} />
              </button>
              {s.pop === 'stagetab' && (
                <Popover title={`Stage "Read ${cur.file}" in…`} className="menu" style={{ right: 0, top: 32, width: 290 }}>
                  <div className="mlabel">Stage "Read {cur.file}" in…</div>
                  {termTabs.map((t) => (
                    <button
                      key={t.id}
                      className="mi"
                      onClick={() => {
                        stage(t.id, `Read from briefs/${change.slug}/: ${cur.file}.`, 1);
                        setActive(t.id);
                        toast(`Staged in ${t.spec.role || t.spec.service} — press Send when ready`, 'info');
                      }}
                    >
                      <Glyph service={t.spec.service} />
                      <span className="grow ell">{tabLabel(t)}</span>
                      <StateChip chip={t.chip} />
                    </button>
                  ))}
                  {!termTabs.length && <div className="dim" style={{ padding: 8, fontSize: 12 }}>No terminal tabs in this change.</div>}
                </Popover>
              )}
            </div>
            <button className="ibtn" onClick={() => void copyText(path).then(() => toast(`Copied ${path}`, 'ok'))} aria-label="Copy path" title="Copy path">
              <Icon d={I.copy} size={15} />
            </button>
            <div className="rel">
              <button className="ibtn" onClick={() => togglePop('docmore')} aria-label="More" title="More">
                <Icon d={I.more} size={15} fat />
              </button>
              {s.pop === 'docmore' && (
                <Popover title={fileBase} className="menu" style={{ right: 0, top: 34, width: 220 }}>
                  <button className="mi" onClick={() => revealPath(path)}>
                    <Icon d={I.files} />
                    Open in Files
                  </button>
                  <div className="msep" />
                  <button
                    className="mi danger"
                    disabled={cur !== latest}
                    title={cur !== latest ? 'Only the latest version can be deleted' : ''}
                    onClick={() =>
                      openDialog({
                        kind: 'confirm',
                        title: `Delete ${cur.file}?`,
                        body: `Deletes briefs/${change.slug}/${cur.file}. Briefs aren't in git — this can't be undone.`,
                        confirm: 'Delete file',
                        danger: true,
                        run: async () => {
                          await del(`/api/projects/${pid}/changes/${change.slug}/docs/${cur.file}`);
                          if (prev) go(prev.n);
                          else closeDocTab(d.id);
                          toast(`Deleted ${cur.file}`, 'info');
                        },
                      })
                    }
                  >
                    <Icon d={I.trash} />
                    Delete latest…
                  </button>
                </Popover>
              )}
            </div>
          </>
        )}
      </div>
      <div className="docbody">
        {doc.err && <div className="warnrow">{doc.err}</div>}
        {mode === 'view' && doc.text !== null && <Markdown src={doc.text} />}
        {mode === 'diff' && (
          <div className="md">
            <div className="row dim" style={{ gap: 8, fontSize: 12, marginBottom: 12 }}>
              <span className="mono">{base ? `${type}-${pad(base.n)}` : ''}</span>→<span className="mono">{fileBase}</span>
              <span className="grow" />
              <span style={{ color: 'var(--green)' }}>+{diff.filter((l) => l.cls === 'add').length}</span>
              <span style={{ color: 'var(--red)' }}>−{diff.filter((l) => l.cls === 'del').length}</span>
            </div>
            {diff.map((l, i) => (
              <div key={i} className={`diffl ${l.cls}`}>
                {l.sign} {l.text}
              </div>
            ))}
          </div>
        )}
        {mode === 'edit' && (
          <div className="md" style={{ maxWidth: 860 }}>
            <CodeEditor value={draft} onChange={setDraft} onSave={() => void save()} label={`Edit ${cur.file}`} />
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <span className="dim grow" style={{ fontSize: 12 }}>
                Saving overwrites {cur.file} in place (no new version). <span className="kbd">Ctrl/⌘ S</span>
              </span>
              <button className="btn" onClick={() => setMode('view')}>
                Cancel
              </button>
              <button className="btn primary" onClick={() => void save()} disabled={saving}>
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Read-only view of any text file opened from the Files panel. */
export function FileView({ d }: { d: DocTab }) {
  const [state, setState] = useState<{ text: string | null; err: string | null }>({ text: null, err: null });
  const root = useStore((s) => s.projects.find((p) => p.id === d.projectId)?.path || '');
  useEffect(() => {
    let alive = true;
    setState({ text: null, err: null });
    get<{ text: string }>(`/api/projects/${d.projectId}/file?path=${enc(d.path || '')}`).then(
      (r) => alive && setState({ text: r.text, err: null }),
      (e) => alive && setState({ text: null, err: e.message }),
    );
    return () => {
      alive = false;
    };
  }, [d.projectId, d.path]);
  const rel = d.path && root && d.path.startsWith(root + '/') ? d.path.slice(root.length + 1) : d.path || '';
  const isMd = /\.md$/i.test(d.path || '');
  return (
    <div className="docview">
      <div className="dochead">
        <Icon d={I.file} size={18} cls="fx-md" />
        <span className="mono ell" style={{ fontWeight: 600, fontSize: 13.5 }}>
          {rel}
        </span>
        <span className="pill">read-only</span>
        <div className="grow" />
        <button className="ibtn" onClick={() => void copyText(d.path || '').then(() => toast(`Copied ${d.path}`, 'ok'))} aria-label="Copy path" title="Copy path">
          <Icon d={I.copy} size={15} />
        </button>
        <button className="ibtn" onClick={() => revealPath(rel)} aria-label="Reveal in Files" title="Reveal in Files">
          <Icon d={I.files} size={15} />
        </button>
      </div>
      <div className="docbody">
        {state.err && <div className="warnrow">{state.err}</div>}
        {state.text !== null && (isMd ? <Markdown src={state.text} /> : <pre className="plainfile">{state.text}</pre>)}
      </div>
    </div>
  );
}

interface Commit {
  sha: string;
  at: number;
  author: string;
  subject: string;
}

/** "Reveal in git" (S1): a file's commits; expand one to see its change to the file. */
export function GitHistoryView({ d }: { d: DocTab }) {
  const [log, setLog] = useState<Commit[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, string>>({});
  const root = useStore((s) => s.projects.find((p) => p.id === d.projectId)?.path || '');
  useEffect(() => {
    get<Commit[]>(`/api/projects/${d.projectId}/git-log?path=${enc(d.path || '')}`).then(setLog, (e) => setErr(e.message));
  }, [d.projectId, d.path]);
  const toggle = async (sha: string) => {
    if (open[sha] !== undefined) {
      const next = { ...open };
      delete next[sha];
      return setOpen(next);
    }
    try {
      const r = await get<{ text: string }>(`/api/projects/${d.projectId}/git-log?path=${enc(d.path || '')}&sha=${sha}`);
      setOpen((o) => ({ ...o, [sha]: r.text }));
    } catch (e) {
      errToast(e);
    }
  };
  const rel = d.path && root && d.path.startsWith(root + '/') ? d.path.slice(root.length + 1) : d.path || '';
  const lineCls = (l: string) => (l.startsWith('+') && !l.startsWith('+++') ? 'add' : l.startsWith('-') && !l.startsWith('---') ? 'del' : 'ctx');
  return (
    <div className="docview">
      <div className="dochead">
        <Icon d={I.branch} size={18} cls="dim" />
        <span className="mono ell" style={{ fontWeight: 600, fontSize: 13.5 }}>
          {rel}
        </span>
        <span className="pill">git history</span>
        <div className="grow" />
        <button className="ibtn" onClick={() => revealPath(rel)} aria-label="Reveal in Files" title="Reveal in Files">
          <Icon d={I.files} size={15} />
        </button>
      </div>
      <div className="docbody">
        <div className="md" style={{ maxWidth: 900 }}>
          {err && <div className="warnrow">{err}</div>}
          {!log && !err && <div className="dim">Loading…</div>}
          {log && !log.length && <div className="dim">No commits touch this file yet (it may be untracked).</div>}
          {log?.map((c) => (
            <div key={c.sha} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
              <button className="row" style={{ gap: 10, width: '100%' }} onClick={() => void toggle(c.sha)}>
                <Icon d={I.right} size={12} cls={cls('chev', open[c.sha] !== undefined && 'open')} />
                <span className="mono dim">{c.sha}</span>
                <span className="grow ell" style={{ fontWeight: 500 }}>
                  {c.subject}
                </span>
                <span className="dim nowrap" style={{ fontSize: 12 }}>
                  {c.author} · {new Date(c.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </button>
              {open[c.sha] !== undefined && (
                <div style={{ marginTop: 8 }}>
                  {open[c.sha]
                    .split('\n')
                    .slice(4)
                    .map((l, i) => (
                      <div key={i} className={`diffl ${lineCls(l)}`} style={{ textDecoration: 'none' }}>
                        {l || ' '}
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
