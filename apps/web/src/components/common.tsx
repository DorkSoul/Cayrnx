import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ADAPTERS, progressDots, isBuiltinType, type DocRef, type LayoutTab, type ServiceId, type TabChip } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { closePop, useStore } from '../store.ts';
import { cls } from '../util.ts';
import { BRAND } from '../brandIcons.ts';

export const STATE_TITLES: Record<TabChip | 'doc', string> = {
  idle: 'Idle',
  busy: 'Working…',
  approval: 'Needs approval — click to review',
  updated: 'Brief updated since this tab last read',
  error: 'Adapter failed — running as a plain terminal',
  finished: 'Finished — went idle since you last looked',
  exited: 'Process exited',
  launching: 'Launching…',
  failed: 'Failed to launch — see the terminal',
  notsaved: 'Brief not updated — agent said done, file unchanged',
  doc: 'Document',
};

const NUMS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'.split('');

/**
 * Progress as dots (default) or numbered labels (spec §14 tagged option). With `slug`, a change
 * that has CLI tabs gets the brief plus one dot per tab (lit once it has run); otherwise ①–⑤.
 */
export function Dots({ docs, slug }: { docs: DocRef[]; slug?: string }) {
  const numbers = useStore((s) => s.settings?.appearance.statusLabels === 'numbers');
  // A string key keeps the selector stable between unrelated store updates.
  const key = useStore((s) => {
    if (!slug || !s.projectId) return '';
    const tok = s.tokens[s.projectId]?.tabs || {};
    return Object.values(s.tabs)
      .filter((t) => t.projectId === s.projectId && t.change === slug && t.kind === 'term')
      .sort((a, b) => a.order - b.order)
      .map((t) => `${t.ranAt || (tok[t.id] || 0) > 0 ? 1 : 0}${t.spec.role || ADAPTERS[t.spec.service].name}`)
      .join('\n');
  });
  const tabs = key ? key.split('\n').map((k) => ({ ran: k[0] === '1', label: k.slice(1) })) : [];
  return (
    <span className={cls('dots', numbers && 'nums')}>
      {progressDots(docs, tabs).map((d, i) =>
        numbers ? (
          <span key={i} className={cls('num', d.cls)} title={d.label}>
            {NUMS[i]}
          </span>
        ) : (
          <span key={i} className={cls('dot', d.cls)} title={d.label} />
        ),
      )}
    </span>
  );
}

const KNOWN_CHANGE_TYPES = ['bug', 'story', 'spike'];
export function TypeChip({ type }: { type: string }) {
  return <span className={cls('tchip', `tc-${KNOWN_CHANGE_TYPES.includes(type) ? type : type === 'workspace' ? 'ws' : 'custom'}`)}>{type}</span>;
}

export function docTypeCls(t: string): string {
  return `ty-${isBuiltinType(t) ? t : 'custom'}`;
}

export function Glyph({ service, plain, size }: { service: ServiceId; plain?: boolean; size?: number }) {
  const style: CSSProperties | undefined = size ? { width: size, height: size, fontSize: size > 20 ? 10 : 9 } : undefined;
  const b = BRAND[service];
  return (
    <span className={cls('glyph', plain ? '' : `g-${service}`)} style={style} title={plain ? undefined : ADAPTERS[service].name}>
      {plain ? (
        '$'
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={b.d} fillRule={b.evenOdd ? 'evenodd' : undefined} clipRule={b.evenOdd ? 'evenodd' : undefined} />
        </svg>
      )}
    </span>
  );
}

export function StateChip({ chip, onClick }: { chip: TabChip | 'doc'; onClick?: () => void }) {
  const title = STATE_TITLES[chip];
  if (onClick) return <button className={`stc st-${chip}`} onClick={onClick} aria-label={title} title={title} />;
  return <span className={`stc st-${chip}`} title={title} />;
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button className={cls('sw', on && 'on')} onClick={() => onChange(!on)} aria-pressed={on} aria-label={label} disabled={disabled} />;
}

export function Check({ on }: { on: boolean }) {
  return (
    <span className={cls('check', on && 'on')}>
      <Icon d={I.check} size={11} style={{ strokeWidth: 3 }} />
    </span>
  );
}

export interface SegOpt<T extends string> {
  value: T;
  label: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}

export function Seg<T extends string>({ options, value, onChange, full, style, label }: { options: SegOpt<T>[]; value: T; onChange: (v: T) => void; full?: boolean; style?: CSSProperties; label?: string }) {
  return (
    <div className={cls('seg', full && 'full')} style={style} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} className={cls(value === o.value && 'on', o.danger && 'dng')} onClick={() => onChange(o.value)} disabled={o.disabled} title={o.title} aria-pressed={value === o.value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="eic">
        <Icon d={icon} size={22} />
      </div>
      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
      {children && <div style={{ fontSize: 12, marginBottom: action ? 16 : 0 }}>{children}</div>}
      {action}
    </div>
  );
}

export function MiniTile({ areas, tabs, w, h }: { areas: string; tabs: Pick<LayoutTab, 'area'>[]; w?: number; h?: number }) {
  return (
    <div className="minitile" style={{ gridTemplateAreas: areas, width: w, height: h }}>
      {tabs.map((t, i) => (
        <div key={i} style={{ gridArea: t.area }} />
      ))}
    </div>
  );
}

