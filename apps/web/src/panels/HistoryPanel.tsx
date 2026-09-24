import { useEffect, useState } from 'react';
import { ADAPTERS, spec as mkSpec, type SessionRow, type ServiceId, type TabStatus } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { get, post } from '../api.ts';
import { archiveChange, changesOf, curKey, errToast, formatTokens, selectChange, setActive, showPanel, toast, useStore, WORKSPACE } from '../store.ts';
import { Dots, Empty, Glyph, Seg, TypeChip } from '../components/common.tsx';
import { cls, copyText, relTime } from '../util.ts';

type Row = SessionRow & { resume: string | null };

/** S3 — sessions found in each CLI's own store, for this project's folders. */
function SessionBrowser() {
  const s = useStore();
  const pid = s.projectId;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | ServiceId>('all');
  const load = () => {
    if (!pid) return;
    setRows(null);
    setErr(null);
    get<Row[]>(`/api/projects/${pid}/sessions`).then(setRows, (e) => setErr(e.message));
  };
  useEffect(load, [pid]);
  const open = async (r: Row) => {
    if (!pid) return;
    try {
      const key = curKey(s);
      const t = await post<TabStatus>('/api/tabs', {
        projectId: pid,
        change: key && key !== WORKSPACE ? key : null,
        spec: mkSpec({ service: r.service, role: 'resumed' }),
        cwd: r.cwd || undefined,
        resume: r.id,
      });
      useStore.setState((st) => ({ tabs: { ...st.tabs, [t.id]: t } }));
      if (!key) selectChange(WORKSPACE);
      setActive(t.id);
      toast(`Resuming ${ADAPTERS[r.service].name} session in a new tab`, 'ok');
    } catch (e) {
      errToast(e);
    }
  };
  const shown = (rows || []).filter((r) => filter === 'all' || r.service === filter);
  return (
    <>
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        <Seg
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'opencode', label: 'OpenCode' },
            { value: 'codex', label: 'Codex' },
            { value: 'claude', label: 'Claude' },
          ]}
        />
        <span className="grow" />
        <button className="ibtn sm" onClick={load} aria-label="Rescan" title="Rescan the CLI stores">
          <Icon d={I.refresh} size={14} />
        </button>
      </div>
      {!rows && !err && (
        <div className="row dim" style={{ gap: 8, padding: '10px 6px', fontSize: 12 }}>
          <span className="stc st-busy" />
          Scanning transcript stores… parse in progress
        </div>
      )}
      {err && <div className="warnrow">{err}</div>}
      {rows && !shown.length && <div className="dim" style={{ padding: '12px 6px', fontSize: 12 }}>No sessions for this project's folders yet.</div>}
      {shown.map((r) => (
        <div key={r.file} className={cls('sessrow', r.bad && 'unrec')} data-testid={`sess-${r.service}`}>
          <Glyph service={r.service} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 6 }}>
              <span style={{ fontWeight: 500 }} className="ell">
                {r.model || r.service}
              </span>
              <span className="dim nowrap" style={{ fontSize: 11.5 }}>
                {relTime(r.updated)}
              </span>
              <span className="dim grow nowrap" style={{ fontSize: 11.5, textAlign: 'right' }}>
                {r.tokens !== null ? `${formatTokens(r.tokens)} tok` : ''}
              </span>
            </div>
            {r.title && (
              <div className="ell" style={{ fontSize: 12, marginTop: 2 }} title={r.title}>
                {r.title}
              </div>
            )}
            <div className="mono dim ell" style={{ fontSize: 11, marginTop: 3 }} title={r.cwd || r.file}>
              {r.cwd || r.file}
            </div>
            {r.bad ? (
              <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>
                unrecognized format — skipped ({r.bad})
              </div>
            ) : (
              <div className="row" style={{ gap: 6, marginTop: 7 }}>
                <button className="pill" onClick={() => void copyText(r.id).then(() => toast(`Copied session id ${r.id}`, 'ok'))} title="Copy session id">
                  <span>{r.id.length > 13 ? r.id.slice(0, 13) + '…' : r.id}</span>
                  <Icon d={I.copy} size={11} style={{ marginLeft: 4 }} />
                </button>
                <span className="grow" />
                <button className="ibtn sm" onClick={() => r.resume && void copyText(r.resume).then(() => toast(`Copied: ${r.resume}`, 'ok'))} title={`Copy resume command: ${r.resume}`} aria-label="Copy resume command">
                  <Icon d={I.code} size={14} />
                </button>
                <button className="btn sm" onClick={() => void open(r)} data-testid="sess-open">
                  Open in tab
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

export function HistoryPanel({ mobile }: { mobile?: boolean }) {
  const s = useStore();
  const [seg, setSeg] = useState<'changes' | 'sessions'>('changes');
  const changes = [...changesOf(s, s.projectId)].sort((a, b) => (b.meta.created || '').localeCompare(a.meta.created || ''));
  return (
    <>
      {!mobile && (
        <div className="phead">
          <div className="ptitle">History</div>
        </div>
      )}
      <div style={{ padding: mobile ? '0 0 10px' : '10px 10px 0' }}>
        <Seg
          full
          value={seg}
          onChange={setSeg}
          options={[
            { value: 'changes', label: 'Changes' },
            { value: 'sessions', label: 'CLI sessions' },
          ]}
        />
      </div>
      <div className="pbody">
        {seg === 'changes' && (
          <>
            {!changes.length && <Empty icon={I.history} title="No changes yet">Every change you create shows up here, archived or not.</Empty>}
            {changes.map((c) => (
              <div className="hrow" key={c.slug}>
                <div className="row" style={{ gap: 7 }}>
                  <TypeChip type={c.meta.type} />
                  <span className="cname grow">{c.meta.name}</span>
                  <Dots docs={c.docs} />
                </div>
                <div className="row" style={{ gap: 8, marginTop: 6, fontSize: 11.5 }}>
                  <span className="dim nowrap">opened {c.meta.created ? new Date(c.meta.created).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—'}</span>
                  <span className="mono dim ell grow" title={c.meta.worktree?.branch || 'main checkout'}>
                    {c.meta.worktree?.branch || 'main checkout'}
                  </span>
                  {c.meta.archived && <span className="pill">archived</span>}
                </div>
                <div className="row" style={{ gap: 6, marginTop: 8 }}>
                  {c.meta.archived && (
                    <button className="btn sm" onClick={() => void archiveChange(c.slug, false)}>
                      Reopen
                    </button>
                  )}
                  <button
                    className="btn sm ghost"
                    onClick={() => {
                      if (!c.meta.archived) selectChange(c.slug);
                      showPanel('briefs');
                    }}
                  >
                    <Icon d={I.files} size={13} />
                    Open brief folder
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
        {seg === 'sessions' && <SessionBrowser />}
      </div>
    </>
  );
}
