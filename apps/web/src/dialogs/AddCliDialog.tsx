import { useEffect, useMemo, useState } from 'react';
import {
  ADAPTERS,
  SERVICE_IDS,
  mayEdit,
  sharedFolderWarning,
  fillSeed,
  previewLaunch,
  spec as mkSpec,
  type ServiceDetect,
  type ServiceId,
  type TabLaunchSpec,
  type TabStatus,
} from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { get, post } from '../api.ts';
import { closeDialog, curChange, curKey, curProject, errToast, openDialog, setActive, stage, toast, useStore, WORKSPACE } from '../store.ts';
import { Dialog, Glyph, V } from '../components/common.tsx';
import { LaunchFields, switchService } from '../components/LaunchFields.tsx';
import { cls } from '../util.ts';

const SHORT: Record<ServiceId, string> = { claude: 'Claude', codex: 'Codex', opencode: 'OpenCode' };

/** `codex-cli 0.154.0` / `2.1.280 (Claude Code)` → the version number. */
const versionOf = (v: string | null | undefined) => v?.match(/\d+\.\d+(?:\.\d+)?/)?.[0] || 'found';

export function AddCliDialog({ editTab }: { editTab?: string }) {
  const s = useStore();
  const p = curProject(s)!;
  const editing = editTab ? s.tabs[editTab] : null;
  const change = editing ? (editing.change ? (s.changes[p.id] || []).find((c) => c.slug === editing.change) || null : null) : curChange(s);
  const defaultCwd = editing ? editing.cwd : change ? change.cwd : p.path;
  const [spec, setSpec] = useState<TabLaunchSpec>(() => editing?.spec || mkSpec({ service: 'claude', role: '', model: 'sonnet' }));
  // Tabs always run in their project's folder (the change's worktree when it has one).
  const cwd = defaultCwd;
  const [seed, setSeed] = useState('');
  const [dets, setDets] = useState<Record<string, ServiceDetect>>({});
  const [testMsg, setTestMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const a = ADAPTERS[spec.service];
  const svc = s.settings!.services[spec.service];
  useEffect(() => {
    void get<ServiceDetect[]>('/api/services').then((l) => setDets(Object.fromEntries(l.map((d) => [d.id, d]))), () => undefined);
  }, []);
  const upd = (patch: Partial<TabLaunchSpec>) => setSpec((x) => ({ ...x, ...patch }));
  const pick = (id: ServiceId) => setSpec((x) => switchService(x, id));
  const launch = useMemo(
    () =>
      a.buildLaunch({
        spec,
        cwd,
        bin: svc.bin,
        briefsDir: change ? `${p.path}/briefs` : null,
        sessionId: a.assignsSessionId ? '<new-uuid>' : null,
        extraArgs: svc.extraArgs,
        hook: svc.hooks && a.hookNote ? ['node', '$CAYRNX_HOME/hook.mjs', 'http://127.0.0.1:<port>/api/hook/<tab>/<token>'] : null,
      }),
    [a, spec, cwd, svc.bin, svc.extraArgs, svc.hooks, change, p.path],
  );
  // Other CLIs that can edit files in the same folder (running or stopped, any change).
  const neighbours = Object.values(s.tabs).filter((t) => t.id !== editing?.id && t.kind === 'term' && t.cwd === cwd && t.proc !== 'failed' && mayEdit(t.spec));
  const clash = mayEdit(spec) && neighbours.length ? sharedFolderWarning([...new Set([...neighbours.map((t) => t.spec.role || t.spec.service), spec.role.trim() || spec.service])]) : null;
  const cmd = previewLaunch(launch, { cdForm: spec.service === 'claude', abbreviate: 160 });
  const det = dets[spec.service];
  const slug = change?.slug || '{{change}}';
  const test = async () => {
    setTestMsg(`Testing ${svc.bin} --version…`);
    try {
      const d = await post<ServiceDetect>(`/api/services/${spec.service}/test`);
      setDets((x) => ({ ...x, [spec.service]: d }));
      setTestMsg(d.ok ? `✓ ${a.name} ${d.version || ''} — binary responds` : `✗ ${d.error}`);
    } catch (e: any) {
      setTestMsg(`✗ ${e.message}`);
    }
  };
  const submit = async () => {
    setBusy(true);
    const finalSpec = { ...spec, role: spec.role.trim() || spec.service };
    try {
      if (editing) {
        const resume = !!editing.sessionId && editing.spec.service === finalSpec.service;
        await post(`/api/tabs/${editing.id}/relaunch`, { resume, spec: finalSpec });
        toast(`Tab relaunched with new settings${resume ? ' · session resumed' : ''}`, 'ok');
      } else {
        const key = curKey(s);
        const t = await post<TabStatus>('/api/tabs', { projectId: p.id, change: change && key !== WORKSPACE ? change.slug : null, spec: finalSpec });
        useStore.setState((st) => ({ tabs: { ...st.tabs, [t.id]: t } }));
        setActive(t.id);
        if (seed.trim()) stage(t.id, fillSeed(seed.trim(), change?.slug || ''), 1);
        toast(t.proc === 'failed' ? `Tab added — ${t.error}` : `Tab launching · ${finalSpec.role}`, t.proc === 'failed' ? 'warn' : 'ok');
      }
      closeDialog();
    } catch (e) {
      errToast(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={editing ? 'Edit launch settings' : 'Add CLI'}
      width={840}
      onClose={closeDialog}
      head={
        <span className="dim ell" style={{ fontSize: 12 }}>
          into {change ? change.slug : 'workspace'}
        </span>
      }
      footer={
        <>
          <span className="grow dim ell" style={{ fontSize: 12 }}>
            {testMsg}
          </span>
          <button className="btn" onClick={() => void test()}>
            <Icon d={I.play} size={14} />
            Test launch
          </button>
          <button className="btn primary" onClick={() => void submit()} disabled={busy} data-testid="add-tab">
            {editing ? 'Relaunch tab' : 'Add tab'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', minHeight: 0, borderTop: '1px solid var(--line)', flexWrap: s.isMobile ? 'wrap' : 'nowrap' }}>
        <div style={{ width: s.isMobile ? '100%' : 230, padding: 14, borderRight: s.isMobile ? 0 : '1px solid var(--line)', display: 'flex', flexDirection: s.isMobile ? 'row' : 'column', gap: 8, flexShrink: 0 }}>
          {!s.isMobile && (
            <div className="mlabel" style={{ paddingLeft: 2 }}>
              Service
            </div>
          )}
          {SERVICE_IDS.map((id) => {
            const d = dets[id];
            const ok = d ? d.ok : null;
            return (
              <button key={id} className={cls('optcard svccard', spec.service === id && 'on')} onClick={() => pick(id)} aria-pressed={spec.service === id} data-testid={`svc-pick-${id}`} title={d?.version || undefined}>
                <span className="row svchead" style={{ gap: 8, minWidth: 0, maxWidth: '100%' }}>
                  <Glyph service={id} size={s.isMobile ? 20 : 24} />
                  <span className="ell" style={{ fontWeight: 600 }}>
                    {s.isMobile ? SHORT[id] : ADAPTERS[id].name}
                  </span>
                </span>
                <span className={cls('okchip', ok === null ? 'run' : ok ? 'ok' : 'bad')}>{ok === null ? '…' : ok ? `✓ ${versionOf(d!.version)}` : 'not found'}</span>
              </button>
            );
          })}
        </div>
        <div style={{ flexGrow: 1, padding: '14px 20px 6px', overflowY: 'auto', maxHeight: s.isMobile ? undefined : 560, minWidth: 0 }}>
          {det && !det.ok && (
            <div className="warnrow amber" style={{ marginBottom: 14 }}>
              <Icon d={I.warn} />
              <span className="grow">
                {spec.service} {det.path ? 'did not respond' : 'not found'} at {svc.bin} — the tab will fail to launch. Fix the path in Settings → Services
                {!det.path && !s.meta?.docker ? ', or install it.' : '.'}
              </span>
              {!det.path && !s.meta?.docker && (
                <button className="btn sm" onClick={() => openDialog({ kind: 'install', service: spec.service })}>
                  <Icon d={I.download} size={13} />
                  Install…
                </button>
              )}
            </div>
          )}
          <LaunchFields spec={spec} onChange={setSpec} cwd={cwd} idPrefix="ac" />
          {clash && (
            <div className="clashnote" data-testid="clash-note" style={{ marginBottom: 10 }}>
              <Icon d={I.warn} size={13} />
              <span>{clash}</span>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: s.isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', columnGap: 16 }}>
            <div className="field">
              <span className="flabel">Runs in</span>
              <span className="mono ell" style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: '30px' }} title={cwd} data-testid="ac-cwd">
                {cwd}
              </span>
              <span className="fhelp">{change && change.cwd !== p.path ? "This change's worktree." : 'The project folder.'}</span>
            </div>
            <div className="field">
              <label className="flabel" htmlFor="ac-role">
                Role label
              </label>
              <div className="row" style={{ gap: 8 }}>
                <input id="ac-role" type="text" className="grow" value={spec.role} placeholder={spec.service} onChange={(e) => upd({ role: e.target.value })} />
                <span className="tabchip">
                  <Glyph service={spec.service} />
                  {spec.role || spec.service} · {spec.model || 'default'}
                </span>
              </div>
              <span className="fhelp">A sticker. Names and colours the tab — never automates anything.</span>
            </div>
          </div>
          {!editing && (
            <div className="field">
              <label className="flabel" htmlFor="ac-seed">
                Seed prompt
              </label>
              <textarea id="ac-seed" rows={2} className="mono" style={{ fontSize: 12 }} placeholder={`Read briefs/${slug}/brief-001.md first.`} value={seed} onChange={(e) => setSeed(e.target.value)} />
              <span className="fhelp">Staged in the composer when the tab starts — you still press Enter.</span>
            </div>
          )}
          <div className="field">
            <span className="flabel">View</span>
            <div className="seg">
              <button className="on">Terminal</button>
              <button disabled title="Agent-protocol chat skin — V2+">
                App skin <V v="V2+" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div style={{ padding: '0 20px 12px', borderTop: '1px solid var(--line)' }}>
        <div className="mlabel" style={{ padding: '10px 0 6px' }}>
          Command preview — exactly what will run
        </div>
        <div className="cmd" data-testid="cmd-preview">
          {cmd}
        </div>
      </div>
    </Dialog>
  );
}
