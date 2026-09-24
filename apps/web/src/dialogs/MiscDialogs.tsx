import { useState } from 'react';
import { ADAPTERS, layoutSchema, previewLaunch, slugify, spec as mkSpec, type Layout, type LayoutTab, type TabLaunchSpec, type TabStatus } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { post } from '../api.ts';
import { changesOf, closeDialog, curChange, curProject, errToast, saveRegistry, termTabsFor, toast, useStore, type Dialog as D } from '../store.ts';
import { Check, Dialog, Glyph, MiniTile } from '../components/common.tsx';
import { LaunchFields } from '../components/LaunchFields.tsx';
import { AREA_PRESETS } from '../panels/SetupsPanel.tsx';
import { cls, readFileText } from '../util.ts';
import { FolderPicker } from './FolderPicker.tsx';

/* ---------------- confirm / rename ---------------- */

export function ConfirmDialog({ d }: { d: Extract<D, { kind: 'confirm' }> }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await d.run();
      closeDialog();
    } catch (e) {
      errToast(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={d.title}
      width={460}
      onClose={closeDialog}
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button className={d.danger ? 'btn danger' : 'btn primary'} onClick={() => void run()} disabled={busy} data-testid="confirm">
            {d.confirm}
          </button>
        </>
      }
    >
      <div className="dbody" style={{ paddingBottom: 14, lineHeight: 1.55 }}>
        {d.body}
      </div>
    </Dialog>
  );
}

export function RenameDialog({ d }: { d: Extract<D, { kind: 'rename' }> }) {
  const [v, setV] = useState(d.value);
  const run = async () => {
    try {
      await d.run(v);
      closeDialog();
    } catch (e) {
      errToast(e);
    }
  };
  return (
    <Dialog
      title={d.title}
      width={460}
      onClose={closeDialog}
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void run()}>
            Save
          </button>
        </>
      }
    >
      <div className="dbody">
        <div className="field">
          <label className="flabel" htmlFor="rn">
            {d.label}
          </label>
          <input id="rn" type="text" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} autoFocus />
        </div>
      </div>
    </Dialog>
  );
}

/* ---------------- S14 directory switch ---------------- */

