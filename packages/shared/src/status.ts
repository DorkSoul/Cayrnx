import type { DocRef } from './types.ts';
import { byType } from './version.ts';

/** The five derived status steps ①–⑤ (spec §9). Status is never a maintained field. */
export const FLOW = ['brief', 'findings', 'plan', 'code', 'review'] as const;
export type FlowStep = (typeof FLOW)[number];

export function isBuiltinType(t: string): boolean {
  return (FLOW as readonly string[]).includes(t);
}

export interface Dot {
  cls: '' | 'on' | 'on done';
  label: string;
}

export function dotsOf(docs: DocRef[]): Dot[] {
  const m = byType(docs);
  const all = FLOW.every((t) => m[t]);
  return FLOW.map((t) => ({
    cls: m[t] ? (all ? 'on done' : 'on') : '',
    label: t + (m[t] ? ' — exists' : ' — not yet'),
  }));
}

/**
 * Progress dots for a change with CLI tabs: the brief, then one per tab in strip order, lit once
 * that tab has done a turn of work. Without tabs it falls back to the doc flow (`dotsOf`).
 */
export function progressDots(docs: DocRef[], tabs: { label: string; ran: boolean }[]): Dot[] {
  if (!tabs.length) return dotsOf(docs);
  const brief = docs.some((d) => d.type === 'brief');
  const items = [{ on: brief, label: brief ? 'brief — written' : 'brief — not yet' }, ...tabs.map((t) => ({ on: t.ran, label: `${t.label} — ${t.ran ? 'has run' : 'not run yet'}` }))];
  const all = items.every((i) => i.on);
  return items.map((i) => ({ cls: i.on ? (all ? 'on done' : 'on') : '', label: i.label }));
}

/** Index of the furthest step that has a file (0 = brief). */
export function derivedIdx(docs: DocRef[]): number {
  const m = byType(docs);
  let idx = 0;
  FLOW.forEach((t, i) => {
    if (m[t]) idx = i;
  });
  return idx;
}

export function statusWord(docs: DocRef[]): FlowStep {
  return FLOW[derivedIdx(docs)];
}
