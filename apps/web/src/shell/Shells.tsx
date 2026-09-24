import { useEffect, useRef, useState, type ReactNode } from 'react';
import { statusWord } from '@cayrnx/shared';
import { I, Icon, Logo } from '../icons.tsx';
import {
  activeTabId,
  archiveChange,
  closePop,
  curChange,
  curKey,
  curProject,
  docTabsFor,
  effectiveTheme,
  formatTokens,
  loadTokens,
  minimizeStaged,
  openApproval,
  openDialog,
  openPanel,
  setActive,
  termTabsFor,
  togglePop,
  unreadTotal,
  useStore,
  type PanelId,
  type TreeData,
} from '../store.ts';
import { Backdrop, Dots, Glyph, Popover, StateChip, SwipeOverlay, Toasts, docTypeCls, useLongPress } from '../components/common.tsx';
import { DialogHost } from '../dialogs/DialogHost.tsx';
import { BriefsPanel } from '../panels/BriefsPanel.tsx';
import { FilesPanel } from '../panels/FilesPanel.tsx';
import { HistoryPanel } from '../panels/HistoryPanel.tsx';
import { SetupsPanel } from '../panels/SetupsPanel.tsx';
import { SettingsPanel } from '../panels/SettingsPanel.tsx';
import { BadgeList, ChangeSelector, LayoutMenuItems, ProjectList, attentionTabs } from '../popovers/Selectors.tsx';
import { UsagePopover } from '../popovers/Usage.tsx';
import { ReadPopover, WritePopover } from '../popovers/ReadWrite.tsx';
import { clearTerminal, setTerminalRoot } from '../terminals.ts';
import { basename, cls } from '../util.ts';
import { MainArea } from './Main.tsx';
import { tabLabel, tabMeta, tunedNote } from './Terminal.tsx';
import { PanelResize, RAIL, Rail, StatusBar, TopBar, toggleTheme } from './Chrome.tsx';

export function PanelBody({ id, mobile }: { id: PanelId; mobile?: boolean }) {
  switch (id) {
    case 'files':
      return <FilesPanel mobile={mobile} />;
    case 'briefs':
      return <BriefsPanel mobile={mobile} />;
    case 'history':
      return <HistoryPanel mobile={mobile} />;
    case 'setups':
      return <SetupsPanel mobile={mobile} />;
    case 'settings':
      return <SettingsPanel mobile={mobile} />;
  }
}

function Root({ children, mobile }: { children: ReactNode; mobile?: boolean }) {
  const theme = useStore((s) => effectiveTheme(s));
  const palette = useStore((s) => s.settings?.appearance.palette);
  const pid = useStore((s) => s.projectId);
  const ref = useRef<HTMLDivElement>(null);
  // Token counter: refreshed on each finished turn (store) and every 20 s.
  useEffect(() => {
    if (!pid) return;
    void loadTokens(pid);
    const t = window.setInterval(() => void loadTokens(pid), 20_000);
    return () => window.clearInterval(t);
  }, [pid]);
  useEffect(() => {
    setTerminalRoot(ref.current);
    return () => setTerminalRoot(null);
  }, []);
  return (
    <div className={cls('cx', theme, mobile && 'mx')} data-palette={palette} ref={ref}>
      {children}
      <Backdrop />
      <DialogHost />
      <Toasts />
      <UpdateBanner />
      <div id="cx-portal" />
    </div>
  );
}

/* ---------------- desktop (S0) ---------------- */

export function DesktopShell() {
  const s = useStore();
  return (
    <Root>
      <div style={{ display: 'flex', flexGrow: 1, minHeight: 0 }}>
        <Rail />
        {s.panelOpen && (
          <>
            <aside className="panel" style={{ width: s.panelWidth }} aria-label={s.panel}>
              <PanelBody id={s.panel} />
            </aside>
            <PanelResize />
          </>
        )}
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <TopBar />
          <MainArea />
        </div>
      </div>
      <StatusBar />
    </Root>
  );
}

/* ---------------- mobile (S18) ---------------- */

const TITLES: Record<PanelId, string> = { files: 'Files', briefs: 'Briefs', history: 'History', setups: 'Setups', settings: 'Settings' };

