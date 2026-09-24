import { useState } from 'react';
import type { TabStatus } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import {
  applyLayout,
  changesOf,
  curChange,
  curKey,
  jumpToTab,
  openApproval,
  openDialog,
  selectChange,
  selectProject,
  showPanel,
  togglePop,
  unreadIn,
  useStore,
  WORKSPACE,
} from '../store.ts';
import { Dots, Glyph, MiniTile, Popover, TypeChip } from '../components/common.tsx';
import { cls, relTime } from '../util.ts';

/* ---------------- change selector (§6.7) ---------------- */

export function ChangeSelector({ compact }: { compact?: boolean }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const key = curKey(s);
  const cur = curChange(s);
  const open = s.pop === 'change';
  const active = changesOf(s, s.projectId).filter((c) => !c.meta.archived);
  const rows = active.filter((c) => !q.trim() || c.slug.includes(q.trim().toLowerCase()));
  return (
    <div className={cls('rel', compact && 'grow')} style={compact ? { minWidth: 0, display: 'flex' } : undefined}>
      <button className="csel" onClick={() => (setQ(''), togglePop('change'))} aria-haspopup="true" aria-expanded={open} disabled={!s.projectId} data-testid="change-selector" style={compact ? { flexGrow: 1, minWidth: 0 } : undefined}>
        {cur ? (
          <>
            <TypeChip type={cur.meta.type} />
            <span className="ell" style={{ fontWeight: 500 }}>
              {cur.meta.name}
            </span>
            {!compact && <Dots docs={cur.docs} slug={cur.slug} />}
          </>
        ) : key === WORKSPACE ? (
          <>
            <TypeChip type="workspace" />
            <span className="muted ell">No change</span>
          </>
        ) : (
          <span className="muted ell">Select a change…</span>
        )}
        <Icon d={I.down} size={14} cls="dim" />
      </button>
      {open && (
        <Popover title="Switch change" style={{ left: 0, top: 38, width: 360, padding: 8 }}>
          <div className="search" style={{ marginBottom: 6 }}>
            <Icon d={I.search} size={14} />
            <input type="text" placeholder="Search changes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search changes" autoFocus={!s.isMobile} />
          </div>
          <div className="mlabel">Active changes</div>
          <div className="scroll">
            {rows.map((c) => {
              const un = unreadIn(s, s.projectId!, c);
              return (
                <button key={c.slug} className={cls('rpop-row', c.slug === key && 'on')} onClick={() => selectChange(c.slug)} style={{ height: 36 }}>
                  <TypeChip type={c.meta.type} />
                  <span className="ell grow" style={{ fontWeight: 500 }}>
                    {c.meta.name}
                  </span>
                  {un > 0 && (
                    <span className="cnt" title="Unread docs">
                      {un}
                    </span>
                  )}
                  <Dots docs={c.docs} slug={c.slug} />
                  <span className="cact" style={{ width: 60, textAlign: 'right' }}>
                    {relTime(c.activity)}
                  </span>
                </button>
              );
            })}
          </div>
          {!rows.length && <div className="dim" style={{ padding: 8, fontSize: 12 }}>No matching changes.</div>}
          <div className="msep" />
          <button className={cls('rpop-row', key === WORKSPACE && 'on')} onClick={() => selectChange(WORKSPACE)}>
            <TypeChip type="workspace" />
            <span className="grow muted ell">No change — plain tabs, brief buttons off</span>
          </button>
          <div className="msep" />
          <button className="mi" onClick={() => openDialog({ kind: 'new' })} style={{ color: 'var(--accent)', fontWeight: 500 }}>
            <Icon d={I.plus} />
            New change
          </button>
        </Popover>
      )}
    </div>
  );
}

/* ---------------- project selector (plan §3.11) ---------------- */

