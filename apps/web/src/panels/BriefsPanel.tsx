import { useState } from 'react';
import { FLOW, byType, pad, statusWord, type Change } from '@cayrnx/shared';
import { placedStep } from '../shell/Board.tsx';
import { I, Icon } from '../icons.tsx';
import {
  archiveChange,
  deleteChange,
  changesOf,
  curKey,
  errToast,
  isUnread,
  openDialog,
  openDoc,
  selectChange,
  showPanel,
  toast,
  togglePop,
  unreadIn,
  useStore,
} from '../store.ts';
import { Dots, Empty, Popover, Seg, TypeChip, docTypeCls } from '../components/common.tsx';
import { cls, relTime, shortTime } from '../util.ts';
import { patch, post } from '../api.ts';

function ChangeMenu({ c }: { c: Change }) {
  const pid = useStore((s) => s.projectId)!;
  const keep = useStore((s) => s.settings?.briefs.keep ?? 'all');
  const close = () => useStore.setState({ pop: null });
  return (
    <Popover title={`${c.meta.type}-${c.meta.name}`} className="menu" style={{ right: 0, top: 28, width: 230 }}>
      <button className="mi" onClick={() => (selectChange(c.slug), close())}>
        <Icon d={I.term} />
        Open change
      </button>
      <button
        className="mi"
        onClick={() =>
          openDialog({
            kind: 'rename',
            title: 'Rename change',
            label: 'Display name (the folder slug and branch stay the same)',
            value: c.meta.name,
            run: async (v) => {
              await patch(`/api/projects/${pid}/changes/${c.slug}`, { name: v });
              toast('Renamed — folder and branch unchanged', 'ok');
            },
          })
        }
      >
        <Icon d={I.pencil} />
        Rename
      </button>
      <button
        className="mi"
        onClick={() => {
          selectChange(c.slug);
          showPanel('files', { fileOpen: { ...useStore.getState().fileOpen, briefs: true, [`briefs/${c.slug}`]: true } });
        }}
      >
        <Icon d={I.files} />
        Show in Files
      </button>
      <button
        className="mi"
        disabled={keep === 'all'}
        title={keep === 'all' ? 'Set "History kept" in Settings → Briefs first' : ''}
        onClick={() =>
          openDialog({
            kind: 'confirm',
            title: 'Prune history?',
            body: `Keeps the newest ${keep} versions of each doc type in briefs/${c.slug}/ and deletes the rest. Briefs aren't in git, so the deleted versions are gone for good.`,
            confirm: 'Delete older versions',
            danger: true,
            run: async () => {
              const r = await post<{ removed: string[] }>(`/api/projects/${pid}/changes/${c.slug}/prune`, { keep });
              toast(`Pruned ${r.removed.length} file${r.removed.length === 1 ? '' : 's'}`, 'ok');
            },
          })
        }
      >
        <Icon d={I.trash} />
        Prune history…
      </button>
      {c.meta.worktree && (
        <button
          className="mi"
          onClick={() =>
            openDialog({
              kind: 'confirm',
              title: 'Remove worktree?',
              body: `Runs git worktree remove on ${c.meta.worktree!.path}. The branch ${c.meta.worktree!.branch} and the brief folder stay. Fails if the worktree has uncommitted changes.`,
              confirm: 'Remove worktree',
              danger: true,
              run: async () => {
                try {
                  await post(`/api/projects/${pid}/changes/${c.slug}/worktree/remove`, { force: false });
                  toast('Worktree removed', 'ok');
                } catch (e) {
                  errToast(e);
                }
              },
            })
          }
        >
          <Icon d={I.branch} />
          Remove worktree…
        </button>
      )}
      <div className="msep" />
      {c.meta.archived ? (
        <button className="mi" onClick={() => void archiveChange(c.slug, false)}>
          <Icon d={I.upload} />
          Reopen (un-archive)
        </button>
      ) : (
        <button className="mi" onClick={() => void archiveChange(c.slug, true)}>
          <Icon d={I.archive} />
          Archive
        </button>
      )}
    </Popover>
  );
}