export function DirSwitchDialog() {
  const s = useStore();
  const p = curProject(s)!;
  const c = curChange(s)!;
  const tabs = termTabsFor(s, p.id, c.slug).filter((t) => t.kind === 'term');
  const [dir, setDir] = useState(c.meta.worktree && c.cwd === c.meta.worktree.path ? p.path : c.meta.worktree?.path || p.path);
  const [browse, setBrowse] = useState(false);
  const [busy, setBusy] = useState(false);
  const others = changesOf(s, p.id).filter((x) => x.slug !== c.slug && !x.meta.archived);
  const conflict = others.find((x) => x.cwd.replace(/\/$/, '') === dir.replace(/\/$/, '') && x.cwd !== p.path);
  const sugg = [p.path, ...(c.meta.worktree ? [c.meta.worktree.path] : []), ...others.filter((x) => x.meta.worktree).map((x) => x.meta.worktree!.path)].filter((v, i, a) => a.indexOf(v) === i);
  const go = async () => {
    setBusy(true);
    try {
      const r = await post<{ tabs: TabStatus[] }>(`/api/projects/${p.id}/changes/${c.slug}/cwd`, { cwd: dir });
      toast(`Switched directory · ${r.tabs.length} tab${r.tabs.length === 1 ? '' : 's'} relaunching`, 'ok');
      closeDialog();
    } catch (e) {
      errToast(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Change working directory?"
      onClose={closeDialog}
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void go()} disabled={busy || dir === c.cwd}>
            Switch &amp; relaunch tabs
          </button>
        </>
      }
    >
      <div className="dbody">
        <div className="cmd" style={{ marginBottom: 6, color: 'var(--muted)' }}>
          {c.cwd}
        </div>
        <div className="dim" style={{ textAlign: 'center', margin: '2px 0' }}>
          ↓
        </div>
        <div className="row" style={{ gap: 6, marginBottom: 10 }}>
          <input type="text" className="mono grow" style={{ height: 36, fontSize: 12 }} value={dir} onChange={(e) => setDir(e.target.value)} aria-label="New directory" />
          <button className="btn sm" onClick={() => setBrowse(!browse)}>
            Browse
          </button>
        </div>
        {browse && <FolderPicker start={dir} onPick={(d) => (setDir(d), setBrowse(false))} height={160} />}
        <div className="row" style={{ gap: 4, flexWrap: 'wrap', margin: '4px 0 14px' }}>
          {sugg.map((x) => (
            <button key={x} className="sugg" onClick={() => setDir(x)} title={x}>
              {x.length > 48 ? '…' + x.slice(-46) : x}
            </button>
          ))}
        </div>
        <div className="flabel" style={{ marginBottom: 8 }}>
          What happens
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <div className="row" style={{ gap: 8 }}>
            <Check on />
            Relaunch {tabs.length} tab{tabs.length === 1 ? '' : 's'} in the new directory
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Check on />
            Resume sessions where supported (claude / codex / opencode)
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Check on />
            Brief attachment unchanged — still briefs/{c.slug}/
          </div>
        </div>
        {conflict && (
          <div className="warnrow amber">
            <Icon d={I.warn} />
            <span>
              That directory is the worktree of <b>{conflict.slug}</b>. Tabs from both changes would edit the same checkout.
            </span>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* ---------------- layout import (with missing custom types) ---------------- */

export function ImportLayoutDialog({ text: initial }: { text?: string }) {
  const reg = useStore((s) => s.registries)!;
  const [text, setText] = useState(initial || '');
  const parsed = (() => {
    if (!text.trim()) return null;
    try {
      const j = JSON.parse(text);
      const r = layoutSchema.safeParse(j.layout || j);
      return r.success ? { layout: r.data as Layout } : { error: r.error.issues[0]?.message || 'Not a layout' };
    } catch (e: any) {
      return { error: `Invalid JSON: ${e.message}` };
    }
  })();
  const layout = parsed && 'layout' in parsed ? parsed.layout : null;
  const missing = layout ? layout.custom.filter((t) => !reg.docTypes.some((d) => d.slug === t)) : [];
  const importIt = async (addTypes: boolean) => {
    if (!layout) return;
    let id = layout.id;
    for (let i = 2; reg.layouts.some((l) => l.id === id); i++) id = `${layout.id}-${i}`;
    const L = { ...layout, id, custom: addTypes ? layout.custom : layout.custom.filter((t) => !missing.includes(t)) };
    if (addTypes && missing.length) {
      const ok = await saveRegistry('docTypes', [...reg.docTypes, ...missing.map((slug) => ({ slug, mode: 'superseding' as const, keep: 'all' as const, cap: '4 KB', builtin: false }))]);
      if (!ok) return;
    }
    if (await saveRegistry('layouts', [...useStore.getState().registries!.layouts, L])) {
      toast(`Imported ${L.name}${addTypes && missing.length ? ` · added ${missing.join(', ')}` : ''}`, 'ok');
      closeDialog();
    }
  };
  return (
    <Dialog
      title="Import layout"
      width={520}
      onClose={closeDialog}
      footer={
        <>
          <span className="grow" />
          {missing.length > 0 ? (
            <>
              <button className="btn" onClick={() => void importIt(false)}>
                Skip
              </button>
              <button className="btn primary" onClick={() => void importIt(true)}>
                Add types &amp; import
              </button>
            </>
          ) : (
            <button className="btn primary" onClick={() => void importIt(false)} disabled={!layout}>
              Import
            </button>
          )}
        </>
      }
    >
      <div className="dbody">
        <div className="row" style={{ gap: 8, marginBottom: 8 }}>
          <button className="btn sm" onClick={() => void readFileText().then((t) => t && setText(t))}>
            <Icon d={I.upload} size={13} />
            Choose file…
          </button>
          <span className="dim" style={{ fontSize: 12 }}>
            or paste the JSON below
          </span>
        </div>
        <textarea className="mono" rows={8} style={{ width: '100%', fontSize: 11.5, padding: 10 }} value={text} onChange={(e) => setText(e.target.value)} placeholder='{ "id": "perf-sweep", "name": "perf-sweep", "tabs": [...] }' aria-label="Layout JSON" />
        {parsed && 'error' in parsed && <div className="ferr" style={{ marginTop: 6 }}>{parsed.error}</div>}
        {layout && (
          <div className="lcard" style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
            <MiniTile areas={layout.areas} tabs={layout.tabs} />
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{layout.name}</div>
              <div className="dim" style={{ fontSize: 12 }}>
                {layout.tabs.length} tab{layout.tabs.length === 1 ? '' : 's'} · {layout.tabs.map((t) => t.role || t.service).join(' / ')}
              </div>
            </div>
          </div>
        )}
        {missing.length > 0 && (
          <div className="warnrow info" style={{ marginTop: 8 }}>
            <Icon d={I.info} />
            <span>
              This layout uses {missing.length} custom type{missing.length > 1 ? 's' : ''} you don't have: <b>{missing.join(', ')}</b>. Add them?
            </span>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* ---------------- layout editor ---------------- */

const AREAS = 'abcdef';

/**
 * Edit a layout (S4): which CLI each role uses and how it's configured — the same fields as
 * Add CLI, one role at a time — plus the tile arrangement and custom doc types.
 */
export function LayoutEditDialog({ layout: initial, isNew }: { layout: Layout; isNew: boolean }) {
  const s = useStore();
  const reg = s.registries!;
  const [name, setName] = useState(initial.name);
  const [desc, setDesc] = useState(initial.desc);
  const [tabs, setTabs] = useState<LayoutTab[]>(initial.tabs.length ? initial.tabs : [{ ...mkSpec({ service: 'claude', role: 'planner', model: 'sonnet' }), area: 'a' }]);
  const [areas, setAreas] = useState(initial.areas);
  const [custom, setCustom] = useState<string[]>(initial.custom);
  const [sel, setSel] = useState(0);
  const cur = tabs[Math.min(sel, tabs.length - 1)];
  const relabel = (list: LayoutTab[], keepAreas = false) => {
    const next = list.map((t, i) => ({ ...t, area: AREAS[i] }));
    setTabs(next);
    if (!keepAreas) setAreas(AREA_PRESETS[next.length] || "'a'");
  };
  const updCur = (spec: TabLaunchSpec) => setTabs(tabs.map((t, i) => (i === sel ? { ...spec, area: t.area } : t)));
  const move = (d: -1 | 1) => {
    const j = sel + d;
    if (j < 0 || j >= tabs.length) return;
    const list = [...tabs];
    [list[sel], list[j]] = [list[j], list[sel]];
    relabel(list, true);
    setSel(j);
  };
  const save = async () => {
    const id = isNew ? slugify(name) : initial.id;
    if (!id) return toast('Give the layout a name', 'warn');
    if (isNew && reg.layouts.some((l) => l.id === id)) return toast(`A layout called ${id} exists`, 'warn');
    const L: Layout = { id, name: name.trim() || id, desc, areas, tabs: tabs.map((t) => ({ ...t, role: t.role.trim() || t.service })), custom };
    const list = isNew ? [...reg.layouts, L] : reg.layouts.map((l) => (l.id === initial.id ? L : l));
    if (await saveRegistry('layouts', list)) {
      toast(`${isNew ? 'Saved' : 'Updated'} layout ${L.name} — applies to tabs launched from now on`, 'ok');
      closeDialog();
    }
  };
  const customTypes = reg.docTypes.filter((d) => !d.builtin);
  const svc = s.settings!.services[cur.service];
  const preview = previewLaunch(
    ADAPTERS[cur.service].buildLaunch({ spec: cur, cwd: '<change dir>', bin: svc.bin, briefsDir: '<project>/briefs', sessionId: ADAPTERS[cur.service].assignsSessionId ? '<new-uuid>' : null, extraArgs: svc.extraArgs, hook: svc.hooks && ADAPTERS[cur.service].hookNote ? ['node', '$CAYRNX_HOME/hook.mjs', '<url>'] : null }),
    { cdForm: cur.service === 'claude', abbreviate: 160 },
  );
  const usedBy = reg.changeTypes.filter((c) => c.layout === initial.id).map((c) => c.id);
  return (
    <Dialog
      title={isNew ? 'New layout' : `Edit layout ${initial.name}`}
      width={900}
      onClose={closeDialog}
      footer={
        <>
          <span className="grow dim" style={{ fontSize: 12 }}>
            {usedBy.length ? `Default for new ${usedBy.join(', ')} changes. ` : ''}Running tabs keep their settings — use Edit launch settings on a tab to change it now.
          </span>
          <button className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void save()} disabled={!tabs.length} data-testid="save-layout">
            Save layout
          </button>
        </>
      }
    >
      <div className="dbody">
        <div style={{ display: 'grid', gridTemplateColumns: s.isMobile ? '1fr' : '1fr 2fr', gap: 12 }}>
          <div className="field">
            <label className="flabel" htmlFor="le-name">
              Name
            </label>
            <input id="le-name" type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={!isNew} />
          </div>
          <div className="field">
            <label className="flabel" htmlFor="le-desc">
              Description
            </label>
            <input id="le-desc" type="text" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: s.isMobile ? 'wrap' : 'nowrap', alignItems: 'flex-start' }}>
          <div style={{ width: s.isMobile ? '100%' : 240, flexShrink: 0 }}>
            <div className="flabel" style={{ marginBottom: 6 }}>
              Roles
            </div>
            {tabs.map((t, i) => (
              <button key={i} className={cls('rpop-row', i === sel && 'on')} onClick={() => setSel(i)} style={{ height: 40 }} data-testid={`le-role-${i}`}>
                <Glyph service={t.service} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="ell" style={{ display: 'block', fontWeight: 500 }}>
                    {t.role || t.service}
                  </span>
                  <span className="dim ell" style={{ display: 'block', fontSize: 11 }}>
                    {t.service} · {t.model || 'default'}
                    {t.effort ? ` · ${t.effort}` : ''}
                  </span>
                </span>
                <span className="pill">{t.area}</span>
              </button>
            ))}
            <div className="row" style={{ gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              <button className="btn sm" onClick={() => (relabel([...tabs, { ...mkSpec({ service: 'claude', role: '' }), area: 'a' }]), setSel(tabs.length))} disabled={tabs.length >= 6} data-testid="le-add">
                <Icon d={I.plus} size={13} />
                Add role
              </button>
              <button className="ibtn sm" onClick={() => (relabel([...tabs, { ...cur }]), setSel(tabs.length))} disabled={tabs.length >= 6} title="Duplicate role" aria-label="Duplicate role">
                <Icon d={I.copy} size={13} />
              </button>
              <button className="ibtn sm" onClick={() => move(-1)} disabled={sel === 0} title="Move up" aria-label="Move up" style={{ transform: 'rotate(180deg)' }}>
                <Icon d={I.down} size={13} />
              </button>
              <button className="ibtn sm" onClick={() => move(1)} disabled={sel >= tabs.length - 1} title="Move down" aria-label="Move down">
                <Icon d={I.down} size={13} />
              </button>
              <button className="ibtn sm" onClick={() => (relabel(tabs.filter((_, j) => j !== sel)), setSel(Math.max(0, sel - 1)))} disabled={tabs.length <= 1} title="Remove role" aria-label="Remove role">
                <Icon d={I.trash} size={13} />
              </button>
            </div>
            <div className="flabel" style={{ margin: '14px 0 6px' }}>
              Tiles
            </div>
            <div className="row" style={{ gap: 8 }}>
              <MiniTile areas={areas} tabs={tabs} />
              <input type="text" className="mono grow" style={{ height: 28, fontSize: 11.5, minWidth: 0 }} value={areas} onChange={(e) => setAreas(e.target.value)} aria-label="Tile areas" title="CSS grid-template-areas for the tiled view; letters are the roles in order" />
            </div>
          </div>
          <div className="grow" style={{ minWidth: 0, borderLeft: s.isMobile ? 0 : '1px solid var(--line)', paddingLeft: s.isMobile ? 0 : 16 }}>
            <div className="field">
              <label className="flabel" htmlFor="le-role">
                Role label
              </label>
              <input id="le-role" type="text" value={cur.role} placeholder={cur.service} onChange={(e) => updCur({ ...cur, role: e.target.value })} />
              <span className="fhelp">A sticker — names and colours the tab, never automates anything.</span>
            </div>
            <LaunchFields key={sel} spec={cur} onChange={updCur} idPrefix="le" showService wide={false} />
            <div className="mlabel" style={{ padding: '4px 0 6px' }}>
              Command this role launches
            </div>
            <div className="cmd" data-testid="le-preview">
              {preview}
            </div>
          </div>
        </div>
        {customTypes.length > 0 && (
          <>
            <div className="flabel" style={{ margin: '14px 0 6px' }}>
              Custom doc types this layout uses
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {customTypes.map((d) => (
                <button key={d.slug} className={custom.includes(d.slug) ? 'sugg on' : 'sugg'} onClick={() => setCustom(custom.includes(d.slug) ? custom.filter((x) => x !== d.slug) : [...custom, d.slug])}>
                  {d.slug}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