export function ProjectSelector() {
  const s = useStore();
  const [q, setQ] = useState('');
  const open = s.pop === 'project';
  const cur = s.projects.find((p) => p.id === s.projectId);
  const rows = s.projects.filter((p) => !q.trim() || (p.name + p.path).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="rel">
      <button className="psel" onClick={() => (setQ(''), togglePop('project'))} aria-haspopup="true" aria-expanded={open} title={cur?.path} data-testid="project-selector">
        <Icon d={I.files} size={15} cls="fold" />
        <span className="ell" style={{ fontWeight: 500 }}>
          {cur ? cur.name : 'Open project…'}
        </span>
        <Icon d={I.down} size={13} cls="dim" />
      </button>
      {open && <ProjectList rows={rows} q={q} setQ={setQ} />}
    </div>
  );
}

export function ProjectList({ rows, q, setQ }: { rows: ReturnType<typeof useStore.getState>['projects']; q: string; setQ: (v: string) => void }) {
  const s = useStore();
  return (
    <Popover title="Projects" style={{ left: 0, top: 38, width: 380, padding: 8 }}>
      <div className="search" style={{ marginBottom: 6 }}>
        <Icon d={I.search} size={14} />
        <input type="text" placeholder="Search projects" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" autoFocus={!s.isMobile} />
      </div>
      <div className="mlabel">Recent projects</div>
      <div className="scroll">
        {rows.map((p) => (
          <button key={p.id} className={cls('prow', p.id === s.projectId && 'on')} onClick={() => void selectProject(p.id)}>
            <Icon d={I.files} size={16} cls="dim" />
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="ell" style={{ display: 'block', fontWeight: 500 }}>
                {p.name}
                {!p.isGit && <span className="dim" style={{ fontWeight: 400, fontSize: 11 }}> · not git</span>}
              </span>
              <span className="pmeta ell">{p.path}</span>
            </span>
            {p.attention > 0 && <span className="cnt" title="Tabs that need you">{p.attention}</span>}
            <span className="pill" title="Active changes">
              {p.activeChanges}
            </span>
          </button>
        ))}
        {!rows.length && <div className="dim" style={{ padding: 8, fontSize: 12 }}>{s.projects.length ? 'No match.' : 'No projects yet.'}</div>}
      </div>
      <div className="msep" />
      <button className="mi" onClick={() => openDialog({ kind: 'open' })} style={{ color: 'var(--accent)', fontWeight: 500 }}>
        <Icon d={I.folderOpen} />
        Open project…
      </button>
      <button className="mi" onClick={() => showPanel('settings', { settingsAnchor: 'set-projects' })}>
        <Icon d={I.settings} />
        Manage projects…
      </button>
    </Popover>
  );
}

/* ---------------- global badge cluster (S16) ---------------- */

export function attentionTabs(tabs: Record<string, TabStatus>) {
  const all = Object.values(tabs);
  return {
    approvals: all.filter((t) => t.chip === 'approval'),
    updates: all.filter((t) => t.chip === 'updated' || t.chip === 'notsaved'),
    finished: all.filter((t) => t.chip === 'finished'),
  };
}

