import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ADAPTERS, type TabStatus } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { post } from '../api.ts';
import { clearStaged, editStaged, errToast, minimizeStaged, openDialog, relaunchTab, sendStaged, useStore } from '../store.ts';
import { mountTerminal } from '../terminals.ts';
import { cls } from '../util.ts';

export function tabLabel(t: TabStatus): string {
  return `${t.spec.role || t.spec.service} · ${tabMeta(t)}`;
}

/** `claude-haiku-4-5-20251001` → `haiku-4-5`: the strip has little room. */
const shortModel = (m: string) => m.replace(/^claude-/, '').replace(/-\d{8}$/, '');

/** "service · model" — plus the effort once it was switched inside the CLI. */
export function tabMeta(t: TabStatus): string {
  if (t.kind === 'plain') return 'terminal';
  return [t.spec.service, t.spec.model ? shortModel(t.spec.model) : 'default', t.tuned && t.spec.effort].filter(Boolean).join(' · ');
}

/** A tab's hover card: who it is, what it runs with, where. The full command is in its right-click menu. */
export function tabTooltip(t: TabStatus): string {
  if (t.kind === 'plain') return [`${t.spec.role || 'terminal'} · terminal`, `Runs in ${t.cwd}`].join('\n');
  const s = t.spec;
  const perm = s.service === 'claude' ? s.claudePerm && `${s.claudePerm} permissions` : s.service === 'codex' ? s.codexSandbox && `${s.codexSandbox} sandbox` : s.ocAuto ? 'auto-approve' : s.agent && `${s.agent} agent`;
  return [
    `${s.role || s.service} · ${ADAPTERS[s.service].name}`,
    [s.model || 'default model', s.effort && `${s.effort} effort`, perm].filter(Boolean).join(' · '),
    `Runs in ${t.cwd}`,
    tunedNote(t),
    'Right-click for the launch command, Relaunch and more',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Tooltip line for a tab whose model/effort was switched inside the CLI. */
export function tunedNote(t: TabStatus): string {
  if (!t.tuned) return '';
  const f = t.tuned.from;
  const was = [f.model || 'default model', f.effort && `${f.effort} effort`].filter(Boolean).join(' · ');
  const now = [t.spec.model || 'default model', t.spec.effort && `${t.spec.effort} effort`].filter(Boolean).join(' · ');
  return `Switched inside the CLI: ${was} → ${now}. Kept for this tab's Relaunch/Resume; the layout and new tabs are unchanged.`;
}

/** xterm viewport for one tab, plus its state overlays (spec S6 states). */
export function TerminalView({ tab }: { tab: TabStatus }) {
  const host = useRef<HTMLDivElement>(null);
  const staged = useStore((s) => s.staged[tab.id]);
  const conn = useStore((s) => s.conn);
  const mobile = useStore((s) => s.isMobile);
  const strip = useStore((s) => s.settings?.buttons.stagedPlacement === 'toolbar' && !s.isMobile);
  const hasComposer = !!staged && !!staged.text && !staged.min && !strip;
  useEffect(() => {
    if (!host.current) return;
    return mountTerminal(tab.id, host.current, { focus: !mobile && !hasComposer });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);
  const canResume = tab.kind === 'term';
  const dismiss = (what: 'notsaved') => void post(`/api/tabs/${tab.id}/ack`, { what }).catch(errToast);
  return (
    <>
      <div className={cls('xtwrap', hasComposer && 'withcomp')}>
        <div className="xthost" ref={host} data-testid={`term-${tab.id}`} />
      </div>
      {conn !== 'open' && (
        <div className="conn">
          <span className="stc st-launching" />
          Reconnecting… the terminal keeps running on the server
        </div>
      )}
      {tab.fallback && tab.proc === 'running' && (
        <div className="fallback" data-testid="fallback-chip">
          <Icon d={I.bolt} size={13} />
          <span className="ell" style={{ maxWidth: 520 }} title={tab.error || ''}>
            Adapter failed — falling back to terminal mode
          </span>
          <button className="link" style={{ marginLeft: 6, color: 'inherit' }} onClick={() => openDialog({ kind: 'add', editTab: tab.id })}>
            Edit launch settings
          </button>
        </div>
      )}
      {tab.proc === 'failed' && (
        <div className="fallback amber">
          <Icon d={I.warn} size={13} />
          <span className="ell" style={{ maxWidth: 520 }}>
            {tab.error || 'Failed to launch'}
          </span>
          <button className="link" style={{ marginLeft: 6, color: 'inherit' }} onClick={() => void relaunchTab(tab.id, false)}>
            Relaunch
          </button>
        </div>
      )}
      {tab.proc !== 'failed' && tab.notSaved && (
        <div className="fallback">
          <Icon d={I.warn} size={13} />
          Brief not updated — {tab.notSaved} never appeared
          <button className="link" style={{ marginLeft: 6, color: 'inherit' }} onClick={() => dismiss('notsaved')}>
            Dismiss
          </button>
        </div>
      )}
      {tab.proc === 'running' && !tab.notSaved && tab.info && (
        <div className="fallback info">
          <Icon d={I.info} size={13} />
          {tab.info}
          <button className="link" style={{ marginLeft: 6, color: 'inherit' }} onClick={() => dismiss('notsaved')}>
            Dismiss
          </button>
        </div>
      )}
      {tab.proc === 'exited' && (
        <div className="overlay-center">
          <div className="ocard">
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{tab.exitCode === null ? 'Process ended' : `Process exited (code ${tab.exitCode})`}</div>
            <div className="muted" style={{ fontSize: 12, marginBottom: tab.info ? 8 : 16 }}>
              {tabLabel(tab)}
            </div>
            {tab.info && (
              <div className="dim" style={{ fontSize: 12, marginBottom: 16 }}>
                {tab.info}
              </div>
            )}
            <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => void relaunchTab(tab.id, false)}>
                <Icon d={I.play} size={14} />
                Relaunch
              </button>
              {canResume && (
                <button className="btn primary" onClick={() => void relaunchTab(tab.id, true)} title={tab.sessionId ? `Resume session ${tab.sessionId}` : `Continue the latest ${ADAPTERS[tab.spec.service].name} session in this folder`}>
                  <Icon d={I.refresh} size={14} />
                  Resume session
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {hasComposer && <Composer tab={tab} />}
    </>
  );
}

/** The staged composer overlay (spec S6) — the transparency contract. */
export function Composer({ tab, strip }: { tab: TabStatus; strip?: boolean }) {
  const st = useStore((s) => s.staged[tab.id]);
  const mobile = useStore((s) => s.isMobile);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!mobile) ref.current?.focus();
  }, [mobile]);
  if (!st) return null;
  const rows = Math.min(6, Math.max(2, Math.ceil(st.text.length / 110) + (st.text.match(/\n/g)?.length || 0)));
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void sendStaged(tab.id);
    }
    if (e.key === 'Escape') minimizeStaged(tab.id, true);
  };
  const running = tab.proc === 'running';
  return (
    <div className={strip ? 'composer strip' : 'composer'} data-testid="composer">
      <div className="chead">
        <Icon d={I.pencil} size={13} style={{ color: 'var(--accent)' }} />
        <span className="grow ell">
          {mobile ? (
            'Staged — sent only when you tap Send'
          ) : (
            <>
              Staged for <b style={{ color: 'var(--text)', fontWeight: 500 }}>{tabLabel(tab)}</b> — nothing is sent until you press Send
            </>
          )}
        </span>
        <button className="ibtn sm" onClick={() => minimizeStaged(tab.id, true)} aria-label="Minimize" title="Minimize to toolbar chip">
          <Icon d={I.minus} size={14} />
        </button>
        <button className="ibtn sm" onClick={() => clearStaged(tab.id)} aria-label="Clear staged text" title="Clear">
          <Icon d={I.x} size={14} />
        </button>
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
        <textarea ref={ref} className="mono grow" rows={rows} value={st.text} onChange={(e) => editStaged(tab.id, e.target.value)} onKeyDown={onKey} aria-label="Staged text" data-testid="composer-text" />
        <button className="btn primary" onClick={() => void sendStaged(tab.id)} disabled={!running || !st.text.trim()} title={running ? '' : 'The tab is not running'} data-testid="composer-send">
          <Icon d={I.enter} size={14} />
          Send
        </button>
      </div>
      {!mobile && (
        <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
          <span className="kbd">Enter</span> send · <span className="kbd">Shift</span>+<span className="kbd">Enter</span> newline · <span className="kbd">Esc</span> minimise
        </div>
      )}
    </div>
  );
}