function useKeyboardInset(): number {
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const f = () => setKb(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener('resize', f);
    vv.addEventListener('scroll', f);
    f();
    return () => {
      vv.removeEventListener('resize', f);
      vv.removeEventListener('scroll', f);
    };
  }, []);
  return kb;
}

function IconBtn({ label, onClick, children, className, disabled, testid }: { label: string; onClick: () => void; children: ReactNode; className?: string; disabled?: boolean; testid?: string }) {
  const lp = useLongPress(label);
  return (
    <>
      <button className={className || 'tbtn'} onClick={onClick} aria-label={label} title={label} disabled={disabled} {...lp.handlers} data-testid={testid}>
        {children}
      </button>
      {lp.label}
    </>
  );
}

function MobileToolbar() {
  const s = useStore();
  const id = activeTabId(s);
  const tab = id ? s.tabs[id] : null;
  if (!tab) return null;
  const change = tab.change ? (s.changes[tab.projectId] || []).find((c) => c.slug === tab.change) || null : null;
  const off = !change || tab.kind !== 'term';
  const st = s.staged[tab.id];
  // With the top bar folded away its bell and unread count show here instead.
  const { approvals, updates } = attentionTabs(s.tabs);
  const attn = approvals.length + updates.length + unreadTotal(s);
  return (
    <div className="toolbar">
      <IconBtn label={off ? 'Read — off for workspace tabs' : 'Read ▾ — stages only'} onClick={() => togglePop('read')} className={cls('tbtn', tab.briefUpdated && 'ring')} disabled={off} testid="read-btn">
        <Icon d={I.read} size={20} />
      </IconBtn>
      <IconBtn label={off ? 'Write — off for workspace tabs' : 'Write ▾ — sends'} onClick={() => togglePop('write')} className="tbtn write" disabled={off} testid="write-btn">
        <Icon d={I.write} size={20} />
      </IconBtn>
      {tab.approval && (
        <IconBtn label="Review approval" onClick={() => openApproval(tab)} className="tbtn" testid="review-approval">
          <Icon d={I.shield} size={20} style={{ color: 'var(--blue)' }} />
        </IconBtn>
      )}
      {st && st.min && st.text && (
        <button className="chip" onClick={() => minimizeStaged(tab.id, false)} data-testid="staged-chip">
          <Icon d={I.pencil} size={14} />
          {st.n}
        </button>
      )}
      <span className="grow dim ell" style={{ fontSize: 11.5, paddingLeft: 4 }}>
        {tab.spec.role || tab.spec.service} · {tabMeta(tab)}
      </span>
      <IconBtn label="Clear terminal" onClick={() => clearTerminal(tab.id)} className="tb">
        <Icon d={I.clear} size={18} />
      </IconBtn>
      <IconBtn label={s.topHidden ? 'Show the top bar' : 'Hide the top bar (more room for the CLI)'} onClick={() => useStore.setState({ topHidden: !s.topHidden, pop: null })} className="tb" testid="toggle-top">
        <Icon d={s.topHidden ? I.down : I.up} size={18} />
        {s.topHidden && attn > 0 && <span className="badge">{attn}</span>}
      </IconBtn>
      {s.pop === 'read' && change && <ReadPopover tab={tab} change={change} />}
      {s.pop === 'write' && change && <WritePopover tab={tab} change={change} />}
    </div>
  );
}

