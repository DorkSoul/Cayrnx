import { useState, type DragEvent, type MouseEvent } from 'react';
import { pad, type Change, type TabStatus } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { post } from '../api.ts';
import {
  activeTabId,
  closeDocTab,
  closePop,
  closeTab,
  curChange,
  curKey,
  docTabsFor,
  errToast,
  formatTokens,
  minimizeStaged,
  openApproval,
  openDialog,
  relaunchTab,
  revertTuned,
  setActive,
  termTabsFor,
  toast,
  togglePop,
  unreadIn,
  useStore,
  type DocTab,
} from '../store.ts';
import { Glyph, StateChip, docTypeCls } from '../components/common.tsx';
import { ReadPopover, WritePopover } from '../popovers/ReadWrite.tsx';
import { clearTerminal } from '../terminals.ts';
import { basename, cls, copyText } from '../util.ts';
import { tabLabel, tabMeta, tabTooltip, tunedNote } from './Terminal.tsx';

function docTabTitle(d: DocTab, change: Change | null): { role: string; meta: string; full: string } {
  if (d.kind === 'file') return { role: basename(d.path || ''), meta: 'file', full: d.path || '' };
  if (d.kind === 'diff') return { role: basename(d.path || ''), meta: d.staged ? 'staged diff' : 'diff', full: `${d.staged ? 'staged changes' : 'changes'} in ${d.path}` };
  if (d.kind === 'git') return { role: basename(d.path || ''), meta: 'git log', full: `git history of ${d.path}` };
  const vs = change?.docs.filter((x) => x.type === d.type) || [];
  const n = d.n ?? vs[vs.length - 1]?.n ?? 1;
  return { role: `${d.type}-${pad(n)}`, meta: 'doc', full: `briefs/${d.change}/${d.type}-${pad(n)}.md` };
}

