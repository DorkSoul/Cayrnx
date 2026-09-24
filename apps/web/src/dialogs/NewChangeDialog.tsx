import { useState } from 'react';
import { branchFor, editingRoles, seedReadMsg, sharedFolderWarning, slugify, type Change, type TabStatus } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { post } from '../api.ts';
import { changesOf, closeDialog, curProject, errToast, openDialog, setActive, showPanel, stage, toast, useStore } from '../store.ts';
import { Check, Dialog, LayoutChip, MiniTile, Switch } from '../components/common.tsx';
import { cls } from '../util.ts';

const BRIEF_HINTS: Record<string, string> = {
  bug: "What's broken: what you see, what you expected, how to reproduce it, anything you've already tried.",
  story: 'What to build: who it is for, what it should do, and how you will know it is done.',
  spike: 'What to find out: the question, the options worth comparing, and how long to spend.',
};

export function NewChangeDialog() {
  const s = useStore();
  const p = curProject(s);
  const reg = s.registries!;
  const [type, setType] = useState(reg.changeTypes[0]?.id || 'bug');
  const ct = reg.changeTypes.find((c) => c.id === type);
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // Off by default: tabs run in the project folder, like terminals opened there (Settings → Briefs).
  const [worktree, setWorktree] = useState(!!p?.isGit && !!s.settings?.briefs.worktreeDefault);
  const [layout, setLayout] = useState<string>(ct?.layout || 'none');
  const [seed, setSeed] = useState(false);
  const [adv, setAdv] = useState(false);
  const [busy, setBusy] = useState(false);
  const nm = slugify(name);
  const slug = `${type}-${nm || 'name'}`;
  const L = reg.layouts.find((l) => l.id === layout);
  const clash = L ? sharedFolderWarning(editingRoles(L.tabs)) : null;
  const wt = worktree && !!p?.isGit;
  const exists = changesOf(s, s.projectId).some((c) => c.slug === `${type}-${nm}`);
  const pickType = (id: string) => {
    setType(id);
    setLayout(reg.changeTypes.find((c) => c.id === id)?.layout || 'none');
  };
  const create = async () => {
    if (!p) return;
    if (!nm) return setErr('Give the change a name — it becomes the folder and branch.');
    if (exists) return setErr(`briefs/${slug}/ already exists.`);
    setBusy(true);
    try {
      const r = await post<{ change: Change; tabs: TabStatus[]; warning: string | null }>(`/api/projects/${p.id}/changes`, { type, name, worktree, layout: L ? L.id : null, seed, brief });
      useStore.setState((st) => ({
        changes: { ...st.changes, [p.id]: [r.change, ...(st.changes[p.id] || []).filter((c) => c.slug !== r.change.slug)] },
        current: { ...st.current, [p.id]: r.change.slug },
        tabs: { ...st.tabs, ...Object.fromEntries(r.tabs.map((t) => [t.id, t])) },
      }));
      if (seed) for (const t of r.tabs) stage(t.id, seedReadMsg(r.change.slug), 1);
      if (r.tabs[0]) setActive(r.tabs[0].id);
      closeDialog();
      if (!s.isMobile) showPanel('briefs');
      const failed = r.tabs.filter((t) => t.proc === 'failed').length;
      toast(r.tabs.length ? `Change created · ${r.tabs.length} tab${r.tabs.length > 1 ? 's' : ''} launching${failed ? ` (${failed} failed)` : ''}` : `Change created · briefs/${r.change.slug}/brief-001.md`, failed ? 'warn' : 'ok');
      if (r.warning) toast(r.warning, 'warn');
    } catch (e) {
      errToast(e);
    } finally {
      setBusy(false);
    }
  };
  const cta = L ? `Create change & launch ${L.tabs.length} tab${L.tabs.length > 1 ? 's' : ''}` : 'Create change';
  return (
    <Dialog
      title="New change"
      onClose={closeDialog}
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void create()} disabled={busy} data-testid="create-change">
            {cta}
          </button>
        </>
      }
    >
      <div className="dbody">
        <div className="field">
          <span className="flabel">Type</span>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {reg.changeTypes.map((c) => (
              <button key={c.id} className={cls('optcard', type === c.id && 'on')} onClick={() => pickType(c.id)} aria-pressed={type === c.id}>
                <span className="cdot" style={{ background: c.color }} />
                <span style={{ fontWeight: 600 }}>{c.id}</span>
                <span className="dim grow" style={{ fontSize: 11, textAlign: 'right' }}>
                  {c.layout || ''}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="flabel" htmlFor="nc-name">
            Name
          </label>
          <input
            id="nc-name"
            type="text"
            className={err ? 'inerr' : ''}
            placeholder="e.g. login timeout"
            value={name}
            autoFocus
            onChange={(e) => (setName(e.target.value), setErr(null))}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
          />
          {err && <span className="ferr">{err}</span>}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="slug">briefs/{slug}/</span>
            <span className="dim" style={{ fontSize: 11.5 }}>
              + brief-001.md from the {type} template
            </span>
          </div>
        </div>
        <div className="field">
          <label className="flabel" htmlFor="nc-brief">
            Brief
          </label>
          <textarea
            id="nc-brief"
            className="briefbox"
            rows={5}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && void create()}
            placeholder={BRIEF_HINTS[type] || 'What is this change about? What you would tell the CLIs in your first prompt.'}
            data-testid="nc-brief"
          />
          <span className="fhelp">Saved in brief-001.md, so you can always look back at what this change was for. Send it to a tab with Read → brief.</span>
        </div>
        <div className="field">
          <div className="row" style={{ gap: 10 }}>
            <span className="flabel grow">Worktree</span>
            <span title={p?.isGit ? '' : 'Not a git repository'}>
              <Switch on={worktree && !!p?.isGit} onChange={setWorktree} label="Create worktree" disabled={!p?.isGit} />
            </span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Icon d={I.branch} size={13} cls="dim" />
            <span className="mono" style={{ fontSize: 12 }}>
              {wt ? `${branchFor(slug)}  (new branch from the current HEAD)` : `${p?.path || 'the project folder'} — your current branch`}
            </span>
          </div>
          <span className="fhelp">
            {!p?.isGit
              ? 'Not a git repository — the tabs run in the project folder.'
              : wt
                ? "The tabs work in a separate checkout under Cayrnx's worktrees folder, on their own branch. Your project folder doesn't see their edits or commits until you merge that branch (or pull after they push it)."
                : "The tabs run in the project folder, like terminals you opened there: edits and commits land on your current branch. Turn this on to keep the change's work on its own branch in a separate checkout."}
          </span>
        </div>
        <div className="field">
          <span className="flabel">Layout</span>
          <div className="seg" style={{ flexWrap: 'wrap' }}>
            {[...reg.layouts.map((l) => l.id), 'none'].map((id) => (
              <button key={id} className={cls(layout === id && 'on')} onClick={() => setLayout(id)}>
                {id === 'none' ? 'No tabs' : id}
              </button>
            ))}
          </div>
          <div className="lcard" style={{ margin: '4px 0 0', display: 'flex', gap: 12, alignItems: 'center' }}>
            {L ? (
              <>
                <MiniTile areas={L.areas} tabs={L.tabs} />
                <div className="tchips grow">
                  {L.tabs.map((t, i) => (
                    <LayoutChip key={i} t={t} />
                  ))}
                </div>
                <button className="link nowrap" style={{ fontSize: 12 }} onClick={() => openDialog({ kind: 'layout', layout: L, isNew: false })} title="Change which CLI, model and permissions each role uses">
                  Edit roles
                </button>
              </>
            ) : (
              <span className="dim" style={{ fontSize: 12 }}>
                No tabs — add them later from the tab strip.
              </span>
            )}
          </div>
          {clash && (
            <div className="clashnote" data-testid="clash-note">
              <Icon d={I.warn} size={13} />
              <span>{clash}</span>
            </div>
          )}
        </div>
        <button className="histt" style={{ paddingLeft: 0, fontSize: 12 }} onClick={() => setAdv(!adv)}>
          <Icon d={I.right} size={11} cls={cls('chev', adv && 'open')} />
          First tab seed (advanced)
        </button>
        {adv && (
          <>
            <button className="row" onClick={() => setSeed(!seed)} style={{ gap: 8, padding: '8px 0 4px' }} aria-pressed={seed}>
              <Check on={seed} />
              <span>
                Stage <span className="mono">Read brief-001</span> in each new tab's composer
              </span>
            </button>
            <div className="fhelp" style={{ paddingLeft: 24, marginBottom: 8 }}>
              Off by default — reads never auto-send.
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