function MobileTabs() {
  const s = useStore();
  const key = curKey(s);
  const terms = termTabsFor(s, s.projectId, key);
  const docs = docTabsFor(s, s.projectId, key);
  const active = activeTabId(s);
  if (!terms.length && !docs.length) return null;
  return (
    <div className="tabs" role="tablist">
      {terms.map((t) => (
        <button key={t.id} className={cls('tab', t.id === active && 'on')} onClick={() => (t.chip === 'approval' ? openApproval(t) : setActive(t.id))} title={[tabLabel(t), tunedNote(t)].filter(Boolean).join('\n')} role="tab" aria-selected={t.id === active} data-testid={`tab-${t.spec.role || t.spec.service}`}>
          <Glyph service={t.spec.service} plain={t.kind === 'plain'} />
          <StateChip chip={t.chip} />
          <span className="ell" style={{ fontSize: 13, fontWeight: 500 }}>
            {t.spec.role || t.spec.service}
          </span>
        </button>
      ))}
      {docs.map((d) => (
        <button key={d.id} className={cls('tab', d.id === active && 'on')} onClick={() => setActive(d.id)} role="tab" aria-selected={d.id === active}>
          <Icon d={I.file} size={16} cls={d.kind === 'doc' ? docTypeCls(d.type || '') : 'fx-md'} />
          <span className="ell" style={{ fontSize: 13, fontWeight: 500 }}>
            {d.kind === 'doc' ? `${d.type}-${String(d.n).padStart(3, '0')}` : d.kind === 'git' ? `git · ${basename(d.path || '')}` : basename(d.path || '')}
          </span>
        </button>
      ))}
      <button className="tab" onClick={() => openDialog({ kind: 'add' })} aria-label="Add CLI tab">
        <Icon d={I.plus} size={16} />
      </button>
    </div>
  );
}

function MobileStatus() {
  const s = useStore();
  const p = curProject(s);
  const c = curChange(s);
  const cwd = c ? c.cwd : p?.path || '';
  const tree = cwd ? (s.trees[cwd] as TreeData | undefined) : undefined;
  const git = tree && 'git' in tree ? Object.keys(tree.git).length : null;
  return (
    <div className="status">
      <span className="schip mono">
        <Icon d={I.files} size={12} />
        …/{basename(cwd || '—')}
      </span>
      {c && (
        <span className="schip">
          <Icon d={I.branch} size={12} />
          {c.meta.worktree && c.cwd === c.meta.worktree.path ? 'worktree' : 'main checkout'}
        </span>
      )}
      {c && (
        <span className="schip">
          <Dots docs={c.docs} slug={c.slug} />
          {statusWord(c.docs)}
        </span>
      )}
      {git !== null && p?.isGit && (
        <span className="schip">
          <span style={{ color: 'var(--accent)' }}>●</span>git {git}
        </span>
      )}
      <button className="schip" onClick={() => c && togglePop('usage')} disabled={!c} data-testid="change-tokens">
        tokens {c ? formatTokens(s.tokens[p?.id || '']?.changes[c.slug]) : '—'}
      </button>
      {c && s.pop === 'usage' && <UsagePopover change={c} />}
    </div>
  );
}

function MobileOverflow() {
  const s = useStore();
  const c = curChange(s);
  const [sub, setSub] = useState<null | 'layout' | 'project'>(null);
  const [q, setQ] = useState('');
  if (sub === 'layout')
    return (
      <Popover title="Apply layout">
        <LayoutMenuItems />
      </Popover>
    );
  if (sub === 'project') return <ProjectList rows={s.projects.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))} q={q} setQ={setQ} />;
  const dark = effectiveTheme(s) === 'dark';
  return (
    <Popover title="More">
      <button className="menu-i" onClick={() => setSub('project')}>
        <Icon d={I.files} size={20} />
        <span className="grow ell">Project ▸ {curProject(s)?.name || 'none'}</span>
      </button>
      <button className="menu-i" onClick={() => setSub('layout')} disabled={!c}>
        <Icon d={I.tiles} size={20} />
        <span className="grow">Layout ▸ {c?.meta.layout || 'none'}</span>
        <span className="dim" style={{ fontSize: 12 }}>
          apply
        </span>
      </button>
      <button className="menu-i" onClick={() => (closePop(), useStore.setState({ view: s.view === 'board' ? 'term' : 'board' }))} disabled={!s.projectId} data-testid="toggle-board">
        <Icon d={s.view === 'board' ? I.term : I.board} size={20} />
        <span className="grow">{s.view === 'board' ? 'Back to terminals' : 'Change board'}</span>
      </button>
      <button className="menu-i" onClick={() => openDialog({ kind: 'add' })} disabled={!curKey(s)}>
        <Icon d={I.term} size={20} />
        <span className="grow">Add CLI</span>
      </button>
      <button className="menu-i" onClick={() => (closePop(), toggleTheme())}>
        <Icon d={dark ? I.sun : I.moon} size={20} />
        <span className="grow">{dark ? 'Light theme' : 'Dark theme'}</span>
      </button>
      <button className="menu-i" disabled>
        <Icon d={I.tiles} size={20} />
        <span className="grow">Tiled view</span>
        <span className="dim" style={{ fontSize: 12 }}>
          desktop only
        </span>
      </button>
      <button className="menu-i" onClick={() => (closePop(), c && void archiveChange(c.slug, true))} disabled={!c}>
        <Icon d={I.archive} size={20} />
        <span className="grow">Archive change</span>
      </button>
    </Popover>
  );
}