/** S6 tab strip: state chips, overflow scroll, drag to reorder, context menu. */
export function TabStrip() {
  const s = useStore();
  const key = curKey(s);
  const change = curChange(s);
  const terms = termTabsFor(s, s.projectId, key);
  const docs = docTabsFor(s, s.projectId, key);
  const active = activeTabId(s);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const ctx = (e: MouseEvent, id: string) => {
    e.preventDefault();
    togglePop('tabctx', { x: Math.min(e.clientX, window.innerWidth - 240), y: e.clientY, id });
  };
  const drop = (e: DragEvent, target: string) => {
    e.preventDefault();
    setOver(null);
    if (!drag || drag === target || !s.projectId) return;
    const ids = terms.map((t) => t.id).filter((id) => id !== drag);
    ids.splice(ids.indexOf(target), 0, drag);
    useStore.setState((st) => ({ tabs: { ...st.tabs, ...Object.fromEntries(ids.map((id, i) => [id, { ...st.tabs[id], order: i + 1 }])) } }));
    void post('/api/tabs/reorder', { projectId: s.projectId, ids }).catch(errToast);
    setDrag(null);
  };
  if (!terms.length && !docs.length) return null;
  return (
    <div className="tabstrip">
      <div className="tabs-scroll" role="tablist">
        {terms.map((t) => (
          <div
            key={t.id}
            className={cls('tab', t.id === active && 'on', t.kind === 'plain' && 'plain', drag === t.id && 'drag', over === t.id && 'dropl')}
            onContextMenu={(e) => ctx(e, t.id)}
            draggable
            onDragStart={(e) => (setDrag(t.id), e.dataTransfer.setData('text/plain', t.id))}
            onDragOver={(e) => (e.preventDefault(), setOver(t.id))}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => drop(e, t.id)}
            onDragEnd={() => (setDrag(null), setOver(null))}
            data-testid={`tab-${t.spec.role || t.spec.service}`}
          >
            <button className="tab-main" onClick={() => setActive(t.id)} onDoubleClick={() => useStore.setState((st) => ({ tiled: !st.tiled }))} title={tabTooltip(t)} role="tab" aria-selected={t.id === active}>
              <Glyph service={t.spec.service} plain={t.kind === 'plain'} />
              <span className="tab-role">{t.spec.role || t.spec.service}</span>
              <span className={cls('tab-meta', t.tuned && 'tuned')}>{tabMeta(t)}</span>
            </button>
            <StateChip chip={t.chip} onClick={t.chip === 'approval' ? () => openApproval(t) : undefined} />
            <button className="tab-x" onClick={() => void closeTab(t.id)} aria-label="Close tab">
              <Icon d={I.x} size={12} />
            </button>
          </div>
        ))}
        {docs.map((d) => {
          const tt = docTabTitle(d, change);
          return (
            <div key={d.id} className={cls('tab doc', d.id === active && 'on')} onContextMenu={(e) => ctx(e, d.id)}>
              <button className="tab-main" onClick={() => setActive(d.id)} title={tt.full} role="tab" aria-selected={d.id === active}>
                <Icon d={I.file} cls={d.kind === 'doc' ? docTypeCls(d.type || '') : 'fx-md'} />
                <span className="tab-role">{tt.role}</span>
                <span className="tab-meta">{tt.meta}</span>
              </button>
              <button className="tab-x" onClick={() => closeDocTab(d.id)} aria-label="Close tab">
                <Icon d={I.x} size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <button className="tab-add" onClick={() => openDialog({ kind: 'add' })} aria-label="Add CLI tab" title="Add CLI tab">
        <Icon d={I.plus} size={16} />
      </button>
      {s.pop === 'tabctx' && s.popAt?.id && <TabContextMenu id={s.popAt.id} x={s.popAt.x} y={s.popAt.y} />}
    </div>
  );
}

function TabContextMenu({ id, x, y }: { id: string; x: number; y: number }) {
  const s = useStore();
  const t = s.tabs[id];
  const doc = s.docTabs.find((d) => d.id === id);
  const others = () => {
    const key = curKey(s);
    for (const o of termTabsFor(s, s.projectId, key)) if (o.id !== id) void closeTab(o.id);
    for (const o of docTabsFor(s, s.projectId, key)) if (o.id !== id) closeDocTab(o.id);
    closePop();
  };
  const dup = async () => {
    closePop();
    if (!t) return;
    try {
      const n = await post<TabStatus>('/api/tabs', { projectId: t.projectId, change: t.change, spec: t.spec, cwd: t.cwd });
      useStore.setState((st) => ({ tabs: { ...st.tabs, [n.id]: n } }));
      setActive(n.id);
    } catch (e) {
      errToast(e);
    }
  };
  return (
    <div className="pop menu" style={{ position: 'fixed', left: x, top: y, width: 230 }}>
      <div className="mlabel ell">{t ? tabLabel(t) : doc?.path || doc?.type}</div>
      {t && t.kind === 'term' && (
        <>
          <button className="mi" onClick={() => void dup()}>
            <Icon d={I.copy} />
            Duplicate tab
          </button>
          <button className="mi" onClick={() => openDialog({ kind: 'add', editTab: t.id })}>
            <Icon d={I.settings} />
            Edit launch settings…
          </button>
          <button className="mi" onClick={() => (closePop(), void relaunchTab(t.id, true))}>
            <Icon d={I.refresh} />
            Restart &amp; resume session
          </button>
          {t.tuned && (
            <button className="mi" onClick={() => (closePop(), void revertTuned(t))} title={tunedNote(t)}>
              <Icon d={I.refresh} />
              Resume with launch settings ({[t.tuned.from.model || 'default', t.tuned.from.effort].filter(Boolean).join(' · ')})
            </button>
          )}
          <button className="mi" onClick={() => (closePop(), void copyText(t.command).then(() => toast('Copied launch command', 'ok')))}>
            <Icon d={I.code} />
            Copy launch command
          </button>
        </>
      )}
      <button className="mi" onClick={others}>
        <Icon d={I.x} />
        Close others
      </button>
      <div className="msep" />
      <button className="mi danger" onClick={() => (closePop(), t ? void closeTab(id) : closeDocTab(id))}>
        <Icon d={I.x} />
        Close tab
      </button>
    </div>
  );
}

/** Per-tab toolbar: Read ▾ (stages) · Write ▾ (sends) — the control surface (S6). */
export function Toolbar({ tab }: { tab: TabStatus }) {
  const s = useStore();
  const change = tab.change ? (s.changes[tab.projectId] || []).find((c) => c.slug === tab.change) || null : null;
  const disabled = !change || tab.kind !== 'term';
  const title = !change ? 'Not attached to a change — brief buttons are off for workspace tabs' : tab.kind !== 'term' ? 'Plain terminal — no brief buttons' : '';
  const staged = s.staged[tab.id];
  const updCount = change && tab.briefUpdated ? Math.max(1, unreadIn(s, tab.projectId, change)) : 0;
  return (
    <div className="toolbar">
      <div className="rel">
        <span title={title} style={{ display: 'inline-flex' }}>
          <button className={cls('btn tb-read', tab.briefUpdated && 'ring')} onClick={() => togglePop('read')} disabled={disabled} aria-haspopup="true" aria-expanded={s.pop === 'read'} data-testid="read-btn">
            <Icon d={I.read} />
            Read
            {updCount > 0 && (
              <span className="cnt" title="Brief updated since this tab last read">
                {updCount}
              </span>
            )}
            <Icon d={I.down} size={12} cls="dim" />
          </button>
        </span>
        {s.pop === 'read' && change && <ReadPopover tab={tab} change={change} />}
      </div>
      <div className="rel">
        <span title={title} style={{ display: 'inline-flex' }}>
          <button className="btn" onClick={() => togglePop('write')} disabled={disabled} aria-haspopup="true" aria-expanded={s.pop === 'write'} style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }} data-testid="write-btn">
            <Icon d={I.write} />
            Write
            <Icon d={I.down} size={12} />
          </button>
        </span>
        {s.pop === 'write' && change && <WritePopover tab={tab} change={change} />}
      </div>
      <div className="law" title="Settings → Buttons">
        {(() => {
          const b = s.settings?.buttons;
          const r = b?.readBehavior || 'insert';
          const w = b?.writeBehavior || 'insert';
          if (r === 'insert' && w === 'insert') return <b>Read &amp; Write add to your prompt</b>;
          return (
            <>
              <b>Reads {r === 'insert' ? 'add to prompt' : 'stage'}</b>·<b>writes {w === 'insert' ? 'add to prompt' : w === 'fill' ? 'send' : 'stage'}</b>
            </>
          );
        })()}
      </div>
      {staged && staged.min && staged.text && (
        <button className="chip-staged" onClick={() => minimizeStaged(tab.id, false)} data-testid="staged-chip">
          <Icon d={I.pencil} size={13} />
          {staged.n} staged
        </button>
      )}
      <div className="grow" />
      {tab.approval && (
        <button className="btn sm" style={{ borderColor: 'var(--blue)', color: 'var(--blue)' }} onClick={() => openApproval(tab)} data-testid="review-approval">
          <Icon d={I.shield} size={13} />
          Review approval
        </button>
      )}
      <span className="tok" title={`Tokens used by this tab's session${change ? ` · ${formatTokens(s.tokens[tab.projectId]?.changes[change.slug])} for the whole change` : ''}`}>
        tokens {formatTokens(s.tokens[tab.projectId]?.tabs[tab.id])}
      </span>
      <button className="ibtn" title={`Session ${tab.sessionId || 'not captured yet'}${tab.sessionId ? ' — click to copy' : ''}`} aria-label="Session id" onClick={() => tab.sessionId && void copyText(tab.sessionId).then(() => toast(`Copied session id ${tab.sessionId}`, 'ok'))}>
        <Icon d={I.info} size={16} />
      </button>
      <button className="ibtn" onClick={() => clearTerminal(tab.id)} title="Clear terminal (local view only)" aria-label="Clear terminal">
        <Icon d={I.clear} size={16} />
      </button>
    </div>
  );
}

