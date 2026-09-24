import { useEffect, useState } from 'react';
import type { Change, ChangeUsage, TokenUsage } from '@cayrnx/shared';
import { enc, get } from '../api.ts';
import { formatTokens, useStore } from '../store.ts';
import { Glyph, Popover } from '../components/common.tsx';

const total = (u: TokenUsage) => u.input + u.output + u.reasoning + u.cacheWrite;
const num = (n: number) => (n ? formatTokens(n) : '—');
const money = (c: number | null) => (c === null ? '—' : c < 0.01 && c > 0 ? '<$0.01' : `$${c.toFixed(2)}`);

/** The token breakdown for a change: one row per CLI + model its tabs used (status bar → tokens). */
export function UsagePopover({ change, style }: { change: Change; style?: React.CSSProperties }) {
  const pid = useStore((s) => s.projectId);
  const mobile = useStore((s) => s.isMobile);
  const [data, setData] = useState<ChangeUsage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!pid) return;
    let alive = true;
    const load = () =>
      void get<ChangeUsage>(`/api/projects/${pid}/changes/${enc(change.slug)}/usage`).then(
        (d) => alive && (setData(d), setErr(null)),
        (e) => alive && setErr(e?.message || 'Could not read usage'),
      );
    load();
    const t = window.setInterval(load, 10_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [pid, change.slug]);
  const anyCost = !!data?.rows.some((r) => r.cost !== null);
  return (
    <Popover title={`Tokens · ${change.slug}`} className="usagepop" style={style}>
      {!mobile && (
        <div className="mlabel" style={{ padding: '10px 12px 6px' }}>
          Tokens · {change.slug}
        </div>
      )}
      {err && <div className="fhelp" style={{ padding: '0 12px 10px', color: 'var(--red)' }}>{err}</div>}
      {!data && !err && <div className="fhelp" style={{ padding: '0 12px 12px' }}>Reading the CLIs' session stores…</div>}
      {data && !data.rows.length && <div className="fhelp" style={{ padding: '0 12px 12px' }}>No usage yet — the counts appear after a tab's first prompt.</div>}
      {data && data.rows.length > 0 && (
        <div className="utable-wrap">
          <table className="utable" data-testid="usage-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Used by</th>
                <th title="Model calls (turns and tool steps)">Calls</th>
                <th>Input</th>
                <th>Output</th>
                <th title="Reported separately by Codex and OpenCode; Claude counts it as output">Reasoning</th>
                <th title="Context re-read from the prompt cache">Cache read</th>
                <th title="Context written to the prompt cache">Cache write</th>
                <th>Total</th>
                {anyCost && <th title="Only OpenCode records cost">Cost</th>}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={`${r.service}/${r.model}`}>
                  <td className="umodel">
                    <Glyph service={r.service} size={16} />
                    <span className="mono ell" title={r.model}>
                      {r.model}
                    </span>
                  </td>
                  <td className="dim ell" title={r.roles.join(', ')}>
                    {r.roles.join(', ') || '—'}
                  </td>
                  <td>{r.turns}</td>
                  <td>{num(r.input)}</td>
                  <td>{num(r.output)}</td>
                  <td>{num(r.reasoning)}</td>
                  <td>{num(r.cacheRead)}</td>
                  <td>{num(r.cacheWrite)}</td>
                  <td className="utotal">{num(total(r))}</td>
                  {anyCost && <td>{money(r.cost)}</td>}
                </tr>
              ))}
            </tbody>
            {data.rows.length > 1 && (
              <tfoot>
                <tr>
                  <td>All models</td>
                  <td />
                  <td>{data.total.turns}</td>
                  <td>{num(data.total.input)}</td>
                  <td>{num(data.total.output)}</td>
                  <td>{num(data.total.reasoning)}</td>
                  <td>{num(data.total.cacheRead)}</td>
                  <td>{num(data.total.cacheWrite)}</td>
                  <td className="utotal">{num(total(data.total))}</td>
                  {anyCost && <td>{money(data.total.cost)}</td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      <div className="fhelp" style={{ padding: '8px 12px 12px', maxWidth: 560 }}>
        Total = input + output + reasoning + cache writes. Cache reads are shown but not added: they're context the CLI re-sends each call, billed at a fraction of input.
        {data && data.missing > 0 && ` ${data.missing} session${data.missing === 1 ? " hasn't" : "s haven't"} recorded anything yet.`}
      </div>
    </Popover>
  );
}