export function MobileShell() {
  const s = useStore();
  const kb = useKeyboardInset();
  const { approvals, updates } = attentionTabs(s.tabs);
  const attn = approvals.length + updates.length;
  const unread = unreadTotal(s);
  const id = activeTabId(s);
  const composerUp = !!(id && s.staged[id] && !s.staged[id].min && s.staged[id].text);
  // Only folded while the toolbar (with its show button) is on screen.
  const topHidden = s.topHidden && !!id && s.view !== 'board';
  return (
    <Root mobile>
      {!topHidden && (
        <>
        <div className="topbar">
          <span style={{ color: 'var(--accent)', display: 'inline-flex', marginRight: 4, fill: 'var(--accent)' }}>
            <Logo size={24} />
          </span>
          <ChangeSelector compact />
          <button className="tb" onClick={() => openDialog({ kind: 'new' })} aria-label="New change" style={{ color: 'var(--accent)' }} disabled={!s.projectId} data-testid="new-change">
            <Icon d={I.plus} size={22} />
          </button>
          <button className="tb" onClick={() => togglePop('badge')} aria-label={`Attention: ${attn}`} data-testid="badge-cluster">
            <Icon d={I.bell} size={20} />
            {attn > 0 && (
              <span className="badge" style={approvals.length ? { background: 'var(--blue)', color: '#0b1426' } : undefined}>
                {attn}
              </span>
            )}
          </button>
          <button className="tb" onClick={() => togglePop('overflow')} aria-label="More" data-testid="overflow">
            <Icon d={I.kebab} size={20} fat />
          </button>
        </div>
        <nav className="iconbar" aria-label="Sections">
          {RAIL.map(([pid, label, icon]) => (
            <button key={pid} className={cls('tb', s.section === pid && 'on')} onClick={() => openPanel(pid)} aria-label={label} data-testid={`rail-${pid}`}>
              <Icon d={icon} size={21} />
              {pid === 'briefs' && unread > 0 && <span className="badge">{unread}</span>}
            </button>
          ))}
          <span className="grow" />
          <span className="dim" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
            {s.section ? '' : 'tap a section'}
          </span>
        </nav>
        </>
      )}
      {s.view !== 'board' && <MobileTabs />}
      {s.view !== 'board' && <MobileToolbar />}
      <div style={{ flexGrow: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--term)', ['--kb' as any]: `${kb}px` }}>
        <MainArea withStrip={false} />
      </div>
      {!(kb > 0 && composerUp) && <MobileStatus />}
      {s.section && (
        <SwipeOverlay title={TITLES[s.section]} onClose={() => useStore.setState({ section: null })}>
          <PanelBody id={s.section} mobile />
        </SwipeOverlay>
      )}
      {s.pop === 'badge' && (
        <Popover title="Needs you">
          <BadgeList />
        </Popover>
      )}
      {s.pop === 'overflow' && <MobileOverflow />}
    </Root>
  );
}

/** Shown after Cayrnx was updated while this page stayed open (it still runs the old code). */
function UpdateBanner() {
  const show = useStore((s) => s.updateAvailable);
  if (!show) return null;
  return (
    <div className="updbanner" role="alert" data-testid="update-banner">
      <span>Cayrnx was updated — reload to use the new version.</span>
      <button className="btn sm primary" onClick={() => location.reload()}>
        Reload
      </button>
      <button className="ibtn sm" onClick={() => useStore.setState({ updateAvailable: false })} aria-label="Dismiss">
        <Icon d={I.x} size={12} />
      </button>
    </div>
  );
}