export function BadgeList() {
  const s = useStore();
  const { approvals, updates, finished } = attentionTabs(s.tabs);
  const pname = (id: string) => (s.projects.length > 1 ? `${s.projects.find((p) => p.id === id)?.name || id} · ` : '');
  const row = (t: TabStatus, reason: string) => (
    <button key={t.id} className="rpop-row" onClick={() => (t.chip === 'approval' ? openApproval(t) : void jumpToTab(t))} style={{ height: 40 }}>
      <Glyph service={t.spec.service} plain={t.kind === 'plain'} />
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="ell" style={{ display: 'block', fontWeight: 500 }}>
          {t.spec.role || t.spec.service} · {t.spec.service} · {t.spec.model || 'default'}
        </span>
        <span className="dim ell" style={{ display: 'block', fontSize: 11 }}>
          {pname(t.projectId)}
          {t.change || 'workspace'} · {reason}
        </span>
      </span>
      <span className="link" style={{ fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>
        Jump →
      </span>
    </button>
  );
  return (
    <>
      {approvals.length > 0 && (
        <>
          <div className="mlabel row" style={{ gap: 6 }}>
            <span className="stc st-approval" />
            Approvals
          </div>
          {approvals.map((t) => row(t, t.approval?.tool ? `wants to use ${t.approval.tool}` : 'is waiting on a permission prompt'))}
        </>
      )}
      {updates.length > 0 && (
        <>
          <div className="mlabel row" style={{ gap: 6 }}>
            <span className="stc st-updated" />
            Brief updates
          </div>
          {updates.map((t) => row(t, t.chip === 'notsaved' ? 'write claimed done, file unchanged' : 'a brief doc changed since it last read'))}
        </>
      )}
      {finished.length > 0 && (
        <>
          <div className="mlabel row" style={{ gap: 6 }}>
            <span className="stc st-finished" />
            Finished
          </div>
          {finished.map((t) => row(t, 'went idle since you last looked'))}
        </>
      )}
      {!approvals.length && !updates.length && !finished.length && <div className="dim" style={{ padding: 18, textAlign: 'center', fontSize: 12 }}>All quiet. Nothing needs you.</div>}
    </>
  );
}

export function BadgeCluster() {
  const s = useStore();
  const { approvals, updates } = attentionTabs(s.tabs);
  const open = s.pop === 'badge';
  return (
    <div className="rel">
      <button className={cls('badgec', approvals.length > 0 && 'hot')} onClick={() => togglePop('badge')} aria-label={`Attention: ${approvals.length + updates.length} items`} title="Approvals and brief updates across all tabs" data-testid="badge-cluster">
        <Icon d={I.bell} />
        {approvals.length > 0 && <span className="n na">{approvals.length}</span>}
        {updates.length > 0 && <span className="n nu">{updates.length}</span>}
        {!approvals.length && !updates.length && <span className="n nz">0</span>}
      </button>
      {open && (
        <Popover title="Needs you" style={{ right: 0, top: 38, width: 380, padding: 6 }}>
          <BadgeList />
        </Popover>
      )}
    </div>
  );
}

/* ---------------- layout menu ---------------- */

export function LayoutMenuItems() {
  const s = useStore();
  const cur = curChange(s);
  return (
    <>
      <div className="mlabel">Apply to {cur?.slug}</div>
      {(s.registries?.layouts || []).map((l) => (
        <button key={l.id} className="mi" onClick={() => void applyLayout(l.id)} style={{ height: 44 }}>
          <MiniTile areas={l.areas} tabs={l.tabs} w={44} h={28} />
          <span className="grow" style={{ minWidth: 0 }}>
            <span style={{ fontWeight: 500 }}>{l.name}</span>
            <br />
            <span className="dim ell" style={{ fontSize: 11, display: 'block' }}>
              {l.tabs.length} tab{l.tabs.length === 1 ? '' : 's'} · {l.tabs.map((t) => t.role || t.service).join(' / ')}
            </span>
          </span>
        </button>
      ))}
      <div className="msep" />
      {cur?.meta.layout && s.registries?.layouts.some((l) => l.id === cur.meta.layout) && (
        <button className="mi" onClick={() => openDialog({ kind: 'layout', layout: s.registries!.layouts.find((l) => l.id === cur.meta.layout)!, isNew: false })} data-testid="edit-current-layout">
          <Icon d={I.pencil} />
          Edit “{cur.meta.layout}” (which CLI each role uses)…
        </button>
      )}
      <button className="mi" onClick={() => showPanel('setups', { setupsSeg: 'layouts' })}>
        <Icon d={I.setups} />
        Manage layouts…
      </button>
    </>
  );
}

export function LayoutMenu() {
  const s = useStore();
  const cur = curChange(s);
  const open = s.pop === 'layout';
  return (
    <div className="rel">
      <button className="btn" onClick={() => togglePop('layout')} disabled={!cur} title="Apply a saved layout to the current change" data-testid="layout-menu">
        <Icon d={I.tiles} />
        Layout: <span style={{ fontWeight: 600 }}>{cur ? cur.meta.layout || 'none' : '—'}</span>
        <Icon d={I.down} size={13} cls="dim" />
      </button>
      {open && (
        <Popover title="Apply layout" className="menu" style={{ left: 0, top: 38, width: 300 }}>
          <LayoutMenuItems />
        </Popover>
      )}
    </div>
  );
}
