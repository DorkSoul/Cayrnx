import { useState } from 'react';
import { FLOW, statusWord, type Change, type FlowStep } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { patch } from '../api.ts';
import { archiveChange, changesOf, curKey, errToast, formatTokens, selectChange, showPanel, termTabsFor, toast, unreadIn, useStore } from '../store.ts';
import { Glyph, StateChip, TypeChip } from '../components/common.tsx';
import { cls, relTime } from '../util.ts';

/** Where a change sits: a manual placement (✋) wins over the derived status. */
export function placedStep(c: Change): FlowStep {
  const o = c.meta.statusOverride;
  return o && (FLOW as readonly string[]).includes(o) ? (o as FlowStep) : statusWord(c.docs);
}

async function place(pid: string, c: Change, step: FlowStep | null) {
  const derived = statusWord(c.docs);
  try {
    await patch(`/api/projects/${pid}/changes/${c.slug}`, { statusOverride: step && step !== derived ? step : null });
    if (step && step !== derived) toast(`Placed ${c.slug} under ${step} by hand — its files still say ${derived}`, 'info');
  } catch (e) {
    errToast(e);
  }
}

/** S15 — observational board: columns are derived from which files exist. */
export function BoardView() {
  const s = useStore();
  const pid = s.projectId!;
  const all = changesOf(s, pid);
  const active = all.filter((c) => !c.meta.archived);
  const archived = all.filter((c) => c.meta.archived);
  const [over, setOver] = useState<string | null>(null);
  const cur = curKey(s);
  const open = (c: Change) => {
    selectChange(c.slug);
    useStore.setState({ view: 'term' });
    if (!s.isMobile) showPanel('briefs');
  };
  return (
    <div className="content" style={{ background: 'var(--bg)', padding: 14 }} data-testid="board">
      <div className="row" style={{ gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Change board</span>
        <span className="dim" style={{ fontSize: 12 }}>
          Observational — columns come from which files exist. Dragging only records a ✋ placement. Terminals keep running.
        </span>
      </div>
      <div className="board">
        {FLOW.map((step, i) => {
          const cards = active.filter((c) => placedStep(c) === step);
          return (
            <div
              key={step}
              className={cls('bcol', over === step && 'drop')}
              onDragOver={(e) => (e.preventDefault(), setOver(step))}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const slug = e.dataTransfer.getData('text/cayrnx-change');
                const c = active.find((x) => x.slug === slug);
                if (c && placedStep(c) !== step) void place(pid, c, step);
              }}
              data-testid={`col-${step}`}
            >
              <div className="row" style={{ gap: 8, padding: '12px 12px 10px' }}>
                <span className={cls('dot on', i === 4 && 'done')} />
                <span style={{ fontWeight: 600 }} className="grow">
                  {step}
                </span>
                <span className="pill">{cards.length}</span>
              </div>
              <div className="bbody">
                {cards.map((c) => {
                  const manual = placedStep(c) !== statusWord(c.docs);
                  const un = unreadIn(s, pid, c);
                  const tabs = termTabsFor(s, pid, c.slug);
                  const tok = s.tokens[pid]?.changes[c.slug];
                  return (
                    <div key={c.slug} className={cls('bcard', cur === c.slug && 'sel')} draggable onDragStart={(e) => e.dataTransfer.setData('text/cayrnx-change', c.slug)} data-testid={`bcard-${c.slug}`}>
                      <button style={{ width: '100%', textAlign: 'left' }} onClick={() => open(c)}>
                        <div className="row" style={{ gap: 6 }}>
                          <TypeChip type={c.meta.type} />
                          <span className="grow" />
                          {manual && (
                            <span className="dim" title={`Manually placed — derived status is ${statusWord(c.docs)}`} data-testid="manual">
                              <Icon d={I.hand} size={14} />
                            </span>
                          )}
                          {un > 0 && <span className="cnt">{un}</span>}
                        </div>
                        <div style={{ fontWeight: 600, margin: '8px 0' }} className="ell">
                          {c.meta.name}
                        </div>
                        <div className="row" style={{ gap: 4, flexWrap: 'wrap', rowGap: 4 }}>
                          {tabs.map((t) => (
                            <span key={t.id} className="row" style={{ gap: 2 }} title={`${t.spec.role} · ${t.spec.service}`}>
                              <Glyph service={t.spec.service} plain={t.kind === 'plain'} />
                              <StateChip chip={t.chip} />
                            </span>
                          ))}
                          <span className="grow" />
                          {tok ? <span className="cact">{formatTokens(tok)} tok ·</span> : null}
                          <span className="cact">{relTime(c.activity)}</span>
                        </div>
                      </button>
                      {(manual || s.isMobile) && (
                        <div className="row" style={{ gap: 6, marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                          {s.isMobile && (
                            <select value={placedStep(c)} onChange={(e) => void place(pid, c, e.target.value as FlowStep)} aria-label="Move to column" style={{ height: 30, fontSize: 12 }}>
                              {FLOW.map((f) => (
                                <option key={f} value={f}>
                                  Move to {f}
                                </option>
                              ))}
                            </select>
                          )}
                          {manual && (
                            <button className="link" style={{ fontSize: 11.5 }} onClick={() => void place(pid, c, null)}>
                              Reset to derived ({statusWord(c.docs)})
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 10, fontSize: 12, flexWrap: 'wrap' }}>
        <Icon d={I.archive} size={14} cls="dim" />
        <span className="dim">Archived tray:</span>
        {archived.map((c) => (
          <button key={c.slug} className="tabchip" onClick={() => void archiveChange(c.slug, false)} title="Reopen (un-archive)">
            <TypeChip type={c.meta.type} />
            {c.meta.name}
          </button>
        ))}
        {!archived.length && <span className="dim">empty</span>}
      </div>
    </div>
  );
}