function ChangeCard({ c, expanded, onToggle }: { c: Change; expanded: boolean; onToggle: () => void }) {
  const s = useStore();
  const pid = s.projectId!;
  const [hist, setHist] = useState<Record<string, boolean>>({});
  const [histAll, setHistAll] = useState<Record<string, boolean>>({});
  const m = byType(c.docs);
  const order = (s.registries?.docTypes || []).map((d) => d.slug).filter((t) => m[t]);
  for (const t of Object.keys(m)) if (!order.includes(t)) order.push(t);
  const unread = unreadIn(s, pid, c);
  const statusLine = `${statusWord(c.docs)} · ${relTime(c.activity)}${unread ? ` · ${unread} unread` : ''}`;
  const menuOpen = s.pop === `card:${c.slug}`;
  const selected = curKey(s) === c.slug;
  return (
    <div className={cls('card', selected && 'sel', c.meta.archived && 'arch')} data-testid={`card-${c.slug}`}>
      <div className="crow">
        <button className="crow-main" onClick={onToggle} onDoubleClick={() => selectChange(c.slug)} aria-expanded={expanded}>
          <Icon d={I.right} size={14} cls={cls('chev', expanded && 'open')} />
          <span className="cstack">
            <span className="row" style={{ gap: 7, minWidth: 0 }}>
              <TypeChip type={c.meta.type} />
              <span className="cname">{c.meta.name}</span>
            </span>
            <span className="row" style={{ gap: 8 }}>
              <Dots docs={c.docs} slug={c.slug} />
              <span className="cact">{statusLine}</span>
            </span>
          </span>
        </button>
        <div className="rel">
          <button className="ibtn sm" onClick={() => togglePop(`card:${c.slug}`)} aria-label="Change actions">
            <Icon d={I.kebab} size={14} fat />
          </button>
          {menuOpen && <ChangeMenu c={c} />}
        </div>
      </div>
      {expanded && (
        <div className="doclist">
          <div className="mono dim" style={{ fontSize: 11, padding: '8px 6px 6px' }}>
            briefs/{c.slug}/
          </div>
          {order.map((t) => {
            const vs = m[t];
            const latest = vs[vs.length - 1];
            const older = vs.slice(0, -1).reverse();
            const hk = t;
            const shown = histAll[hk] ? older : older.slice(0, 5);
            const un = isUnread(s, pid, c.slug, latest);
            const tip = `Versions: ${vs.map((v) => pad(v.n)).join(', ')} — current ${pad(latest.n)}`;
            return (
              <div key={t}>
                <button className={cls('docrow', un && 'unread')} onClick={() => openDoc(c.slug, t, latest.n)} title={tip} data-testid={`doc-${c.slug}-${t}`}>
                  <Icon d={I.file} cls={docTypeCls(t)} />
                  <span className="dlabel">{t}</span>
                  <span className="pill cur" title={tip}>
                    {t}-{pad(latest.n)}
                  </span>
                  <span className="time">{shortTime(latest.mtime)}</span>
                  {un && <span className="udot" title="Unread" />}
                </button>
                {older.length > 0 && (
                  <>
                    <button className="histt" onClick={() => setHist({ ...hist, [hk]: !hist[hk] })} aria-expanded={!!hist[hk]}>
                      <Icon d={I.right} size={11} cls={cls('chev', hist[hk] && 'open')} />
                      history ({older.length})
                    </button>
                    {hist[hk] && (
                      <>
                        {shown.map((v) => (
                          <button key={v.n} className="docrow old" onClick={() => openDoc(c.slug, t, v.n)}>
                            <span className="pill">
                              {t}-{pad(v.n)}
                            </span>
                            <span className="time">{shortTime(v.mtime)}</span>
                            {isUnread(s, pid, c.slug, v) && <span className="udot" />}
                          </button>
                        ))}
                        {older.length > 5 && !histAll[hk] && (
                          <button className="histt" style={{ paddingLeft: 30 }} onClick={() => setHistAll({ ...histAll, [hk]: true })}>
                            … {older.length - 5} older — show all
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {!order.length && <div className="dim" style={{ fontSize: 12, padding: 6 }}>No docs yet.</div>}
        </div>
      )}
    </div>
  );
}

export function BriefsPanel({ mobile }: { mobile?: boolean }) {
  const s = useStore();
  const [mode, setMode] = useState<'active' | 'all' | 'status'>('active');
  const all = mode === 'all';
  const [archOpen, setArchOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const changes = changesOf(s, s.projectId);
  const active = changes.filter((c) => !c.meta.archived);
  const archived = changes.filter((c) => c.meta.archived);
  const cur = curKey(s);
  const isExp = (slug: string) => expanded[slug] ?? slug === cur;
  const toggle = (slug: string) => setExpanded({ ...expanded, [slug]: !isExp(slug) });
  const newChange = () => openDialog({ kind: 'new' });
  const list = all ? changes : active;
  const header = (
    <>
      <Seg
        value={mode}
        onChange={setMode}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'all', label: 'All' },
          { value: 'status', label: 'By status', title: 'Active changes grouped by derived status (a board in the side panel)' },
        ]}
      />
      {!mobile && (
        <button className="btn primary sm" onClick={newChange} disabled={!s.projectId}>
          <Icon d={I.plus} size={14} />
          New
        </button>
      )}
    </>
  );
  return (
    <>
      {!mobile && (
        <div className="phead">
          <div className="ptitle">Briefs</div>
          {header}
        </div>
      )}
      <div className="pbody">
        {mobile && (
          <>
            <button className="btn primary full" style={{ marginBottom: 10 }} onClick={newChange} disabled={!s.projectId}>
              <Icon d={I.plus} size={17} />
              New change
            </button>
            <div style={{ marginBottom: 10 }}>{header}</div>
          </>
        )}
        {!s.projectId ? (
          <Empty icon={I.files} title="No project open">
            Open a project folder first — its briefs/ folder shows up here.
          </Empty>
        ) : !changes.length ? (
          <Empty
            icon={I.briefs}
            title="No changes yet"
            action={
              <button className="btn primary" onClick={newChange}>
                Create your first change
              </button>
            }
          >
            A change is one bug, story or spike. It owns a brief folder that your agents read and write.
          </Empty>
        ) : null}
        {mode !== 'status' &&
          list.map((c) => <ChangeCard key={c.slug} c={c} expanded={isExp(c.slug)} onToggle={() => toggle(c.slug)} />)}
        {mode === 'status' &&
          FLOW.map((step, i) => {
            const cards = active.filter((c) => placedStep(c) === step);
            return (
              <div className="statgroup" key={step}>
                <div className="secthead">
                  <span className={cls('dot', cards.length ? 'on' : '', i === 4 && cards.length ? 'done' : '')} />
                  {step} ({cards.length})
                </div>
                {cards.map((c) => (
                  <ChangeCard key={c.slug} c={c} expanded={isExp(c.slug)} onToggle={() => toggle(c.slug)} />
                ))}
              </div>
            );
          })}
        {mode === 'active' && archived.length > 0 && (
          <>
            <button className="secthead" onClick={() => setArchOpen(!archOpen)} aria-expanded={archOpen}>
              <Icon d={I.right} size={12} cls={cls('chev', archOpen && 'open')} />
              Archived ({archived.length})
            </button>
            {archOpen &&
              archived.map((c) => (
                <div className="card arch" key={c.slug}>
                  <div className="crow">
                    <button className="crow-main" onClick={() => toggle(c.slug)}>
                      <span className="cstack">
                        <span className="row" style={{ gap: 7, minWidth: 0 }}>
                          <TypeChip type={c.meta.type} />
                          <span className="cname">{c.meta.name}</span>
                        </span>
                        <span className="row" style={{ gap: 8 }}>
                          <Dots docs={c.docs} slug={c.slug} />
                          <span className="cact">
                            {statusWord(c.docs)} · {relTime(c.activity)}
                          </span>
                        </span>
                      </span>
                    </button>
                    <button className="ibtn sm" onClick={() => void archiveChange(c.slug, false)} aria-label="Reopen" title="Reopen (un-archive)">
                      <Icon d={I.upload} size={14} />
                    </button>
                    <button className="ibtn sm" onClick={() => deleteChange(c)} aria-label="Delete" title="Delete this change for good" data-testid={`delete-${c.slug}`}>
                      <Icon d={I.trash} size={14} />
                    </button>
                  </div>
                </div>
              ))}
          </>
        )}
      </div>
      {!mobile && (
        <div className="pfoot row" style={{ gap: 8 }}>
          <span className="dim grow ell" title="A dot lights once the brief exists and once each CLI tab has run a prompt. Changes without tabs show brief · findings · plan · code · review.">Dots: the brief, then each CLI tab</span>
          <button className="link" style={{ whiteSpace: 'nowrap' }} onClick={() => showPanel('setups', { setupsSeg: 'dt' })}>
            Type manager →
          </button>
        </div>
      )}
    </>
  );
}

