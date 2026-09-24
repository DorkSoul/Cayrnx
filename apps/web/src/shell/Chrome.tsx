import { useEffect, useRef } from 'react';
import { statusWord } from '@cayrnx/shared';
import { I, Icon, Logo } from '../icons.tsx';
import { archiveChange, curChange, curKey, curProject, effectiveTheme, formatTokens, loadTree, openDialog, openPanel, saveSettings, togglePop, unreadTotal, useStore, WORKSPACE, type PanelId, type TreeData } from '../store.ts';
import { Dots, Seg } from '../components/common.tsx';
import { BadgeCluster, ChangeSelector, LayoutMenu, ProjectSelector } from '../popovers/Selectors.tsx';
import { UsagePopover } from '../popovers/Usage.tsx';
import { cls, midTrunc } from '../util.ts';

export const RAIL: [PanelId, string, string][] = [
  ['files', 'Files', I.files],
  ['changes', 'Changes (git diff)', I.diff],
  ['briefs', 'Briefs', I.briefs],
  ['history', 'History', I.history],
  ['setups', 'Setups', I.setups],
  ['settings', 'Settings', I.settings],
];

/** Uncommitted files in the current change's folder (from the Files listing's git status). */
export function changedFiles(s: ReturnType<typeof useStore.getState>): number {
  const p = curProject(s);
  const c = curChange(s);
  const cwd = c ? c.cwd : p?.path || '';
  const tree = cwd ? (s.trees[cwd] as TreeData | undefined) : undefined;
  return tree && 'git' in tree ? Object.keys(tree.git).length : 0;
}

/** The sun/moon button: flips dark ↔ light on the Cayrnx theme (leaving a colour theme). */
export function toggleTheme(): void {
  void saveSettings({ appearance: { theme: effectiveTheme() === 'dark' ? 'light' : 'dark', palette: 'cayrnx' } });
}

export function Rail() {
  const s = useStore();
  const unread = unreadTotal(s);
  const changed = changedFiles(s);
  const dark = effectiveTheme(s) === 'dark';
  return (
    <nav className="rail" aria-label="Sections">
      <div className="logo" title="Cayrnx">
        <Logo />
      </div>
      {RAIL.map(([id, label, icon]) => (
        <button key={id} className={cls('rbtn', s.panel === id && s.panelOpen && 'on')} onClick={() => openPanel(id)} aria-label={label} title={label} data-testid={`rail-${id}`}>
          <Icon d={icon} size={20} />
          {id === 'briefs' && unread > 0 && <span className="rbadge">{unread}</span>}
          {id === 'changes' && changed > 0 && <span className="rbadge soft">{changed}</span>}
        </button>
      ))}
      <div style={{ flexGrow: 1 }} />
      <button className="rbtn" onClick={toggleTheme} aria-label="Toggle light / dark theme" title="Toggle light / dark theme">
        <Icon d={dark ? I.sun : I.moon} size={19} />
      </button>
      <button className="rbtn" onClick={() => useStore.setState({ panelOpen: !s.panelOpen })} aria-label={s.panelOpen ? 'Collapse panel' : 'Expand panel'} title={s.panelOpen ? 'Collapse panel' : 'Expand panel'}>
        <Icon d={I.sidebar} size={19} />
      </button>
    </nav>
  );
}

export function TopBar() {
  const s = useStore();
  const cur = curChange(s);
  return (
    <div className="topbar">
      <ProjectSelector />
      <ChangeSelector />
      <button className={cls('btn', !cur && 'primary')} onClick={() => openDialog({ kind: 'new' })} disabled={!s.projectId} data-testid="new-change">
        <Icon d={I.plus} />
        New change
      </button>
      <LayoutMenu />
      <button className="btn" onClick={() => openDialog({ kind: 'add' })} disabled={!s.projectId || !curKey(s)} data-testid="add-cli">
        <Icon d={I.term} />
        Add CLI
      </button>
      <div className="grow" />
      <Seg
        label="Main view"
        value={s.view}
        onChange={(v) => useStore.setState({ view: v, pop: null })}
        options={[
          { value: 'term', label: <><Icon d={I.term} size={13} />Terminals</> },
          { value: 'board', label: <><Icon d={I.board} size={13} />Board</>, disabled: !s.projectId, title: 'Change board — columns derived from which files exist' },
        ]}
      />
      <BadgeCluster />
    </div>
  );
}

