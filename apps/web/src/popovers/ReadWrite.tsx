import { useMemo, useState, type MouseEvent } from 'react';
import { FLOW, byType, docGuide, nextVersion, pad, readMsg, slugify, writeMsg, type Change, type TabStatus } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { insertRead, isUnread, saveRegistry, sendWrite, stage, toast, useStore } from '../store.ts';
import { Check, Popover, docTypeCls } from '../components/common.tsx';
import { cls } from '../util.ts';

/* ---------------- S11 Read (stage-only) ---------------- */

export function ReadPopover({ tab, change }: { tab: TabStatus; change: Change }) {
  const s = useStore();
  const pid = s.projectId!;
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [exp, setExp] = useState<Record<string, boolean>>({});
  const [custom, setCustom] = useState('');
  const m = byType(change.docs);
  const order = [...FLOW, ...(s.registries?.docTypes || []).map((d) => d.slug)];
  const types = Object.keys(m).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const selected = types.flatMap((t) => m[t].filter((d) => sel[d.file]));
  const files = selected.map((d) => d.file);
  const allLatest = selected.every((d) => d.n === m[d.type][m[d.type].length - 1].n);
  const preview = readMsg({ slug: change.slug, files, customPath: custom, allLatest, template: s.settings?.briefs.readTemplate });
  const none = !files.length && !custom.trim();
  // Default: add to the CLI's prompt (you finish the thought and press Enter there); Shift-click,
  // or the second button on phones, uses Cayrnx's composer instead.
  const mode = s.settings?.buttons.readBehavior || 'insert';
  const other = mode === 'insert' ? 'stage' : 'insert';
  const doRead = (m: 'insert' | 'stage') => {
    if (none) return;
    if (m === 'stage') stage(tab.id, preview, files.length + (custom.trim() ? 1 : 0));
    else void insertRead(tab.id, preview);
  };
  const LABEL = { insert: 'Add to prompt', stage: 'Stage in composer' } as const;
  const toggleType = (t: string) => {
    const vs = m[t];
    const any = vs.some((d) => sel[d.file]);
    const next = { ...sel };
    if (any) vs.forEach((d) => delete next[d.file]);
    else next[vs[vs.length - 1].file] = true;
    setSel(next);
  };
  return (
    <Popover
      title="Read"
      style={{ left: 0, top: 36, width: 400, padding: 8 }}
      footer={
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          {s.isMobile ? (
            <button className="btn" onClick={() => doRead(other)} disabled={none} data-testid="read-alt">
              {LABEL[other]}
            </button>
          ) : (
            <span className="dim grow" style={{ fontSize: 11 }}>
              You finish the thought, then press Enter · <span className="kbd">Shift</span>-click to {LABEL[other].toLowerCase()}
            </span>
          )}
          <button className={cls('btn primary', s.isMobile && 'grow')} onClick={(e) => doRead(e.shiftKey && s.settings?.buttons.shiftInvert !== false ? other : mode)} disabled={none} data-testid="stage-read">
            <Icon d={mode === 'insert' ? I.enter : I.pencil} size={14} />
            {LABEL[mode]}
          </button>
        </div>
      }
    >
      <div className="row" style={{ gap: 8, padding: '2px 4px 6px' }}>
        {!s.isMobile && (
          <span style={{ fontWeight: 600 }} className="grow">
            Read
          </span>
        )}
        <span className="dim" style={{ fontSize: 11 }}>
          never sends — you press Enter
        </span>
      </div>
      <div className="scroll" style={{ maxHeight: 300 }}>
        {types.map((t) => {
          const vs = m[t];
          const latest = vs[vs.length - 1];
          const any = vs.some((d) => sel[d.file]);
          return (
            <div key={t}>
              <div className={cls('rpop-row', any && 'on')}>
                <button className="row grow" onClick={() => toggleType(t)} style={{ gap: 8, height: '100%' }} aria-pressed={any} data-testid={`read-${t}`}>
                  <Check on={any} />
                  <Icon d={I.file} size={14} cls={docTypeCls(t)} />
                  <span className="grow">{t}</span>
                </button>
                {isUnread(s, pid, change.slug, latest) && <span className="udot" title="Unread" />}
                <button className="pill cur" onClick={() => setExp({ ...exp, [t]: !exp[t] })} title="Pick versions">
                  {t} ({pad(latest.n)}) <Icon d={I.down} size={10} style={{ marginLeft: 3 }} />
                </button>
              </div>
              {exp[t] && (
                <div className="row" style={{ gap: 4, flexWrap: 'wrap', padding: '4px 8px 6px 54px' }}>
                  {[...vs].reverse().map((d) => (
                    <button key={d.n} className={cls('sugg', sel[d.file] && 'on')} onClick={() => setSel({ ...sel, [d.file]: !sel[d.file] })} aria-pressed={!!sel[d.file]}>
                      {pad(d.n)}
                      {d.n === latest.n ? ' current' : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!types.length && <div className="dim" style={{ padding: 8, fontSize: 12 }}>No docs in this change yet.</div>}
      </div>
      <div className="row" style={{ gap: 6, padding: '6px 4px' }}>
        <Icon d={I.plus} size={14} cls="dim" />
        <input
          type="text"
          className="mono grow"
          placeholder="Custom path… e.g. docs/auth.md"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doRead(mode)}
          style={{ height: 28, fontSize: 11.5, padding: '0 8px' }}
          aria-label="Custom path"
        />
      </div>
      <div className="mlabel">Will stage exactly</div>
      <div className="preview" data-testid="read-preview">
        {preview || 'Tick one or more docs above…'}
      </div>
    </Popover>
  );
}

/* ---------------- S12 Write (fill & send) ---------------- */

export function defaultWriteType(change: Change): string {
  const m = byType(change.docs);
  return FLOW.find((t) => !m[t]) || 'findings';
}

export function WritePopover({ tab, change }: { tab: TabStatus; change: Change }) {
  const s = useStore();
  const [type, setType] = useState(() => defaultWriteType(change));
  const [newType, setNewType] = useState('');
  const [tplOpen, setTplOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const docTypes = s.registries?.docTypes || [];
  const dt = docTypes.find((d) => d.slug === type) || docTypes[0];
  const next = nextVersion(change.docs, dt?.slug || type);
  const wtpl = s.settings?.briefs.writeTemplate;
  // Same inputs as the server's send, so the preview is byte-identical to what reaches the PTY.
  const preview = useMemo(() => (dt ? writeMsg({ slug: change.slug, type: dt.slug, mode: dt.mode, next, guide: docGuide(dt), template: wtpl }) : ''), [dt, change.slug, next, wtpl]);
  const behavior = s.settings?.buttons;
  // Default: add to the CLI's prompt (you press Enter). Shift-click flips add ↔ send now;
  // with "stage" as the default, Shift-click sends now.
  const mode = behavior?.writeBehavior || 'insert';
  const altMode = mode === 'insert' ? 'fill' : mode === 'fill' ? 'insert' : 'fill';
  const send = async (e: MouseEvent) => {
    if (!dt || busy) return;
    const m = e.shiftKey && behavior?.shiftInvert !== false ? altMode : mode;
    if (m === 'stage') {
      stage(tab.id, preview, 1);
      toast('Write instruction staged — not sent', 'info');
      return;
    }
    setBusy(true);
    await sendWrite(tab.id, dt.slug, next, m === 'insert');
    setBusy(false);
  };
  const addType = async () => {
    const sl = slugify(newType);
    if (!sl) return;
    if (docTypes.some((d) => d.slug === sl)) {
      setType(sl);
      setNewType('');
      return;
    }
    if (await saveRegistry('docTypes', [...docTypes, { slug: sl, mode: 'superseding', keep: 'all', cap: '4 KB', builtin: false }])) {
      setType(sl);
      setNewType('');
      toast(`Registered doc type ${sl}`, 'ok');
    }
  };
  const LABEL = { insert: 'Add to prompt', fill: 'Send now', stage: 'Stage' } as const;
  const stageLabel = LABEL[mode];
  return (
    <Popover
      title="Write to brief"
      style={{ left: 0, top: 36, width: 440, padding: 8 }}
      footer={
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          {s.isMobile ? (
            <button className="btn" onClick={() => (stage(tab.id, preview, 1), toast('Write instruction staged — not sent', 'info'))}>
              Stage only
            </button>
          ) : (
            <span className="dim grow" style={{ fontSize: 11 }}>
              <span className="kbd">Shift</span>-click to {LABEL[altMode].toLowerCase()}
            </span>
          )}
          <button className={cls('btn primary', s.isMobile && 'grow')} onClick={(e) => void send(e)} disabled={busy || !dt} data-testid="send-write">
            <Icon d={I.enter} size={14} />
            {stageLabel}
          </button>
        </div>
      }
    >
      <div className="row" style={{ gap: 8, padding: '2px 4px 6px' }}>
        {!s.isMobile && (
          <span style={{ fontWeight: 600 }} className="grow">
            Write to brief
          </span>
        )}
        <span className="mono dim ell" style={{ fontSize: 11 }}>
          briefs/{change.slug}/
        </span>
      </div>
      <div className="scroll" style={{ maxHeight: 280 }}>
        {docTypes.map((d) => {
          const n = nextVersion(change.docs, d.slug);
          const on = d.slug === dt?.slug;
          return (
            <button key={d.slug} className={cls('rpop-row', on && 'on')} onClick={() => setType(d.slug)} aria-pressed={on} data-testid={`write-${d.slug}`}>
              <span className={cls('radio', on && 'on')} />
              <Icon d={I.file} size={14} cls={docTypeCls(d.slug)} />
              <span className="grow">{d.slug}</span>
              {d.builtin && (
                <span className="dim" title="Built-in type">
                  <Icon d={I.lock} size={12} />
                </span>
              )}
              <span className="mono dim" style={{ fontSize: 11.5, width: 64, textAlign: 'right' }}>
                → {pad(n)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="row" style={{ gap: 6, padding: '6px 4px' }}>
        <Icon d={I.plus} size={14} cls="dim" />
        <input type="text" className="grow" placeholder="New type… (name)" value={newType} onChange={(e) => setNewType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addType()} style={{ height: 28, fontSize: 12, padding: '0 8px' }} aria-label="New type name" />
        <button className="btn sm" onClick={() => void addType()} disabled={!slugify(newType)}>
          Add
        </button>
      </div>
      <button className="mlabel row" onClick={() => setTplOpen(!tplOpen)} style={{ gap: 4, width: '100%' }}>
        <Icon d={I.right} size={11} cls={cls('chev', tplOpen && 'open')} />
        Will send exactly
      </button>
      {tplOpen && (
        <div className="preview" data-testid="write-preview">
          {preview}
        </div>
      )}
    </Popover>
  );
}
