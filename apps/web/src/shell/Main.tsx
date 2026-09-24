import { useEffect, useState } from 'react';
import { I, Icon, Logo } from '../icons.tsx';
import {
  activeTabId,
  changesOf,
  curKey,
  curProject,
  docTabsFor,
  openDialog,
  selectChange,
  selectProject,
  termTabsFor,
  togglePop,
  useStore,
  WORKSPACE,
} from '../store.ts';
import { Popover } from '../components/common.tsx';
import { LayoutMenuItems } from '../popovers/Selectors.tsx';
import { OpenProjectBody } from '../dialogs/OpenProjectDialog.tsx';
import { relTime } from '../util.ts';
import { TabStrip, Toolbar } from './Tabs.tsx';
import { Composer, TerminalView } from './Terminal.tsx';
import { TiledView } from './Tiled.tsx';
import { BoardView } from './Board.tsx';
import { post } from '../api.ts';
import { DocView, FileView, GitHistoryView } from './DocView.tsx';
import { GitDiffView } from './GitDiff.tsx';

/** S17 — no project open: open a folder, or pick a recent project. */
export function NoProject() {
  const projects = useStore((s) => s.projects);
  const [opening, setOpening] = useState(false);
  return (
    <div className="content" style={{ background: 'var(--bg)', overflowY: 'auto' }}>
      <div className="welcome">
        <div className="logo" style={{ width: 64, height: 64, margin: '0 auto 18px' }}>
          <Logo size={56} />
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.01em', marginBottom: 8 }}>Open a project folder</div>
        <div className="muted" style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
          Cayrnx works like an editor: open an existing folder and work in it. Brief folders live in the project and stay out of git.
        </div>
        {!opening && (
          <button className="btn primary lg" onClick={() => setOpening(true)} data-testid="open-first-project">
            <Icon d={I.folderOpen} size={16} />
            Open a project folder
          </button>
        )}
        {opening && (
          <div className="lcard" style={{ textAlign: 'left', padding: 16 }}>
            <OpenProjectBody inline onOpened={() => setOpening(false)} />
          </div>
        )}
        {projects.length > 0 && (
          <div style={{ marginTop: 28, textAlign: 'left' }}>
            <div className="mlabel">Recent projects</div>
            {projects.map((p) => (
              <button key={p.id} className="prow" onClick={() => void selectProject(p.id)}>
                <Icon d={I.files} size={16} cls="dim" />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="ell" style={{ display: 'block', fontWeight: 500 }}>
                    {p.name}
                  </span>
                  <span className="pmeta ell">{p.path}</span>
                </span>
                <span className="dim" style={{ fontSize: 11.5 }}>
                  {relTime(p.lastOpened)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** S17 — project open, no changes yet. */
export function FirstChange() {
  return (
    <div className="content" style={{ background: 'var(--bg)', overflowY: 'auto' }}>
      <div className="welcome">
        <div className="logo" style={{ width: 64, height: 64, margin: '0 auto 18px' }}>
          <Logo size={56} />
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.01em', marginBottom: 8 }}>Create your first change</div>
        <div className="muted" style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
          Each change gets a brief folder. Your agents leave notes there — findings, plans, code notes, reviews — so the next agent picks up where the last one stopped.
        </div>
        <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn primary lg" onClick={() => openDialog({ kind: 'new' })} data-testid="first-change">
            <Icon d={I.plus} size={16} />
            New change
          </button>
          <button className="btn lg" onClick={() => selectChange(WORKSPACE)}>
            Just open a terminal
          </button>
        </div>
        <div className="step3">
          <div>
            <b>1 · Brief</b>Name the bug or story. Cayrnx writes brief-001.md.
          </div>
          <div>
            <b>2 · Route</b>Tell a tab what to do. Click Write to save its output as a doc.
          </div>
          <div>
            <b>3 · Hand off</b>Click Read on another tab. The next agent starts from the file.
          </div>
        </div>
      </div>
    </div>
  );
}

function NoTabs() {
  const s = useStore();
  const ws = curKey(s) === WORKSPACE;
  // No layouts (all deleted): point at building one instead of an empty menu.
  const noLayouts = !s.registries?.layouts.length;
  const newLayout = () =>
    openDialog({ kind: 'layout', isNew: true, layout: { id: '', name: '', desc: '', areas: "'a'", tabs: [{ service: 'claude', role: 'planner', model: 'sonnet', effort: '', agent: '', claudePerm: 'plan', area: 'a' }], custom: [] } });
  return (
    <div className="welcome" style={{ margin: 'auto' }}>
      <div className="empty" style={{ padding: 0 }}>
        <div className="eic">
          <Icon d={I.term} size={22} />
        </div>
      </div>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>{ws ? 'Workspace — no change attached' : 'No tabs open for this change'}</div>
      <div className="muted" style={{ marginBottom: 18 }}>
        {ws
          ? 'Plain CLI tabs in the project root. Read and Write stay off here.'
          : noLayouts
            ? 'Add a single CLI tab, or build a layout — a saved team of tabs (planner, coder, …) you can apply to any change.'
            : 'Apply a saved layout, or add a single CLI tab.'}
      </div>
      <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
        {!ws && noLayouts && (
          <button className="btn" onClick={newLayout} data-testid="create-layout">
            <Icon d={I.tiles} size={14} />
            Create a layout
          </button>
        )}
        {!ws && !noLayouts && (
          <div className="rel">
            <button className="btn primary" onClick={() => togglePop('layout-empty')}>
              <Icon d={I.tiles} size={14} />
              Apply layout
            </button>
            {s.pop === 'layout-empty' && (
              <Popover title="Apply layout" className="menu" style={{ left: 0, top: 38, width: 300 }}>
                <LayoutMenuItems />
              </Popover>
            )}
          </div>
        )}
        <button className={ws || noLayouts ? 'btn primary' : 'btn'} onClick={() => openDialog({ kind: 'add' })}>
          Add CLI
        </button>
      </div>
    </div>
  );
}

/** Looking at a finished tab clears its "finished" badge (spec §8: finished → on next look). */
function AckFinished({ id, finished }: { id: string; finished: boolean }) {
  useEffect(() => {
    if (!finished) return;
    const t = window.setTimeout(() => {
      if (document.visibilityState === 'visible') void post(`/api/tabs/${id}/ack`, { what: 'finished' }).catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(t);
  }, [id, finished]);
  return null;
}

/** Tab strip + toolbar + content for the selected change (focus mode). */
export function MainArea({ withStrip = true }: { withStrip?: boolean }) {
  const s = useStore();
  const p = curProject(s);
  if (!p) return <NoProject />;
  const key = curKey(s);
  if (s.view === 'board' && changesOf(s, p.id).length) return <BoardView />;
  if (!key) return <FirstChange />;
  const id = activeTabId(s);
  const term = id ? s.tabs[id] : null;
  if (s.tiled && !s.isMobile && termTabsFor(s, p.id, key).length) return <TiledView />;
  const strip = term && withStrip && s.settings?.buttons.stagedPlacement === 'toolbar' && s.staged[term.id]?.text && !s.staged[term.id]?.min;
  const doc = id && !term ? docTabsFor(s, p.id, key).find((d) => d.id === id) || null : null;
  const docChange = doc?.change ? changesOf(s, p.id).find((c) => c.slug === doc.change) || null : null;
  return (
    <>
      {withStrip && <TabStrip />}
      {term && withStrip && <Toolbar tab={term} />}
      {strip && <Composer tab={term} strip />}
      {term && <AckFinished id={term.id} finished={term.finished} />}
      <div className="content">
        {term && <TerminalView key={term.id} tab={term} />}
        {doc && doc.kind === 'doc' && docChange && <DocView key={doc.id} d={doc} change={docChange} />}
        {doc && doc.kind === 'file' && <FileView key={doc.id} d={doc} />}
        {doc && doc.kind === 'git' && <GitHistoryView key={doc.id} d={doc} />}
        {doc && doc.kind === 'diff' && <GitDiffView key={doc.id} d={doc} />}
        {!term && (!doc || (doc.kind === 'doc' && !docChange)) && <NoTabs />}
      </div>
    </>
  );
}
