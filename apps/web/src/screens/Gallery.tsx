import type { DocRef, TabChip } from '@cayrnx/shared';
import { I, Icon, Logo } from '../icons.tsx';
import { Check, Dots, Glyph, LayoutChip, MiniTile, StateChip, Switch, TypeChip } from '../components/common.tsx';
import { Markdown } from '../components/Markdown.tsx';

// Static gallery of the design system in both themes (plan P0-2, instead of Ladle/Storybook):
// open /?gallery. No server calls, no auth.

const doc = (type: string, n: number): DocRef => ({ type, n, file: `${type}-00${n}.md`, mtime: 0, size: 0 });
const CHIPS: TabChip[] = ['idle', 'busy', 'approval', 'updated', 'notsaved', 'finished', 'error', 'failed', 'exited', 'launching'];
const SAMPLE = '# Plan — login timeout (plan-002)\n\n**Base:** wt-bug-login-timeout @ 3f9a1c2 · supersedes plan-001\n\n## Steps\n1. Add mutex around refresh (src/auth/session.ts:88)\n2. Regression test: tests/auth/refresh-race.test.ts\n\n- Cookie flow untouched — see `docs/auth.md`';

function Sheet({ theme }: { theme: 'dark' | 'light' }) {
  return (
    <div className={`cx ${theme}`} style={{ width: 'auto', height: 'auto', flex: 1, padding: 20, gap: 18, overflow: 'visible', position: 'relative' }}>
      <div className="row" style={{ gap: 10 }}>
        <span style={{ fill: 'var(--accent)', display: 'inline-flex' }}>
          <Logo />
        </span>
        <b style={{ fontSize: 16 }}>{theme}</b>
      </div>
      <section>
        <div className="mlabel">Buttons</div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button className="btn primary">Primary</button>
          <button className="btn">Default</button>
          <button className="btn ghost">Ghost</button>
          <button className="btn danger">Danger</button>
          <button className="btn sm">Small</button>
          <button className="btn" disabled>
            Disabled
          </button>
          <button className="ibtn">
            <Icon d={I.refresh} size={16} />
          </button>
          <button className="ibtn on">
            <Icon d={I.tiles} size={16} />
          </button>
          <button className="chip-staged">
            <Icon d={I.pencil} size={13} />2 staged
          </button>
        </div>
      </section>
      <section>
        <div className="mlabel">Chips, glyphs, dots</div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {['bug', 'story', 'spike', 'chore', 'workspace'].map((t) => (
            <TypeChip key={t} type={t} />
          ))}
          <Glyph service="opencode" />
          <Glyph service="codex" />
          <Glyph service="claude" />
          <span className="pill">plan-001</span>
          <span className="pill cur">plan-002</span>
          <span className="udot" />
          <span className="cnt">3</span>
          <span className="v2">V2</span>
          <span className="okchip ok">✓ 2.1.280</span>
          <span className="okchip bad">not found</span>
        </div>
        <div className="row" style={{ gap: 14, marginTop: 10 }}>
          <Dots docs={[doc('brief', 1)]} />
          <Dots docs={[doc('brief', 1), doc('findings', 1), doc('plan', 2)]} />
          <Dots docs={['brief', 'findings', 'plan', 'code', 'review'].map((t) => doc(t, 1))} />
        </div>
      </section>
      <section>
        <div className="mlabel">Tab state chips</div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          {CHIPS.map((c) => (
            <span key={c} className="row" style={{ gap: 5, fontSize: 12 }}>
              <StateChip chip={c} />
              {c}
            </span>
          ))}
        </div>
      </section>
      <section>
        <div className="mlabel">Tabs & toolbar</div>
        <div className="tabstrip" style={{ borderRadius: 8 }}>
          <div className="tabs-scroll">
            <div className="tab on">
              <span className="tab-main">
                <Glyph service="opencode" />
                <span className="tab-role">researcher</span>
                <span className="tab-meta">opencode · ds-v3</span>
              </span>
              <StateChip chip="busy" />
            </div>
            <div className="tab">
              <span className="tab-main">
                <Glyph service="claude" />
                <span className="tab-role">planner</span>
                <span className="tab-meta">claude · sonnet</span>
              </span>
              <StateChip chip="updated" />
            </div>
          </div>
        </div>
        <div className="toolbar" style={{ borderRadius: 8, marginTop: 6 }}>
          <button className="btn tb-read ring">
            <Icon d={I.read} />
            Read <span className="cnt">2</span>
          </button>
          <button className="btn" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
            <Icon d={I.write} />
            Write
          </button>
          <div className="law">
            <b>Reads stage</b>·<b>writes send</b>
          </div>
        </div>
      </section>
      <section>
        <div className="mlabel">Card, layout, form</div>
        <div className="card sel">
          <div className="crow">
            <span className="crow-main">
              <span className="cstack">
                <span className="row" style={{ gap: 7 }}>
                  <TypeChip type="bug" />
                  <span className="cname">login-timeout</span>
                </span>
                <span className="row" style={{ gap: 8 }}>
                  <Dots docs={[doc('brief', 1), doc('findings', 1), doc('plan', 2)]} />
                  <span className="cact">plan · 2m ago · 1 unread</span>
                </span>
              </span>
            </span>
          </div>
        </div>
        <div className="lcard row" style={{ gap: 12 }}>
          <MiniTile areas="'a b' 'a c'" tabs={[{ area: 'a' }, { area: 'b' }, { area: 'c' }]} />
          <div className="tchips">
            <LayoutChip t={{ service: 'opencode', role: 'researcher', model: 'ds-v3' }} />
            <LayoutChip t={{ service: 'claude', role: 'planner', model: 'sonnet' }} />
          </div>
        </div>
        <div className="field">
          <span className="flabel">Name</span>
          <input type="text" defaultValue="login timeout" />
          <span className="slug">briefs/bug-login-timeout/</span>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Switch on onChange={() => undefined} label="on" />
          <Switch on={false} onChange={() => undefined} label="off" />
          <Check on />
          <Check on={false} />
          <span className="radio on" />
          <div className="seg">
            <button className="on">Dark</button>
            <button>Light</button>
          </div>
        </div>
        <div className="warnrow" style={{ marginTop: 8 }}>
          <Icon d={I.warn} />
          bypassPermissions: every tool call runs without asking.
        </div>
        <div className="warnrow amber" style={{ marginTop: 6 }}>
          <Icon d={I.warn} />
          codex not found — the tab will fail to launch.
        </div>
        <div className="cmd" style={{ marginTop: 6 }}>
          codex -a on-request -s workspace-write -C /projects/app --add-dir /projects/app/briefs
        </div>
        <div className="preview" style={{ marginTop: 6 }}>
          Read from briefs/bug-login-timeout/: brief-001.md, plan-002.md. (latest versions only.)
        </div>
      </section>
      <section>
        <div className="mlabel">Doc render · diff</div>
        <div className="docview" style={{ borderRadius: 10, border: '1px solid var(--line)' }}>
          <div className="docbody" style={{ padding: 18 }}>
            <Markdown src={SAMPLE} />
            <div className="diffl del">− 1. Debounce refresh calls by 500 ms</div>
            <div className="diffl add">+ 1. Add mutex around refresh</div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function Gallery() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'stretch' }}>
      <Sheet theme="dark" />
      <Sheet theme="light" />
    </div>
  );
}
