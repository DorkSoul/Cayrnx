import { useEffect, useState, type ReactNode } from 'react';
import { ADAPTERS, DEFAULT_READ_TEMPLATE, DEFAULT_WRITE_TEMPLATE, SERVICE_IDS, TERM_FONTS, docGuide, readMsg, writeMsg, type ProjectSummary, type ServiceDetect, type ServiceId, type SessionInfo, type Settings, type SkillsInfo } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { del, get, patch, post, put } from '../api.ts';
import { curProject, errToast, logout, openDialog, refreshProjects, saveSettings, setActive, toast, togglePop, useStore } from '../store.ts';
import { Glyph, Popover, Seg, Switch } from '../components/common.tsx';
import { cls, copyText, downloadJson, readFileText, relTime } from '../util.ts';
import { THEME_OPTIONS, paletteById } from '../themes.ts';

function Group({ id, title, children, last }: { id: string; title: ReactNode; children: ReactNode; last?: boolean }) {
  return (
    <div className="sgroup" id={id} style={last ? { borderBottom: 0 } : undefined}>
      <div className="sgh">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="srow">
      <span className="lbl">{label}</span>
      {children}
    </div>
  );
}

function ChipList({ items, onChange, placeholder, mono = true }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; mono?: boolean }) {
  const [v, setV] = useState('');
  const add = () => {
    const x = v.trim();
    if (!x || items.includes(x)) return;
    onChange([...items, x]);
    setV('');
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="chiplist" style={{ marginBottom: 6 }}>
        {items.map((it) => (
          <span className="chipx" key={it}>
            {it}
            <button onClick={() => onChange(items.filter((x) => x !== it))} aria-label={`Remove ${it}`}>
              <Icon d={I.x} size={11} />
            </button>
          </span>
        ))}
        {!items.length && <span className="dim" style={{ fontSize: 12 }}>none</span>}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <input type="text" className={cls('grow', mono && 'mono')} style={{ height: 28, fontSize: 12 }} placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label={placeholder} />
        <button className="btn sm" onClick={add} disabled={!v.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}

/* ---------------- services ---------------- */

const SKILLS_SRC = 'https://raw.githubusercontent.com/mattpocock/skills/c55ee46073ed/skills/productivity';
const sq = (p: string) => `'${p.replace(/'/g, `'\\''`)}'`;

/**
 * Codex can't be handed Cayrnx's bundled skills per launch (Claude and OpenCode can), so it reads
 * them from its own skills folder: show whether they're there, and the commands to put them there.
 */
function CodexSkills() {
  const [info, setInfo] = useState<SkillsInfo | null>(null);
  const load = () => void get<SkillsInfo>('/api/skills').then(setInfo, () => setInfo(null));
  useEffect(load, []);
  if (!info) return null;
  const all = info.names.every((n) => info.codex.installed.includes(n));
  const dir = info.codex.dir;
  const local = info.bundled ? `mkdir -p ${sq(dir)} && cp -r ${info.names.map((n) => sq(`${info.bundled}/skills/${n}`)).join(' ')} ${sq(dir)}/` : null;
  const remote = info.names
    .map((n) => `mkdir -p ${sq(`${dir}/${n}/agents`)} && curl -fsSL ${SKILLS_SRC}/${n}/SKILL.md -o ${sq(`${dir}/${n}/SKILL.md`)} && curl -fsSL ${SKILLS_SRC}/${n}/agents/openai.yaml -o ${sq(`${dir}/${n}/agents/openai.yaml`)}`)
    .join('\n');
  const copy = (t: string) => void copyText(t).then(() => toast('Copied — run it in a terminal on the machine Codex runs on', 'ok'));
  return (
    <div className="note" style={{ marginTop: 6 }} data-testid="codex-skills">
      <div className="row" style={{ gap: 8, marginBottom: 4 }}>
        <span className="grow" style={{ fontWeight: 500, color: 'var(--text)' }}>
          Skills: /grill-me
        </span>
        <span className={cls('okchip', all ? 'ok' : 'bad')}>{all ? 'installed' : info.codex.installed.length ? 'partly installed' : 'not installed'}</span>
        <button className="btn sm" onClick={load} title="Check again">
          Check
        </button>
      </div>
      Claude Code and OpenCode tabs get Cayrnx's grill-me skill automatically. Codex only reads its own skills folder (<span className="mono">{dir}</span>), so install it there yourself. That makes it available in every Codex session, inside Cayrnx and out; then type <span className="mono">$grill-me</span> or pick it from <span className="mono">/skills</span>.
      {!all && (
        <>
          {local && (
            <>
              <div className="row" style={{ gap: 6, margin: '8px 0 4px' }}>
                <span className="grow">From the copy bundled with Cayrnx:</span>
                <button className="btn sm" onClick={() => copy(local)} data-testid="codex-skills-copy">
                  Copy
                </button>
              </div>
              <div className="codebox" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {local}
              </div>
            </>
          )}
          <div className="row" style={{ gap: 6, margin: '8px 0 4px' }}>
            <span className="grow">Or straight from github.com/mattpocock/skills:</span>
            <button className="btn sm" onClick={() => copy(remote)}>
              Copy
            </button>
          </div>
          <div className="codebox" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {remote}
          </div>
        </>
      )}
    </div>
  );
}

function ServiceRow({ id, st, det, onDet }: { id: ServiceId; st: Settings; det?: ServiceDetect; onDet: (d: ServiceDetect) => void }) {
  const a = ADAPTERS[id];
  const svc = st.services[id];
  const [bin, setBin] = useState(svc.bin);
  const [extra, setExtra] = useState(svc.extraArgs);
  const [adv, setAdv] = useState(false);
  const [testing, setTesting] = useState(false);
  const project = useStore((s) => curProject(s));
  useEffect(() => setBin(svc.bin), [svc.bin]);
  useEffect(() => setExtra(svc.extraArgs), [svc.extraArgs]);
  const untested = !!det?.ok && !!det.version && !/fake/.test(det.version) && !a.testedVersions.some((v) => det.version!.includes(v));
  const chip = !svc.enabled ? { t: 'disabled', c: 'run' } : testing ? { t: 'testing…', c: 'run' } : !det ? { t: '…', c: 'run' } : det.ok ? { t: `${untested ? '⚠' : '✓'} ${det.version || 'found'}`, c: untested ? 'bad' : 'ok' } : { t: det.error || 'not found', c: 'bad' };
  const test = async () => {
    setTesting(true);
    try {
      const d = await post<ServiceDetect>(`/api/services/${id}/test`);
      onDet(d);
      toast(d.ok ? `${a.name} ${d.version || ''} responds ✓` : `${a.name}: ${d.error}`, d.ok ? 'ok' : 'warn');
    } catch (e) {
      errToast(e);
    } finally {
      setTesting(false);
    }
  };
  const login = async () => {
    if (!project) return;
    try {
      const t = await post<{ id: string }>(`/api/services/${id}/login`, { projectId: project.id });
      useStore.setState((s) => ({ current: { ...s.current, [project.id]: 'workspace' } }));
      setActive(t.id);
      toast(`Login tab opened for ${a.name} — finish the flow in the terminal`, 'info');
    } catch (e) {
      errToast(e);
    }
  };
  return (
    <div className="svcrow" data-testid={`svc-${id}`}>
      <div className="row" style={{ gap: 8 }}>
        <Glyph service={id} />
        <span style={{ fontWeight: 600 }} className="grow">
          {a.name}
        </span>
        <span className={`okchip ${chip.c}`} title={chip.t}>
          {chip.t.length > 34 ? chip.t.slice(0, 33) + '…' : chip.t}
        </span>
        <Switch on={svc.enabled} onChange={(v) => void saveSettings({ services: { [id]: { enabled: v } } })} label={`Enable ${a.name}`} />
      </div>
      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <input
          type="text"
          className="mono grow"
          style={{ height: 28, fontSize: 11.5, padding: '0 8px' }}
          value={bin}
          onChange={(e) => setBin(e.target.value)}
          onBlur={() => bin.trim() && bin !== svc.bin && void saveSettings({ services: { [id]: { bin: bin.trim() } } }).then(test)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label={`${a.name} binary path`}
        />
        <button className="btn sm" onClick={() => void test()}>
          Test
        </button>
        {det && !det.path && !useStore.getState().meta?.docker ? (
          <button className="btn sm primary" onClick={() => openDialog({ kind: 'install', service: id })} data-testid={`install-${id}`}>
            <Icon d={I.download} size={13} />
            Install…
          </button>
        ) : (
          <button className="btn sm" onClick={() => void login()} disabled={!project} title={project ? `Opens a terminal tab running ${id} ${a.loginArgs.join(' ')}` : 'Open a project first'}>
            <Icon d={I.key} size={13} />
            Log in
          </button>
        )}
      </div>
      <div className={det && !det.path ? 'dim' : 'muted'} style={{ fontSize: 11.5, marginTop: 7 }}>
        {det?.auth || ''}
      </div>
      {untested && (
        <div className="warnrow amber" style={{ marginTop: 6 }}>
          <Icon d={I.warn} />
          <span>
            Cayrnx's flags were checked against {a.testedVersions.join(' / ')}x. If this version rejects them, tabs fall back to a plain terminal (⚡).
          </span>
        </div>
      )}
      {a.hookNote && (
        <div className="srow" style={{ marginTop: 6, marginBottom: 0 }}>
          <span className="lbl">
            Precise status via {id === 'claude' ? 'hooks' : 'notify'}
            <div className="note">{a.hookNote}</div>
          </span>
          <Switch on={svc.hooks} onChange={(v) => void saveSettings({ services: { [id]: { hooks: v } } })} label={`${a.name} hooks`} />
        </div>
      )}
      {id === 'codex' && <CodexSkills />}
      {id === 'opencode' && (
        <div className="note" style={{ marginTop: 6 }}>
          Launch mode: full TUI with a private server per tab (<span className="mono">--standalone</span>), model and agent passed in <span className="mono">OPENCODE_CONFIG_CONTENT</span>.
        </div>
      )}
      <button className="histt" style={{ paddingLeft: 0, marginTop: 4 }} onClick={() => setAdv(!adv)}>
        <Icon d={I.right} size={11} cls={cls('chev', adv && 'open')} />
        Launch arg template (advanced)
      </button>
      {adv && (
        <>
          <div className="codebox" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>
            {a.template}
          </div>
          <div className="row" style={{ gap: 6, marginTop: 6 }}>
            <span className="dim" style={{ fontSize: 11.5 }}>
              Extra args
            </span>
            <input
              type="text"
              className="mono grow"
              style={{ height: 26, fontSize: 11.5 }}
              value={extra}
              placeholder="appended to every launch"
              onChange={(e) => setExtra(e.target.value)}
              onBlur={() => extra !== svc.extraArgs && void saveSettings({ services: { [id]: { extraArgs: extra } } })}
              aria-label="Extra args"
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- access & security ---------------- */

function PasswordForm() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [conf, setConf] = useState('');
  const [open, setOpen] = useState(false);
  const save = async () => {
    if (next !== conf) return toast('The new passwords don’t match', 'warn');
    try {
      await post('/api/auth/password', { current: cur, next });
      toast('Password changed — other sessions were signed out', 'ok');
      setOpen(false);
      setCur('');
      setNext('');
      setConf('');
    } catch (e) {
      errToast(e);
    }
  };
  if (!open)
    return (
      <Row label="Password">
        <button className="btn sm" onClick={() => setOpen(true)}>
          Change…
        </button>
      </Row>
    );
  return (
    <div className="lcard">
      <div className="field">
        <span className="flabel">Current password</span>
        <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" aria-label="Current password" />
      </div>
      <div className="field">
        <span className="flabel">New password</span>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" aria-label="New password" />
      </div>
      <div className="field">
        <span className="flabel">Confirm</span>
        <input type="password" value={conf} onChange={(e) => setConf(e.target.value)} autoComplete="new-password" aria-label="Confirm new password" />
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn sm primary" onClick={() => void save()} disabled={next.length < 8}>
          Change password
        </button>
        <button className="btn sm ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Sessions() {
  const [list, setList] = useState<SessionInfo[] | null>(null);
  const load = () => void get<SessionInfo[]>('/api/auth/sessions').then(setList, errToast);
  useEffect(load, []);
  if (!list) return <div className="dim">Loading…</div>;
  return (
    <>
      {list.map((s) => (
        <div className="sessrow2" key={s.id}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="ell" title={s.ua}>
              {s.ua.replace(/\(.*?\)/g, '').slice(0, 60) || 'unknown client'}
              {s.current && <span className="pill" style={{ marginLeft: 6 }}>this device</span>}
            </div>
            <div className="dim mono" style={{ fontSize: 11 }}>
              {s.ip} · last seen {relTime(s.lastSeen)}
            </div>
          </div>
          {!s.current && (
            <button className="btn sm" onClick={() => void del(`/api/auth/sessions/${s.id}`).then(load, errToast)}>
              Sign out
            </button>
          )}
        </div>
      ))}
    </>
  );
}

function AccessGroup({ st }: { st: Settings }) {
  const meta = useStore((s) => s.meta);
  const a = st.access;
  const [cf, setCf] = useState(a.cloudflare);
  const [pang, setPang] = useState(a.pangolinNote);
  useEffect(() => setCf(a.cloudflare), [a.cloudflare]);
  const host = meta?.bind.host || '127.0.0.1';
  const local = host === '127.0.0.1' || host === '::1' || host === 'localhost';
  return (
    <Group id="set-access" title="Access & security">
      <PasswordForm />
      <div className="flabel" style={{ margin: '10px 0 6px' }}>
        Allowed folders
      </div>
      <div className="note" style={{ marginBottom: 6 }}>
        Optional limit. Leave empty to open projects anywhere on this machine (the folder browser starts at your home folder). Add folders to keep Cayrnx inside them.
      </div>
      <ChipList items={a.allowedRoots} onChange={(v) => void saveSettings({ access: { allowedRoots: v } })} placeholder="e.g. /home/you/code (empty = anywhere)" />
      <div className="flabel" style={{ margin: '10px 0 6px' }}>
        Allowed origins
      </div>
      <div className="note" style={{ marginBottom: 6 }}>
        Public URLs you open Cayrnx from (LAN host, Pangolin domain, Cloudflare domain). This browser's origin <span className="mono">{location.origin}</span> is always allowed.
      </div>
      <ChipList items={a.publicOrigins} onChange={(v) => void saveSettings({ access: { publicOrigins: v } })} placeholder="https://cayrnx.example.com" />
      <div className="flabel" style={{ margin: '12px 0 6px' }}>
        Reverse proxy
      </div>
      <Row label="Trust X-Forwarded-* headers (behind a proxy / tunnel)">
        <Switch on={a.trustProxy} onChange={(v) => void saveSettings({ access: { trustProxy: v } })} label="Trust proxy" />
      </Row>
      <Row label="Cloudflare Access (checked in addition to the password)">
        <Switch on={cf.enabled} onChange={(v) => void saveSettings({ access: { cloudflare: { ...cf, enabled: v } } })} label="Cloudflare Access" />
      </Row>
      {cf.enabled && (
        <div className="lcard">
          <div className="field">
            <span className="flabel">Team domain</span>
            <input type="text" className="mono" value={cf.teamDomain} placeholder="myteam.cloudflareaccess.com" onChange={(e) => setCf({ ...cf, teamDomain: e.target.value })} onBlur={() => void saveSettings({ access: { cloudflare: cf } })} aria-label="Team domain" />
          </div>
          <div className="field">
            <span className="flabel">Application AUD</span>
            <input type="text" className="mono" value={cf.aud} onChange={(e) => setCf({ ...cf, aud: e.target.value })} onBlur={() => void saveSettings({ access: { cloudflare: cf } })} aria-label="Application AUD" />
          </div>
          <div className="flabel" style={{ marginBottom: 6 }}>
            Hostnames that require the JWT
          </div>
          <ChipList items={cf.hostnames} onChange={(v) => void saveSettings({ access: { cloudflare: { ...cf, hostnames: v } } })} placeholder="cayrnx.example.com" />
        </div>
      )}
      <div className="field" style={{ marginTop: 6 }}>
        <span className="flabel">Pangolin</span>
        <span className="note">Pangolin's SSO sits in front of Cayrnx; the Cayrnx login is still required. Note for yourself which resource this instance is (optional):</span>
        <input type="text" value={pang} onChange={(e) => setPang(e.target.value)} onBlur={() => pang !== a.pangolinNote && void saveSettings({ access: { pangolinNote: pang } })} aria-label="Pangolin note" />
      </div>
      <div className="flabel" style={{ margin: '12px 0 4px' }}>
        Sessions
      </div>
      <Sessions />
      <div className="flabel" style={{ margin: '14px 0 6px' }}>
        Bind address
      </div>
      <div className="row" style={{ gap: 8 }}>
        <span className="mono">
          {host}:{meta?.bind.port}
        </span>
        {meta?.docker && <span className="pill">docker</span>}
      </div>
      {!local && !meta?.docker && (
        <div className="warnrow amber" style={{ marginTop: 8 }}>
          <Icon d={I.warn} />
          <span>Reachable from the network. Cayrnx hands out shells — keep the password strong and prefer a tunnel with SSO in front.</span>
        </div>
      )}
      {!window.isSecureContext && (
        <div className="warnrow info" style={{ marginTop: 8 }}>
          <Icon d={I.info} />
          <span>Plain HTTP: desktop notifications and the async clipboard need HTTPS (Pangolin / Cloudflare) or localhost.</span>
        </div>
      )}
    </Group>
  );
}

/* ---------------- projects ---------------- */

function ProjectsGroup() {
  const projects = useStore((s) => s.projects);
  const pop = useStore((s) => s.pop);
  const edit = (p: ProjectSummary) =>
    openDialog({
      kind: 'rename',
      title: `Worktree root for ${p.name}`,
      label: 'Folder for change worktrees (blank = $CAYRNX_HOME/worktrees). Never inside the project.',
      value: p.worktreeRoot || '',
      run: async (v) => {
        await patch(`/api/projects/${p.id}`, { worktreeRoot: v.trim() || null });
        await refreshProjects();
      },
    });
  return (
    <Group id="set-projects" title="Projects">
      {!projects.length && <div className="dim" style={{ fontSize: 12 }}>No projects yet.</div>}
      {projects.length > 0 && (
        <table className="stable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Watch</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td style={{ maxWidth: 150 }}>
                  <div className="ell" style={{ fontWeight: 500 }}>
                    {p.name}
                  </div>
                  <div className="mono dim ell" style={{ fontSize: 10.5 }} title={p.path}>
                    {p.path}
                  </div>
                  <div className="mono dim ell" style={{ fontSize: 10.5 }} title="Worktree root">
                    wt: {p.worktreeRoot || '$CAYRNX_HOME/worktrees'}
                  </div>
                </td>
                <td>
                  <button className="pill" title="native (inotify) or polling (network shares)" onClick={() => void patch(`/api/projects/${p.id}`, { watchMode: p.watchMode === 'native' ? 'polling' : 'native' }).then(refreshProjects, errToast)}>
                    {p.watchMode}
                  </button>
                </td>
                <td className="mono dim">{p.activeChanges}</td>
                <td style={{ textAlign: 'right' }} className="rel">
                  <button className="ibtn sm" onClick={() => togglePop(`proj:${p.id}`)} aria-label="Project actions">
                    <Icon d={I.kebab} size={14} fat />
                  </button>
                  {pop === `proj:${p.id}` && (
                    <Popover title={p.name} className="menu" style={{ right: 0, top: 28, width: 220 }}>
                      <button
                        className="mi"
                        onClick={() =>
                          openDialog({
                            kind: 'rename',
                            title: 'Rename project',
                            label: 'Name shown in Cayrnx (the folder is not renamed)',
                            value: p.name,
                            run: async (v) => {
                              await patch(`/api/projects/${p.id}`, { name: v });
                              await refreshProjects();
                            },
                          })
                        }
                      >
                        <Icon d={I.pencil} />
                        Rename
                      </button>
                      <button className="mi" onClick={() => edit(p)}>
                        <Icon d={I.branch} />
                        Edit worktree root
                      </button>
                      <div className="msep" />
                      <button
                        className="mi danger"
                        onClick={() =>
                          openDialog({
                            kind: 'confirm',
                            title: `Remove ${p.name} from Cayrnx?`,
                            body: `Its tabs are closed. Files are not deleted — ${p.path} and its briefs/ folder stay as they are.`,
                            confirm: 'Remove from Cayrnx',
                            danger: true,
                            run: async () => {
                              await del(`/api/projects/${p.id}`);
                              await refreshProjects();
                              useStore.setState((s) => (s.projectId === p.id ? { projectId: s.projects[0]?.id || null } : {}));
                            },
                          })
                        }
                      >
                        <Icon d={I.trash} />
                        Remove from Cayrnx
                      </button>
                    </Popover>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button className="btn sm" style={{ marginTop: 10 }} onClick={() => openDialog({ kind: 'open' })}>
        <Icon d={I.folderOpen} size={13} />
        Open project…
      </button>
    </Group>
  );
}

/* ---------------- panel ---------------- */

/* ---------------- Read / Write message templates ---------------- */

function TemplateField({ label, value, fallback, help, example, onSave, testid }: { label: string; value: string; fallback: string; help: ReactNode; example: (tpl: string) => string; onSave: (v: string) => void; testid: string }) {
  const [v, setV] = useState(value || fallback);
  useEffect(() => setV(value || fallback), [value, fallback]);
  // The built-in default is stored as blank, so improvements to it still reach you.
  const save = () => {
    const t = v.trim();
    const next = !t || t === fallback ? '' : t;
    if (next !== value) onSave(next);
  };
  return (
    <div className="field" style={{ marginTop: 10 }}>
      <span className="flabel">{label}</span>
      <textarea rows={5} className="mono" style={{ fontSize: 12 }} value={v} onChange={(e) => setV(e.target.value)} onBlur={save} aria-label={label} data-testid={testid} />
      <span className="fhelp">{help}</span>
      <div className="cmd" style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, marginTop: 4 }} data-testid={`${testid}-example`}>
        {example(v)}
      </div>
      {v.trim() !== fallback && (
        <button className="link" style={{ fontSize: 12, alignSelf: 'flex-start' }} onClick={() => (setV(fallback), onSave(''))}>
          Reset to default
        </button>
      )}
    </div>
  );
}

function MessageTemplates({ st }: { st: Settings }) {
  const reg = useStore((s) => s.registries);
  const plan = reg?.docTypes.find((d) => d.slug === 'plan') || { slug: 'plan', mode: 'superseding' as const };
  return (
    <>
      <div className="note" style={{ margin: '12px 0 0' }}>
        The messages the Read and Write buttons put in a tab. You can still edit each one before sending; these are the defaults. Each doc type's guidance (what a findings or a plan should contain) is edited in Setups → Doc types.
      </div>
      <TemplateField
        label="Write message"
        value={st.briefs.writeTemplate}
        fallback={DEFAULT_WRITE_TEMPLATE}
        testid="tpl-write"
        help={
          <>
            <span className="mono">{'{{file}}'}</span> the doc's path · <span className="mono">{'{{what}}'}</span> complete document or delta · <span className="mono">{'{{guide}}'}</span> the doc type's guidance · <span className="mono">{'{{doc}}'}</span>,{' '}
            <span className="mono">{'{{type}}'}</span>, <span className="mono">{'{{slug}}'}</span>. Keep <span className="mono">{'{{file}}'}</span>: it's how Cayrnx confirms the doc was written.
          </>
        }
        example={(tpl) => writeMsg({ slug: 'bug-login-timeout', type: 'plan', mode: plan.mode, next: 2, guide: docGuide(plan), template: tpl })}
        onSave={(v) => void saveSettings({ briefs: { writeTemplate: v } })}
      />
      <TemplateField
        label="Read message"
        value={st.briefs.readTemplate}
        fallback={DEFAULT_READ_TEMPLATE}
        testid="tpl-read"
        help={
          <>
            <span className="mono">{'{{slug}}'}</span> the change · <span className="mono">{'{{files}}'}</span> the docs you ticked. Keep both: they're how Cayrnx tracks what each tab has read.
          </>
        }
        example={(tpl) => readMsg({ slug: 'bug-login-timeout', files: ['findings-001.md', 'plan-002.md'], allLatest: true, template: tpl })}
        onSave={(v) => void saveSettings({ briefs: { readTemplate: v } })}
      />
    </>
  );
}

/* ---------------- running CLIs (background limits) ---------------- */

function NumberField({ value, onSave, label, min = 0, max }: { value: number; onSave: (v: number) => void; label: string; min?: number; max: number }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < min || n > max) return setV(String(value));
    if (n !== value) onSave(n);
  };
  return <input type="number" inputMode="numeric" min={min} max={max} className="mono" style={{ width: 84, height: 30 }} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} aria-label={label} data-testid={`num-${label.replace(/\W+/g, '-').toLowerCase()}`} />;
}

function RunningGroup({ st }: { st: Settings }) {
  const tabs = useStore((s) => s.tabs);
  const projects = useStore((s) => s.projects);
  const r = st.resources;
  const running = Object.values(tabs)
    .filter((t) => t.kind === 'term' && (t.proc === 'running' || t.proc === 'launching'))
    .sort((a, b) => a.projectId.localeCompare(b.projectId) || a.order - b.order);
  const stop = (id: string) => void post(`/api/tabs/${id}/stop`).then(() => toast('Stopped — resume any time', 'ok'), errToast);
  return (
    <Group id="set-running" title="Running CLIs">
      <div className="note" style={{ marginBottom: 8 }}>
        CLIs keep running on the server when the browser is closed. These limits stop idle ones so the machine isn't loaded with forgotten sessions — a stopped tab stays put with Resume session. Busy CLIs and pending approvals are never stopped automatically.
      </div>
      <Row label="Most CLIs running at once">
        <span className="row" style={{ gap: 8 }}>
          <NumberField value={r.maxRunning} max={200} label="Most CLIs running" onSave={(v) => void saveSettings({ resources: { maxRunning: v } })} />
          <span className="dim" style={{ fontSize: 12 }}>{r.maxRunning ? 'the longest-idle one stops first' : 'no limit'}</span>
        </span>
      </Row>
      <Row label="Stop background CLIs idle for">
        <span className="row" style={{ gap: 8 }}>
          <NumberField value={r.idleStopMinutes} max={60 * 24 * 14} label="Idle minutes" onSave={(v) => void saveSettings({ resources: { idleStopMinutes: v } })} />
          <span className="dim" style={{ fontSize: 12 }}>{r.idleStopMinutes ? 'minutes, outside the project you are viewing' : 'never (0)'}</span>
        </span>
      </Row>
      <Row label="Leaving a project with idle CLIs">
        <Seg
          value={r.onProjectSwitch}
          onChange={(v) => void saveSettings({ resources: { onProjectSwitch: v } })}
          options={[
            { value: 'ask', label: 'ask' },
            { value: 'keep', label: 'keep running' },
            { value: 'stop', label: 'stop them' },
          ]}
        />
      </Row>
      <Row label="Archiving a change stops its CLIs">
        <Switch on={r.stopOnArchive} onChange={(v) => void saveSettings({ resources: { stopOnArchive: v } })} label="Stop CLIs on archive" />
      </Row>
      <div className="flabel" style={{ margin: '10px 0 6px' }}>
        Running now · {running.length}
        {r.maxRunning ? ` of ${r.maxRunning}` : ''}
      </div>
      {!running.length && <div className="dim" style={{ fontSize: 12 }}>Nothing running.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="running-list">
        {running.map((t) => (
          <div key={t.id} className="row" style={{ gap: 8, minHeight: 30 }}>
            <Glyph service={t.spec.service} />
            <span className="grow" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span className="ell" style={{ fontWeight: 500 }}>
                {t.spec.role || t.spec.service} <span className="dim" style={{ fontWeight: 400, fontSize: 12 }}>· {t.approval ? 'waiting for approval' : t.activity === 'busy' ? 'working' : 'idle'}</span>
              </span>
              <span className="dim ell" style={{ fontSize: 11.5 }}>
                {projects.find((p) => p.id === t.projectId)?.name || t.projectId} · {t.change || 'workspace'}
              </span>
            </span>
            <button className="btn sm" onClick={() => stop(t.id)} data-testid={`stop-${t.spec.role || t.spec.service}`}>
              Stop
            </button>
          </div>
        ))}
      </div>
    </Group>
  );
}

export function SettingsPanel({ mobile }: { mobile?: boolean }) {
  const s = useStore();
  const st = s.settings;
  const [dets, setDets] = useState<Record<string, ServiceDetect>>({});
  const [fontPick, setFontPick] = useState(false);
  useEffect(() => {
    void get<ServiceDetect[]>('/api/services').then((list) => setDets(Object.fromEntries(list.map((d) => [d.id, d]))), () => undefined);
  }, [st?.services.claude.bin, st?.services.codex.bin, st?.services.opencode.bin]);
  useEffect(() => {
    if (s.settingsAnchor) {
      document.getElementById(s.settingsAnchor)?.scrollIntoView({ behavior: 'smooth' });
      useStore.setState({ settingsAnchor: null });
    }
  }, [s.settingsAnchor]);
  if (!st) return null;
  const ap = st.appearance;
  const setAp = (p: Partial<Settings['appearance']>) => void saveSettings({ appearance: p });
  const notifToggle = async (key: 'approval' | 'finished' | 'sound', v: boolean) => {
    if (v && key !== 'sound' && typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission();
    await saveSettings({ notifications: { [key]: v } });
  };
  const exportAll = () => downloadJson('cayrnx-settings.json', { cayrnx: s.meta?.version, settings: st, registries: s.registries });
  const importAll = async () => {
    const text = await readFileText();
    if (!text) return;
    try {
      const j = JSON.parse(text);
      if (j.settings) await put('/api/settings', j.settings);
      if (j.registries) for (const k of ['docTypes', 'changeTypes', 'layouts'] as const) if (j.registries[k]) await put(`/api/registries/${k}`, j.registries[k]);
      toast('Settings imported', 'ok');
    } catch (e) {
      errToast(e);
    }
  };
  const anchors = [
    ['set-app', 'Appearance'],
    ['set-btn', 'Buttons'],
    ['set-briefs', 'Briefs'],
    ['set-svc', 'Services'],
    ['set-running', 'Running CLIs'],
    ['set-notif', 'Notifications'],
    ['set-access', 'Access'],
    ['set-projects', 'Projects'],
    ['set-about', 'About'],
  ];
  return (
    <>
      {!mobile && (
        <div className="phead">
          <div className="ptitle">Settings</div>
        </div>
      )}
      <div className="pbody">
        <div className="row" style={{ flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
          {anchors.map(([id, label]) => (
            <a key={id} className="anchor" href={`#${id}`} onClick={(e) => (e.preventDefault(), document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }))}>
              {label}
            </a>
          ))}
        </div>

        <Group id="set-app" title="Appearance & terminals">
          <div className="field" style={{ marginBottom: 10 }}>
            <span className="flabel">Colour theme · app and terminals</span>
            <div className="themegrid" data-testid="theme-grid">
              {THEME_OPTIONS.map((o) => {
                const pal = paletteById(o.id);
                const sw = pal ? pal.swatch : ['#101214', '#e3a857', '#7db0ff', '#6fc893'];
                return (
                  <button key={o.id} className={cls('themecard', (ap.palette || 'cayrnx') === o.id && 'on')} onClick={() => setAp({ palette: o.id })} aria-pressed={(ap.palette || 'cayrnx') === o.id} data-testid={`theme-${o.id}`}>
                    <span className="themesw" style={{ background: sw[0] }}>
                      {sw.slice(1).map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                    <span className="ell">{o.name}</span>
                    <span className="dim" style={{ fontSize: 10.5 }}>{o.mode || 'dark · light'}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <Row label={(ap.palette || 'cayrnx') === 'cayrnx' ? 'Theme' : 'Cayrnx theme mode'}>
            <Seg
              value={ap.theme}
              onChange={(v) => setAp({ theme: v, palette: 'cayrnx' })}
              options={[
                { value: 'dark', label: <><Icon d={I.moon} size={13} />Dark</> },
                { value: 'light', label: <><Icon d={I.sun} size={13} />Light</> },
                { value: 'system', label: 'System' },
              ]}
            />
          </Row>
          <Row label="Mono font">
            <button className="btn sm" onClick={() => setFontPick(!fontPick)} style={{ fontFamily: TERM_FONTS[ap.monoFont] }}>
              {ap.monoFont}
              <Icon d={I.down} size={12} />
            </button>
          </Row>
          {fontPick && (
            <div style={{ border: '1px solid var(--line)', borderRadius: 9, padding: 4, marginBottom: 10, background: 'var(--bg)' }}>
              {Object.entries(TERM_FONTS).map(([name, stack]) => (
                <button key={name} className={cls('fontopt', ap.monoFont === name && 'on')} onClick={() => (setAp({ monoFont: name }), setFontPick(false))}>
                  <span className="grow" style={{ fontFamily: stack }}>
                    {name}
                  </span>
                  <span style={{ fontFamily: stack }} className="dim">
                    session.ts:142 {'{}'} =&gt;
                  </span>
                </button>
              ))}
            </div>
          )}
          <Row label="Font size">
            <button className="ibtn sm" onClick={() => setAp({ fontSize: Math.max(9, ap.fontSize - 1) })} aria-label="Smaller">
              <Icon d={I.minus} size={13} />
            </button>
            <span className="mono" style={{ width: 34, textAlign: 'center' }}>
              {ap.fontSize}px
            </span>
            <button className="ibtn sm" onClick={() => setAp({ fontSize: Math.min(24, ap.fontSize + 1) })} aria-label="Larger">
              <Icon d={I.plus} size={13} />
            </button>
          </Row>
          <Row label="Line height">
            <Seg value={String(ap.lineHeight)} onChange={(v) => setAp({ lineHeight: Number(v) })} options={['1.2', '1.3', '1.5'].map((v) => ({ value: v, label: v }))} />
          </Row>
          <Row label="Cursor">
            <Seg value={ap.cursor} onChange={(v) => setAp({ cursor: v })} options={(['block', 'bar', 'underline'] as const).map((v) => ({ value: v, label: v }))} />
          </Row>
          <Row label="Status labels">
            <Seg
              value={ap.statusLabels}
              onChange={(v) => setAp({ statusLabels: v })}
              options={[
                { value: 'dots', label: '● dots' },
                { value: 'numbers', label: '①②③' },
              ]}
            />
          </Row>
          <Row label="CLI colours">
            <Seg
              value={ap.cliColors || 'theme'}
              onChange={(v) => setAp({ cliColors: v })}
              options={[
                { value: 'theme', label: 'Follow the theme', title: "Claude Code uses its ANSI theme and OpenCode its system theme, both drawn from this theme's colours" },
                { value: 'own', label: "CLI's own theme", title: 'Each CLI keeps the theme set inside it' },
              ]}
            />
          </Row>
          <div className="fhelp" style={{ lineHeight: 1.5 }}>
            {(ap.cliColors || 'theme') === 'theme'
              ? 'The CLIs draw with the theme\'s colours: OpenCode repaints as soon as you switch, Claude Code and new tabs pick up a switch between dark and light on Relaunch. Your own CLI settings are left untouched.'
              : 'The CLIs keep their own themes; only the terminal background and its 16 colours follow the app theme. Changes apply to tabs launched from now on.'}
          </div>
        </Group>

        <Group id="set-btn" title="Buttons">
          <Row label="Read button default">
            <Seg
              value={st.buttons.readBehavior || 'insert'}
              onChange={(v) => void saveSettings({ buttons: { readBehavior: v } })}
              options={[
                { value: 'insert', label: 'Add to prompt', title: "Adds the Read to what you've typed in the CLI; you press Enter" },
                { value: 'stage', label: 'Stage', title: "Puts it in Cayrnx's composer box under the terminal" },
              ]}
            />
          </Row>
          <Row label="Write button default">
            <Seg
              value={st.buttons.writeBehavior}
              onChange={(v) => void saveSettings({ buttons: { writeBehavior: v } })}
              options={[
                { value: 'insert', label: 'Add to prompt', title: 'Adds the instruction to the end of what you have typed in the CLI; you press Enter' },
                { value: 'fill', label: 'Send now' },
                { value: 'stage', label: 'Stage' },
              ]}
            />
          </Row>
          <Row label="Shift+click: add to prompt ↔ send now">
            <Switch on={st.buttons.shiftInvert} onChange={(v) => void saveSettings({ buttons: { shiftInvert: v } })} label="Shift inverts" />
          </Row>
          <Row label="Staged text shows as">
            <Seg
              value={st.buttons.stagedPlacement}
              onChange={(v) => void saveSettings({ buttons: { stagedPlacement: v } })}
              options={[
                { value: 'overlay', label: 'Composer overlay' },
                { value: 'toolbar', label: 'Toolbar strip' },
              ]}
            />
          </Row>
          <Row label="Shortcuts">
            <span className="kbd">Alt+R</span>
            <span className="dim" style={{ fontSize: 11.5 }}>
              read
            </span>
            <span className="kbd">Alt+W</span>
            <span className="dim" style={{ fontSize: 11.5 }}>
              write
            </span>
          </Row>
        </Group>

        <Group id="set-briefs" title="Briefs">
          <Row label="New changes get a worktree">
            <Switch on={!!st.briefs.worktreeDefault} onChange={(v) => void saveSettings({ briefs: { worktreeDefault: v } })} label="New changes get a worktree" />
          </Row>
          <div className="note" style={{ marginBottom: 8 }}>
            {st.briefs.worktreeDefault
              ? "Each new change starts on its own branch in a separate checkout. The CLIs' edits and commits stay there until you merge that branch."
              : 'Off: the CLIs run in the project folder, like terminals you opened there, and commit to your current branch. You can still turn a worktree on for one change in New change.'}
          </div>
          <Row label="History kept">
            <Seg
              value={String(st.briefs.keep)}
              onChange={(v) => void saveSettings({ briefs: { keep: v === 'all' ? 'all' : Number(v) } })}
              options={['all', '10', '5', '3'].map((v) => ({ value: v, label: v }))}
            />
          </Row>
          <div className="note" style={{ marginBottom: 8 }}>
            Briefs are numbered files, not git history — pruning (a change's ⋯ menu) deletes older versions for good and always asks first.
          </div>
          <Row label="Unread dots tracked">
            <Seg
              value={st.briefs.unreadMode}
              onChange={(v) => void saveSettings({ briefs: { unreadMode: v } })}
              options={[
                { value: 'user', label: 'per user' },
                { value: 'tab', label: 'per tab', title: "A doc stays unread for a tab until a Read of it was sent from that tab" },
              ]}
            />
          </Row>
          <MessageTemplates st={st} />
        </Group>

        <Group id="set-svc" title="Services / adapters">
          {SERVICE_IDS.map((id) => (
            <ServiceRow key={id} id={id} st={st} det={dets[id]} onDet={(d) => setDets((x) => ({ ...x, [id]: d }))} />
          ))}
        </Group>

        <RunningGroup st={st} />

        <Group id="set-notif" title="Notifications">
          <Row label="Desktop notification: approval needed">
            <Switch on={st.notifications.approval} onChange={(v) => void notifToggle('approval', v)} label="Approval notifications" />
          </Row>
          <Row label="Desktop notification: tab finished">
            <Switch on={st.notifications.finished} onChange={(v) => void notifToggle('finished', v)} label="Finished notifications" />
          </Row>
          <Row label="Sound">
            <Switch on={st.notifications.sound} onChange={(v) => void notifToggle('sound', v)} label="Sound" />
          </Row>
          {!window.isSecureContext && <div className="note">Needs a secure context: works on localhost and over the HTTPS tunnels, not on plain-HTTP LAN.</div>}
        </Group>

        <AccessGroup st={st} />
        <ProjectsGroup />

        <Group id="set-about" title="About" last>
          <Row label="Cayrnx">
            <span className="mono dim">{s.meta?.version}</span>
          </Row>
          <div className="mono dim" style={{ fontSize: 11, lineHeight: 1.7, wordBreak: 'break-all' }}>
            {s.meta?.paths.config}
            <br />
            {s.meta?.paths.registries}/
            <br />
            {s.meta?.paths.state}/
          </div>
          <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={exportAll}>
              Export all settings
            </button>
            <button className="btn sm ghost" onClick={() => void importAll()}>
              Import…
            </button>
            <span className="grow" />
            <button className="btn sm" onClick={() => void logout()}>
              <Icon d={I.logout} size={13} />
              Sign out
            </button>
          </div>
        </Group>
      </div>
    </>
  );
}