export function StatusBar() {
  const s = useStore();
  const p = curProject(s);
  const c = curChange(s);
  const cwd = c ? c.cwd : p?.path || '';
  const tree = cwd ? (s.trees[cwd] as TreeData | undefined) : undefined;
  const git = tree && 'git' in tree ? Object.keys(tree.git).length : null;
  // The git count comes from the same (cached) listing the Files panel uses.
  useEffect(() => {
    if (cwd && p?.isGit) void loadTree(cwd);
  }, [cwd, p?.isGit, c?.activity]);
  const branch = c ? (c.meta.worktree && c.cwd === c.meta.worktree.path ? `worktree@${c.meta.worktree.branch}` : c.meta.cwd ? 'custom directory' : 'main checkout') : curKey(s) === WORKSPACE ? 'main checkout' : '';
  return (
    <div className="status">
      <span className="sitem mono" title={cwd}>
        <Icon d={I.files} size={13} />
        {cwd ? midTrunc(cwd) : 'no project'}
      </span>
      {branch && (
        <span className="sitem">
          <Icon d={I.branch} size={13} />
          {branch}
        </span>
      )}
      {c && (
        <span className="sitem" title="Progress: the brief, then each CLI tab (lit once it has run a prompt)">
          <Dots docs={c.docs} slug={c.slug} />
          <span>{statusWord(c.docs)}</span>
        </span>
      )}
      {p?.isGit && git !== null && (
        <span className="sitem" title="Uncommitted files in this directory">
          <span style={{ color: 'var(--accent)' }}>●</span>git {git}
        </span>
      )}
      <span className="rel">
        <button className="sitem sbtn" onClick={() => c && togglePop('usage')} disabled={!c} title={c ? `Tokens used by every session of ${c.slug} — click for the per-model breakdown` : 'Tokens (pick a change)'} aria-haspopup="true" aria-expanded={s.pop === 'usage'} data-testid="change-tokens">
          tokens {c ? formatTokens(s.tokens[p!.id]?.changes[c.slug]) : '—'}
        </button>
        {c && s.pop === 'usage' && <UsagePopover change={c} style={{ left: 0, bottom: 26 }} />}
      </span>
      <span className="grow" />
      {s.conn !== 'open' && (
        <span className="sitem" style={{ color: 'var(--accent)' }}>
          <span className="stc st-launching" />
          reconnecting
        </span>
      )}
      {s.view === 'term' && (
        <div className="seg" role="group" aria-label="Layout mode">
          <button className={cls(!s.tiled && 'on')} onClick={() => useStore.setState({ tiled: false })}>
            <Icon d={I.focus} size={11} />
            Focus
          </button>
          <button className={cls(s.tiled && 'on')} onClick={() => useStore.setState({ tiled: true, pop: null })} disabled={!curKey(s)} data-testid="tiled-toggle">
            <Icon d={I.tiles} size={11} />
            Tiled
          </button>
        </div>
      )}
      <button className="ibtn sm" onClick={() => c && void archiveChange(c.slug, true)} disabled={!c} aria-label="Archive change" title="Archive this change">
        <Icon d={I.archive} size={14} />
      </button>
    </div>
  );
}

/** Drag handle to resize the left panel (spec: 240–320 px, resizable). */
export function PanelResize() {
  const w = useStore((s) => s.panelWidth);
  const drag = useRef<{ x: number; w: number } | null>(null);
  const move = (e: PointerEvent) => {
    if (!drag.current) return;
    const nw = Math.max(240, Math.min(520, drag.current.w + e.clientX - drag.current.x));
    useStore.setState({ panelWidth: nw });
  };
  const up = () => {
    drag.current = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    document.body.style.cursor = '';
  };
  return (
    <div
      className="presize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, w };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        document.body.style.cursor = 'col-resize';
      }}
      onDoubleClick={() => useStore.setState({ panelWidth: 312 })}
    />
  );
}
