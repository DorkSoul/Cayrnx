import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { TabStatus } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { post } from '../api.ts';
import { activeTabId, clearStaged, curChange, curKey, errToast, openApproval, relaunchTab, sendStaged, setActive, termTabsFor, togglePop, useStore, type TileSizes } from '../store.ts';
import { Glyph, StateChip } from '../components/common.tsx';
import { AREA_PRESETS } from '../panels/SetupsPanel.tsx';
import { mountTerminal } from '../terminals.ts';
import { tabMeta, tunedNote } from './Terminal.tsx';
import { cls } from '../util.ts';

const LETTERS = 'abcdef';

/** `'a b' 'a c'` → [['a','b'],['a','c']]. */
function parseAreas(areas: string): string[][] {
  const rows = [...areas.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => (m[1] ?? m[2]).trim().split(/\s+/));
  return rows.length && rows.every((r) => r.length === rows[0].length) ? rows : [['a']];
}

function focusTab(id: string, pop?: 'read' | 'write') {
  setActive(id);
  useStore.setState({ tiled: false });
  if (pop) window.setTimeout(() => togglePop(pop), 0);
}

function Tile({ t, area, active, onSwap }: { t: TabStatus; area: string; active: boolean; onSwap: (from: string, to: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const staged = useStore((s) => s.staged[t.id]);
  const [drop, setDrop] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    return mountTerminal(t.id, host.current, { focus: false });
  }, [t.id]);
  const briefs = !!t.change && t.kind === 'term';
  return (
    <div
      className={cls('tile', active && 'on', drop && 'drop')}
      style={{ gridArea: area }}
      onMouseDown={() => !active && setActive(t.id)}
      onDragOver={(e) => (e.preventDefault(), setDrop(true))}
      onDragLeave={() => setDrop(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrop(false);
        const from = e.dataTransfer.getData('text/cayrnx-tile');
        if (from && from !== t.id) onSwap(from, t.id);
      }}
      data-testid={`tile-${t.spec.role || t.spec.service}`}
    >
      <div className="tilehead" draggable onDragStart={(e) => e.dataTransfer.setData('text/cayrnx-tile', t.id)} onDoubleClick={() => focusTab(t.id)} title="Drag to swap tiles · double-click for focus mode">
        <Glyph service={t.spec.service} plain={t.kind === 'plain'} />
        <span className="ell" style={{ fontWeight: 500 }}>
          {t.spec.role || t.spec.service}
        </span>
        <span className={cls('dim ell grow', t.tuned && 'tuned')} style={{ fontSize: 11 }} title={tunedNote(t) || undefined}>
          {tabMeta(t)}
        </span>
        <StateChip chip={t.chip} onClick={t.chip === 'approval' ? () => openApproval(t) : undefined} />
        <button className="ibtn sm" onClick={() => focusTab(t.id, 'read')} disabled={!briefs} aria-label="Read" title="Read ▾ (stage)">
          <Icon d={I.read} size={14} />
        </button>
        <button className="ibtn sm" onClick={() => focusTab(t.id, 'write')} disabled={!briefs} aria-label="Write" title="Write ▾ (send)" style={{ color: 'var(--accent)' }}>
          <Icon d={I.write} size={14} />
        </button>
        <button className="ibtn sm" onClick={() => focusTab(t.id)} aria-label="Focus" title="Focus mode">
          <Icon d={I.focus} size={14} />
        </button>
      </div>
      <div className="tilebody">
        <div className="xtwrap">
          <div className="xthost" ref={host} />
        </div>
        {t.proc === 'exited' && (
          <div className="tstate" style={{ background: 'var(--scrim)', zIndex: 3 }}>
            <div className="ocard">
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Process ended</div>
              <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
                <button className="btn sm" onClick={() => void relaunchTab(t.id, false)}>
                  Relaunch
                </button>
                {t.kind === 'term' && (
                  <button className="btn sm primary" onClick={() => void relaunchTab(t.id, true)}>
                    Resume
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {(t.proc === 'failed' || t.fallback) && (
          <div className={cls('fallback', t.proc === 'failed' && 'amber')} style={{ top: 6, right: 8 }}>
            <Icon d={t.fallback ? I.bolt : I.warn} size={12} />
            {t.fallback ? 'plain terminal' : 'failed'}
          </div>
        )}
        {staged && staged.text && !staged.min && (
          <div className="composer">
            <div className="row" style={{ gap: 8 }}>
              <span className="mono ell grow" style={{ fontSize: 11.5 }} title={staged.text}>
                ✎ {staged.text}
              </span>
              <button className="btn sm primary" onClick={() => void sendStaged(t.id)} disabled={t.proc !== 'running'}>
                Send
              </button>
              <button className="ibtn sm" onClick={() => clearStaged(t.id)} aria-label="Clear">
                <Icon d={I.x} size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** S8 — the change's terminals side by side, arranged from the layout's grid areas. */
export function TiledView() {
  const s = useStore();
  const key = curKey(s);
  const c = curChange(s);
  const terms = termTabsFor(s, s.projectId, key).slice(0, 6);
  const active = activeTabId(s);
  const grid = useRef<HTMLDivElement>(null);
  const L = c?.meta.layout ? s.registries?.layouts.find((l) => l.id === c.meta.layout) : null;
  const areas = L && L.tabs.length === terms.length ? L.areas : AREA_PRESETS[Math.max(1, terms.length)];
  const matrix = parseAreas(areas);
  const nCols = matrix[0].length;
  const nRows = matrix.length;
  const sizeKey = `${s.projectId}:${key}:${areas}`;
  const saved = s.tileSizes[sizeKey];
  const sizes: TileSizes = saved && saved.cols.length === nCols && saved.rows.length === nRows ? saved : { cols: Array(nCols).fill(1), rows: Array(nRows).fill(1) };
  const [dragging, setDragging] = useState<string | null>(null);

  const swap = (from: string, to: string) => {
    const ids = terms.map((t) => t.id);
    const i = ids.indexOf(from);
    const j = ids.indexOf(to);
    if (i < 0 || j < 0 || !s.projectId) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const all = termTabsFor(s, s.projectId, key).map((t) => t.id);
    const order = [...ids, ...all.filter((id) => !ids.includes(id))];
    useStore.setState((st) => ({ tabs: { ...st.tabs, ...Object.fromEntries(order.map((id, k) => [id, { ...st.tabs[id], order: k + 1 }])) } }));
    void post('/api/tabs/reorder', { projectId: s.projectId, ids: order }).catch(errToast);
  };

  const startDrag = (axis: 'cols' | 'rows', k: number) => (e: RPointerEvent) => {
    e.preventDefault();
    const el = grid.current;
    if (!el) return;
    const total = axis === 'cols' ? el.clientWidth : el.clientHeight;
    const start = axis === 'cols' ? e.clientX : e.clientY;
    const base = [...sizes[axis]];
    const sum = base.reduce((a, b) => a + b, 0);
    setDragging(`${axis}${k}`);
    const move = (ev: PointerEvent) => {
      const d = (((axis === 'cols' ? ev.clientX : ev.clientY) - start) / total) * sum;
      const next = [...base];
      next[k] = Math.max(0.2, base[k] + d);
      next[k + 1] = Math.max(0.2, base[k + 1] - d);
      useStore.setState((st) => ({ tileSizes: { ...st.tileSizes, [sizeKey]: { ...sizes, [axis]: next } } }));
    };
    const up = () => {
      setDragging(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const cum = (arr: number[]) => {
    const sum = arr.reduce((a, b) => a + b, 0);
    let acc = 0;
    return arr.slice(0, -1).map((v) => ((acc += v), (acc / sum) * 100));
  };

  if (!terms.length) return null;
  return (
    <div className="content" style={{ background: 'var(--bg)', padding: 10 }}>
      <div
        className="tiles"
        ref={grid}
        style={{ gridTemplateAreas: areas, gridTemplateColumns: sizes.cols.map((f) => `minmax(0, ${f}fr)`).join(' '), gridTemplateRows: sizes.rows.map((f) => `minmax(0, ${f}fr)`).join(' ') }}
        data-testid="tiled-view"
      >
        {terms.map((t, i) => (
          <Tile key={t.id} t={t} area={LETTERS[i]} active={t.id === active} onSwap={swap} />
        ))}
        {cum(sizes.cols).map((p, k) => (
          <div key={`c${k}`} className={cls('splitter v', dragging === `cols${k}` && 'on')} style={{ left: `${p}%` }} onPointerDown={startDrag('cols', k)} role="separator" aria-orientation="vertical" aria-label="Resize columns" />
        ))}
        {cum(sizes.rows).map((p, k) => (
          <div key={`r${k}`} className={cls('splitter h', dragging === `rows${k}` && 'on')} style={{ top: `${p}%` }} onPointerDown={startDrag('rows', k)} role="separator" aria-orientation="horizontal" aria-label="Resize rows" />
        ))}
      </div>
      <div className="row dim" style={{ gap: 8, fontSize: 11.5, paddingTop: 8 }}>
        <Icon d={I.tiles} size={13} />
        Tiled from {L && L.tabs.length === terms.length ? `layout "${L.name}"` : `${terms.length} tab${terms.length === 1 ? '' : 's'}`} · drag borders to resize · drag a header onto another tile to swap · double-click a header to focus
        {terms.length < termTabsFor(s, s.projectId, key).length && <span> · first 6 tabs shown</span>}
        <span className="grow" />
        {saved && (
          <button className="link" onClick={() => useStore.setState((st) => ({ tileSizes: Object.fromEntries(Object.entries(st.tileSizes).filter(([k]) => k !== sizeKey)) }))}>
            Reset sizes
          </button>
        )}
      </div>
    </div>
  );
}
