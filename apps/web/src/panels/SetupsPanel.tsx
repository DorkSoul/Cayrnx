import { useEffect, useState } from 'react';
import { DOC_GUIDES, docGuide, slugify, type ChangeType, type DocType, type Layout, type Registries } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { applyLayout, curChange, curKey, openDialog, saveRegistry, termTabsFor, toast, useStore } from '../store.ts';
import { Empty, LayoutChip, MiniTile, Seg, docTypeCls } from '../components/common.tsx';
import { CodeEditor } from '../components/CodeEditor.tsx';
import { cls, downloadJson } from '../util.ts';

export const AREA_PRESETS: Record<number, string> = {
  1: "'a'",
  2: "'a b'",
  3: "'a b' 'a c'",
  4: "'a b' 'c d'",
  5: "'a b c' 'd e e'",
  6: "'a b c' 'd e f'",
};
const AREAS = 'abcdef';

export function snapshotLayout(): void {
  const s = useStore.getState();
  const terms = termTabsFor(s, s.projectId, curKey(s)).filter((t) => t.kind === 'term');
  if (!terms.length) {
    toast('No terminal tabs to snapshot', 'warn');
    return;
  }
  const c = curChange(s);
  const n = (s.registries?.layouts.length || 0) + 1;
  const tabs = terms.slice(0, 6).map((t, i) => ({ ...t.spec, area: AREAS[i] }));
  const layout: Layout = { id: `snapshot-${n}`, name: `snapshot-${n}`, desc: `Captured from ${c ? c.slug : 'workspace'} — edit to rename.`, areas: AREA_PRESETS[tabs.length], tabs, custom: [] };
  openDialog({ kind: 'layout', layout, isNew: true });
}

const COLORS = ['var(--red)', 'var(--blue)', 'var(--purple)', 'var(--teal)', 'var(--accent)', 'var(--green)'];