export function LayoutChip({ t }: { t: Pick<LayoutTab, 'service' | 'role' | 'model'> }) {
  return (
    <span className="tabchip">
      <Glyph service={t.service} />
      {t.role || t.service} · {t.model || 'default'}
    </span>
  );
}

export function V({ v = 'V2' }: { v?: string }) {
  return <span className="v2">{v}</span>;
}

/* ---------------- mobile sheet ---------------- */

function useSwipeDown(onClose: () => void) {
  const start = useRef<number | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => (start.current = e.touches[0].clientY),
    onTouchMove: (e: React.TouchEvent) => {
      if (start.current !== null && e.touches[0].clientY - start.current > 70) {
        start.current = null;
        onClose();
      }
    },
    onTouchEnd: () => (start.current = null),
  };
}

/** Bottom sheet (mobile). Rendered into the shell's portal so it isn't clipped or positioned by
 *  whatever `.rel` wrapper opened it. */
export function Sheet({ title, onClose, children, footer, head }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; head?: ReactNode }) {
  const swipe = useSwipeDown(onClose);
  const target = document.getElementById('cx-portal');
  const node = (
    <>
      <button className="scrim" onClick={onClose} aria-label="Close sheet" tabIndex={-1} style={{ position: 'absolute', inset: 0, zIndex: 60 }} />
      <div className="sheet" role="dialog" aria-label={typeof title === 'string' ? title : undefined} style={{ zIndex: 61 }}>
        <div {...swipe}>
          <div className="handle" />
          <div className="shead">
            <span className="stitle">{title}</span>
            {head}
            <button className="tb" onClick={onClose} aria-label="Close">
              <Icon d={I.x} size={20} />
            </button>
          </div>
        </div>
        <div className="sbody">{children}</div>
        {footer && <div className="sfoot">{footer}</div>}
      </div>
    </>
  );
  return target ? createPortal(node, target) : node;
}

export function SwipeOverlay({ title, onClose, children, hint = 'terminal keeps running' }: { title: string; onClose: () => void; children: ReactNode; hint?: string }) {
  const swipe = useSwipeDown(onClose);
  return (
    <div className="overlay" role="dialog" aria-label={title}>
      <div className="ohead" {...swipe}>
        <span style={{ fontSize: 17, fontWeight: 600 }} className="grow">
          {title}
        </span>
        <span className="dim" style={{ fontSize: 11 }}>
          {hint}
        </span>
        <button className="tb" onClick={onClose} aria-label="Close section">
          <Icon d={I.x} size={20} />
        </button>
      </div>
      <div className="obody">{children}</div>
    </div>
  );
}

/* ---------------- popover (desktop) / sheet (mobile) ---------------- */

export function Popover({ title, className, style, children, footer }: { title: string; className?: string; style?: CSSProperties; children: ReactNode; footer?: ReactNode }) {
  const mobile = useStore((s) => s.isMobile);
  if (mobile)
    return (
      <Sheet title={title} onClose={closePop} footer={footer}>
        {children}
      </Sheet>
    );
  return (
    <div className={cls('pop', className)} style={style} role="dialog" aria-label={title}>
      {children}
      {footer}
    </div>
  );
}

/* ---------------- dialog (desktop modal / mobile sheet) ---------------- */

export function Dialog({ title, width = 540, onClose, children, footer, head }: { title: ReactNode; width?: number; onClose: () => void; children: ReactNode; footer?: ReactNode; head?: ReactNode }) {
  const mobile = useStore((s) => s.isMobile);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (mobile)
    return (
      <Sheet title={title} onClose={onClose} footer={footer} head={head}>
        {children}
      </Sheet>
    );
  return (
    <div className="scrim">
      <button className="scrim-btn" onClick={onClose} aria-label="Close dialog" tabIndex={-1} />
      <div className="dialog" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} style={{ width, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 48px)' }}>
        <div className="dhead">
          <div className="dtitle">{title}</div>
          {head}
          <button className="ibtn" onClick={onClose} aria-label="Close">
            <Icon d={I.x} size={16} />
          </button>
        </div>
        {children}
        {footer && <div className="dfoot">{footer}</div>}
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <Icon d={t.kind === 'ok' ? I.check : t.kind === 'warn' ? I.warn : I.info} size={16} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Closes the open popover on outside click (spec §6: click-open, close on outside-click/Esc). */
export function Backdrop() {
  const pop = useStore((s) => s.pop);
  const mobile = useStore((s) => s.isMobile);
  useEffect(() => {
    if (!pop) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && closePop();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [pop]);
  if (!pop || mobile) return null;
  return <button className="backdrop" onClick={closePop} aria-label="Close menu" tabIndex={-1} />;
}

/** Long-press shows the label of an icon-only button (mobile: visible tap equivalent of hover). */
export function useLongPress(label: string) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<number | null>(null);
  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    window.setTimeout(() => setAt(null), 900);
  };
  return {
    handlers: {
      onTouchStart: (e: React.TouchEvent) => {
        const t = e.touches[0];
        timer.current = window.setTimeout(() => setAt({ x: t.clientX, y: t.clientY }), 450);
      },
      onTouchEnd: clear,
      onTouchCancel: clear,
    },
    label: at ? (
      <span className="lplabel" style={{ left: at.x, top: at.y }}>
        {label}
      </span>
    ) : null,
  };
}