function LayoutsSeg() {
  const s = useStore();
  const reg = s.registries!;
  const cur = curChange(s);
  const del = (l: Layout) =>
    openDialog({
      kind: 'confirm',
      title: `Delete layout ${l.name}?`,
      body: 'Changes that used it keep their tabs; new changes of a type bound to it will start with no tabs.',
      confirm: 'Delete layout',
      danger: true,
      run: async () => {
        if (await saveRegistry('layouts', reg.layouts.filter((x) => x.id !== l.id))) toast(`Deleted layout ${l.name}`, 'info');
      },
    });
  const dup = async (l: Layout) => {
    let id = `${l.id}-copy`;
    for (let i = 2; reg.layouts.some((x) => x.id === id); i++) id = `${l.id}-copy-${i}`;
    if (await saveRegistry('layouts', [...reg.layouts, { ...l, id, name: id }])) toast(`Duplicated ${l.name}`, 'ok');
  };
  return (
    <>
      <div className="row" style={{ gap: 6, marginBottom: 10 }}>
        <button className="btn primary sm grow" onClick={snapshotLayout} style={{ justifyContent: 'center' }}>
          <Icon d={I.camera} size={14} />
          Snapshot current tabs
        </button>
        <button className="btn sm" onClick={() => openDialog({ kind: 'import' })}>
          <Icon d={I.upload} size={14} />
          Import
        </button>
        <button
          className="btn sm ghost"
          title="New empty layout"
          onClick={() => openDialog({ kind: 'layout', isNew: true, layout: { id: '', name: '', desc: '', areas: "'a'", tabs: [{ service: 'claude', role: 'planner', model: 'sonnet', effort: '', agent: '', claudePerm: 'plan', area: 'a' }], custom: [] } })}
        >
          <Icon d={I.plus} size={14} />
        </button>
      </div>
      {!reg.layouts.length && (
        <div className="empty" style={{ padding: '24px 10px' }}>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No layouts yet</div>
          <div style={{ fontSize: 12 }}>Open some tabs, then snapshot them — or import a layout JSON.</div>
        </div>
      )}
      {reg.layouts.map((l) => (
        <div className="lcard" key={l.id} data-testid={`layout-${l.id}`}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <MiniTile areas={l.areas} tabs={l.tabs} />
            <div className="grow">
              <div className="row" style={{ gap: 6 }}>
                <span style={{ fontWeight: 600 }}>{l.name}</span>
                {cur?.meta.layout === l.id && <span className="pill">in use</span>}
              </div>
              <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>
                {l.desc}
              </div>
            </div>
          </div>
          <div className="tchips" style={{ marginTop: 10 }}>
            {l.tabs.map((t, i) => (
              <LayoutChip key={i} t={t} />
            ))}
          </div>
          {l.custom.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11.5 }} className="row">
              <span className="tchip tc-custom">+{l.custom.length} custom type{l.custom.length > 1 ? 's' : ''}</span>
              <span className="dim" style={{ marginLeft: 6 }}>
                {l.custom.join(', ')}
              </span>
            </div>
          )}
          <div className="row" style={{ gap: 2, marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <button className="btn sm primary" onClick={() => void applyLayout(l.id)} disabled={!cur} title={cur ? `Launch these tabs in ${cur.slug}` : 'Pick a change first'}>
              Apply to change
            </button>
            <span className="grow" />
            <button className="ibtn sm" onClick={() => openDialog({ kind: 'layout', layout: l, isNew: false })} aria-label="Edit" title="Edit">
              <Icon d={I.pencil} size={14} />
            </button>
            <button className="ibtn sm" onClick={() => void dup(l)} aria-label="Duplicate" title="Duplicate">
              <Icon d={I.copy} size={14} />
            </button>
            <button className="ibtn sm" onClick={() => downloadJson(`${l.id}.layout.json`, l)} aria-label="Export JSON" title="Export JSON">
              <Icon d={I.write} size={14} />
            </button>
            <button className="ibtn sm" onClick={() => del(l)} aria-label="Delete" title="Delete">
              <Icon d={I.trash} size={14} />
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

function ChangeTypeRow({ ct, open, onToggle }: { ct: ChangeType; open: boolean; onToggle: () => void }) {
  const reg = useStore((s) => s.registries)!;
  const [tpl, setTpl] = useState(ct.tpl);
  useEffect(() => setTpl(ct.tpl), [ct.tpl]);
  const upd = (p: Partial<ChangeType>) => saveRegistry('changeTypes', reg.changeTypes.map((x) => (x.id === ct.id ? { ...x, ...p } : x)));
  return (
    <div className="lcard" style={{ padding: 0 }}>
      <button className="row" onClick={onToggle} style={{ gap: 8, width: '100%', padding: '10px 12px' }} aria-expanded={open}>
        <span className="cdot" style={{ background: ct.color }} />
        <span style={{ fontWeight: 600 }}>{ct.id}</span>
        <span className="dim grow" style={{ fontSize: 11.5 }}>
          default layout · {ct.layout || 'none'}
        </span>
        <Icon d={I.right} size={13} cls={cls('chev', open && 'open')} />
      </button>
      {open && (
        <div style={{ padding: '4px 12px 12px', borderTop: '1px solid var(--line)' }}>
          <div className="field" style={{ marginTop: 10 }}>
            <span className="flabel">Name</span>
            <input type="text" value={ct.id} readOnly aria-label="Change type name" />
          </div>
          <div className="field">
            <span className="flabel">Slug preview</span>
            <span className="slug">
              {ct.id}-login-timeout → briefs/{ct.id}-login-timeout/
            </span>
          </div>
          <div className="field">
            <span className="flabel">brief-001 template</span>
            <textarea rows={8} className="mono" style={{ fontSize: 11.5 }} value={tpl} onChange={(e) => setTpl(e.target.value)} aria-label="Brief template" />
            <span className="fhelp">
              Placeholders: <span className="mono">{'{{name}} {{branch}} {{type}} {{date}} {{brief}}'}</span> ({'{{brief}}'} = the Brief typed in New change; without it that text goes in a "Request" section); any other <span className="mono">{'{{x}}'}</span> becomes [fill in].
            </span>
            {tpl !== ct.tpl && (
              <div className="row" style={{ gap: 6 }}>
                <button className="btn sm primary" onClick={() => void upd({ tpl }).then((ok) => ok && toast('Template saved', 'ok'))}>
                  Save template
                </button>
                <button className="btn sm ghost" onClick={() => setTpl(ct.tpl)}>
                  Revert
                </button>
              </div>
            )}
          </div>
          <div className="field">
            <span className="flabel">Default layout</span>
            <div className="seg" style={{ flexWrap: 'wrap' }}>
              {[...reg.layouts.map((l) => l.id), 'none'].map((lid) => (
                <button key={lid} className={cls((ct.layout || 'none') === lid && 'on')} onClick={() => void upd({ layout: lid === 'none' ? null : lid })}>
                  {lid}
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ marginBottom: 4 }}>
            <span className="flabel">Colour</span>
            <div className="row" style={{ gap: 6 }}>
              {COLORS.map((c) => (
                <button key={c} onClick={() => void upd({ color: c })} aria-label={c} style={{ width: 22, height: 22, borderRadius: 11, background: c, boxShadow: ct.color === c ? '0 0 0 2px var(--elev), 0 0 0 4px var(--accent)' : 'none' }} />
              ))}
              <span className="grow" />
              {!ct.builtin && (
                <button
                  className="btn sm danger"
                  onClick={() =>
                    openDialog({
                      kind: 'confirm',
                      title: `Delete change type ${ct.id}?`,
                      body: 'Existing changes of this type keep working; you just can’t create new ones.',
                      confirm: 'Delete',
                      danger: true,
                      run: async () => void (await saveRegistry('changeTypes', reg.changeTypes.filter((x) => x.id !== ct.id))),
                    })
                  }
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangeTypesSeg() {
  const reg = useStore((s) => s.registries)!;
  const [open, setOpen] = useState<string | null>(reg.changeTypes[0]?.id || null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const add = async () => {
    const id = slugify(name);
    if (!id) return;
    if (reg.changeTypes.some((c) => c.id === id)) return toast(`${id} already exists`, 'warn');
    const ct: ChangeType = { id, color: 'var(--teal)', layout: null, builtin: false, tpl: `# Brief — {{name}} (brief-001)\n\n**Type:** ${id} · **Opened:** {{date}} · **Branch:** {{branch}}\n\n## Goal\n\n## Notes\n- \n` };
    if (await saveRegistry('changeTypes', [...reg.changeTypes, ct])) {
      setAdding(false);
      setName('');
      setOpen(id);
      toast(`Added change type ${id}`, 'ok');
    }
  };
  return (
    <>
      {reg.changeTypes.map((ct) => (
        <ChangeTypeRow key={ct.id} ct={ct} open={open === ct.id} onToggle={() => setOpen(open === ct.id ? null : ct.id)} />
      ))}
      {adding ? (
        <div className="lcard">
          <div className="field">
            <span className="flabel">New change type</span>
            <input type="text" placeholder="e.g. chore" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} aria-label="Change type name" autoFocus />
            <span className="fhelp">
              slug <span className="mono">{slugify(name) || 'type'}</span> · folders like <span className="mono">{slugify(name) || 'type'}-login-timeout/</span>
            </span>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm primary" onClick={() => void add()} disabled={!slugify(name)}>
              Add change type
            </button>
            <button className="btn sm ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn sm ghost" onClick={() => setAdding(true)}>
          <Icon d={I.plus} size={13} />
          Add change type
        </button>
      )}
    </>
  );
}

/** What each Write asks for: {{guide}} in the Write message (Settings → Briefs). */
function GuideEditor({ docTypes, onSave }: { docTypes: DocType[]; onSave: (slug: string, guide: string | undefined) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const d = docTypes.find((x) => x.slug === open);
  const [text, setText] = useState('');
  useEffect(() => setText(d ? docGuide(d) : ''), [d]);
  const builtinDefault = d ? DOC_GUIDES[d.slug] : undefined;
  const save = () => {
    if (!d) return;
    const v = text.trim();
    // Matching the built-in default is stored as "default", so future improvements still reach it.
    onSave(d.slug, builtinDefault !== undefined && v === builtinDefault ? undefined : v);
  };
  return (
    <div style={{ marginTop: 14 }}>
      <div className="flabel" style={{ marginBottom: 6 }}>
        What a Write asks for
      </div>
      <div className="fhelp" style={{ marginBottom: 8 }}>
        Each doc type's guidance goes into the Write message as <span className="mono">{'{{guide}}'}</span>, so every agent writes the same kind of document. Pick a type to edit it.
      </div>
      <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {docTypes.map((x) => (
          <button key={x.slug} className={cls('sugg', open === x.slug && 'on')} onClick={() => setOpen(open === x.slug ? null : x.slug)} data-testid={`guide-${x.slug}`}>
            {x.slug}
          </button>
        ))}
      </div>
      {d && (
        <div className="field">
          <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} onBlur={save} placeholder="No guidance: the Write only names the file" aria-label={`Guidance for ${d.slug}`} data-testid="guide-text" />
          <div className="row" style={{ gap: 8 }}>
            <span className="fhelp grow">Saved when you leave the box.</span>
            {builtinDefault !== undefined && text.trim() !== builtinDefault && (
              <button className="link" style={{ fontSize: 12 }} onClick={() => (setText(builtinDefault), onSave(d.slug, undefined))}>
                Reset to default
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DocTypesSeg() {
  const reg = useStore((s) => s.registries)!;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'superseding' | 'delta'>('superseding');
  const upd = (slug: string, p: Partial<DocType>) => saveRegistry('docTypes', reg.docTypes.map((d) => (d.slug === slug ? { ...d, ...p } : d)));
  const slug = slugify(name) || 'type';
  const add = async () => {
    if (!slugify(name)) return;
    if (reg.docTypes.some((d) => d.slug === slug)) return toast(`${slug} already exists`, 'warn');
    if (await saveRegistry('docTypes', [...reg.docTypes, { slug, mode, keep: 'all', cap: '4 KB', builtin: false }])) {
      toast(`Added doc type ${slug}`, 'ok');
      setAdding(false);
      setName('');
    }
  };
  const cycleKeep = (d: DocType) => {
    const order: DocType['keep'][] = ['all', 3, 5, 10];
    const i = order.indexOf(d.keep);
    void upd(d.slug, { keep: order[(i + 1) % order.length] });
  };
  return (
    <>
      <table className="tbl">
        <thead>
          <tr>
            <th>Type</th>
            <th>Mode</th>
            <th>Keep</th>
            <th>Cap</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {reg.docTypes.map((d) => (
            <tr key={d.slug}>
              <td>
                <span className="row" style={{ gap: 6 }}>
                  <Icon d={I.file} size={14} cls={docTypeCls(d.slug)} />
                  <span className="mono">{d.slug}</span>
                </span>
              </td>
              <td>
                <button className="pill" onClick={() => void upd(d.slug, { mode: d.mode === 'delta' ? 'superseding' : 'delta' })} title="Click to switch superseding / delta">
                  {d.mode}
                </button>
              </td>
              <td>
                <button className="pill" onClick={() => cycleKeep(d)} title="Keep-N used by Prune history (click to cycle)">
                  {String(d.keep)}
                </button>
              </td>
              <td className="mono dim">{d.cap}</td>
              <td style={{ textAlign: 'right' }}>
                {d.builtin ? (
                  <span title="Built-in: mode editable, not deletable" className="dim">
                    <Icon d={I.lock} size={13} />
                  </span>
                ) : (
                  <button className="ibtn sm" onClick={() => void saveRegistry('docTypes', reg.docTypes.filter((x) => x.slug !== d.slug))} aria-label={`Delete type ${d.slug}`}>
                    <Icon d={I.trash} size={13} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <GuideEditor docTypes={reg.docTypes} onSave={(slug, guide) => void upd(slug, { guide })} />
      {adding ? (
        <div className="lcard" style={{ marginTop: 10 }}>
          <div className="field">
            <span className="flabel">New doc type</span>
            <input type="text" placeholder="e.g. test-round" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} aria-label="New type name" autoFocus />
            <span className="fhelp">
              slug <span className="mono">{slug}</span> · files <span className="mono">{slug}-001.md</span>
            </span>
          </div>
          <div className="field">
            <span className="flabel">Mode</span>
            <Seg
              value={mode}
              onChange={setMode}
              options={[
                { value: 'superseding', label: 'superseding' },
                { value: 'delta', label: 'delta' },
              ]}
            />
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm primary" onClick={() => void add()} disabled={!slugify(name)}>
              Add type
            </button>
            <button className="btn sm ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setAdding(true)}>
          <Icon d={I.plus} size={13} />
          Add type
        </button>
      )}
    </>
  );
}

const SEG_KIND = { layouts: 'layouts', ct: 'changeTypes', dt: 'docTypes' } as const;

function RawJson({ seg }: { seg: 'layouts' | 'ct' | 'dt' }) {
  const reg = useStore((s) => s.registries)!;
  const kind = SEG_KIND[seg];
  const original = JSON.stringify(reg[kind], null, 2);
  const [text, setText] = useState(original);
  useEffect(() => setText(original), [original]);
  const file = { layouts: 'layouts.json', changeTypes: 'change-types.json', docTypes: 'doc-types.json' }[kind];
  const save = async () => {
    let v: unknown;
    try {
      v = JSON.parse(text);
    } catch (e: any) {
      return toast(`Invalid JSON: ${e.message}`, 'warn');
    }
    if (await saveRegistry(kind, v as Registries[typeof kind])) toast(`Saved ${file}`, 'ok');
  };
  return (
    <>
      <div className="mono dim" style={{ fontSize: 11, marginBottom: 6 }}>
        $CAYRNX_HOME/registries/{file}
      </div>
      <CodeEditor value={text} onChange={setText} onSave={() => void save()} lang="json" small label={`${file} JSON`} />
      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <button className="btn sm primary" disabled={text === original} onClick={() => void save()}>
          Save file
        </button>
        <button className="btn sm ghost" disabled={text === original} onClick={() => setText(original)}>
          Revert
        </button>
        <span className="grow" />
        <button className="btn sm ghost" onClick={() => downloadJson(file, reg[kind])}>
          <Icon d={I.download} size={13} />
          Export
        </button>
      </div>
    </>
  );
}

export function SetupsPanel({ mobile }: { mobile?: boolean }) {
  const s = useStore();
  const [raw, setRaw] = useState(false);
  const seg = s.setupsSeg;
  if (!s.registries) return <Empty icon={I.setups} title="Loading…" />;
  const rawBtn = (
    <button className={cls('btn sm ghost', raw && 'on')} onClick={() => setRaw(!raw)} title="Show the underlying config file">
      <Icon d={I.code} size={13} />
      Raw JSON
    </button>
  );
  return (
    <>
      {!mobile && (
        <div className="phead">
          <div className="ptitle">Setups</div>
          {rawBtn}
        </div>
      )}
      <div style={{ padding: mobile ? '0 0 10px' : '10px 10px 0' }} className="row">
        <Seg
          full
          style={{ flexGrow: 1 }}
          value={seg}
          onChange={(v) => useStore.setState({ setupsSeg: v })}
          options={[
            { value: 'layouts', label: 'Layouts' },
            { value: 'ct', label: 'Change types' },
            { value: 'dt', label: 'Doc types' },
          ]}
        />
        {mobile && rawBtn}
      </div>
      <div className="pbody">
        {raw ? <RawJson seg={seg} /> : seg === 'layouts' ? <LayoutsSeg /> : seg === 'ct' ? <ChangeTypesSeg /> : <DocTypesSeg />}
      </div>
    </>
  );
}
