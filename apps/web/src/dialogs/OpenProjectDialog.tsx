import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FolderEntry, FolderInspect, ProjectSummary } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { enc, get, post } from '../api.ts';
import { closeDialog, errToast, refreshProjects, selectProject, showPanel, toast, useStore } from '../store.ts';
import { Check, Dialog, Seg } from '../components/common.tsx';
import { basename, cls } from '../util.ts';
import { FolderPicker } from './FolderPicker.tsx';

/** Open a project folder (plan §3.10–3.11): never clones or creates, only registers. */
export function OpenProjectBody({ onOpened, inline }: { onOpened: (p: ProjectSummary) => void; inline?: boolean }) {
  const [path, setPath] = useState('');
  const [ignoreBriefs, setIgnoreBriefs] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [info, setInfo] = useState<FolderInspect | null>(null);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [adv, setAdv] = useState(false);
  const [wtRoot, setWtRoot] = useState('');
  const [watch, setWatch] = useState<'native' | 'polling'>('native');
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState<FolderEntry[]>([]);
  const [focus, setFocus] = useState(false);
  const timer = useRef<number | null>(null);

  const target = (path.trim() || sel || '').replace(/\/+$/, '') || null;
  useEffect(() => {
    if (!target) return setInfo(null);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void get<FolderInspect>(`/api/fs/inspect?path=${enc(target)}`).then(setInfo, () => setInfo(null));
      if (!nameTouched) setName(basename(target));
    }, 180);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  // Path autocomplete: list the parent folder and filter by the typed prefix.
  useEffect(() => {
    const p = path.trim();
    if (!p.startsWith('/')) return setSuggest([]);
    const parent = p.endsWith('/') ? p.replace(/\/+$/, '') || '/' : p.slice(0, p.lastIndexOf('/')) || '/';
    const prefix = p.endsWith('/') ? '' : p.slice(p.lastIndexOf('/') + 1).toLowerCase();
    let alive = true;
    void get<{ entries: FolderEntry[] }>(`/api/fs/browse?path=${enc(parent)}`).then(
      (l) => alive && setSuggest(l.entries.filter((e) => e.name.toLowerCase().startsWith(prefix) && e.path !== p).slice(0, 12)),
      () => alive && setSuggest([]),
    );
    return () => {
      alive = false;
    };
  }, [path]);

  const open = async (gitInit = false) => {
    if (!target) return;
    setBusy(true);
    try {
      const r = await post<{ project: ProjectSummary; ignoreFile: string | null }>('/api/projects/open', { path: target, name: name.trim() || undefined, worktreeRoot: wtRoot.trim() || null, watchMode: watch, ignoreBriefs });
      let proj = r.project;
      if (gitInit) proj = await post<ProjectSummary>(`/api/projects/${proj.id}/git-init`, { ignoreBriefs });
      await refreshProjects();
      await selectProject(proj.id);
      toast(`Opened ${proj.name}${(r.ignoreFile || (gitInit && ignoreBriefs)) && !info?.ignored ? ' · /briefs added to .gitignore' : ''}${gitInit ? ' · git initialised' : ''}`, 'ok');
      onOpened(proj);
    } catch (e) {
      errToast(e);
    } finally {
      setBusy(false);
    }
  };

  let chip: ReactNode = null;
  if (info) {
    if (!info.allowed) chip = <span className="gitchip bad">outside the allowed folders</span>;
    else if (!info.exists || !info.isDir) chip = <span className="gitchip bad">folder not found</span>;
    else if (info.isGit) chip = <span className="gitchip ok">git repo ✓ · branch {info.branch || '?'}</span>;
    else
      chip = (
        <>
          <span className="gitchip no">not a git repo: worktrees off</span>
          <button className="btn sm" onClick={() => void open(true)} disabled={busy} title="Runs git init in the folder, then opens it">
            Initialize git
          </button>
        </>
      );
  }
  const ok = !!info && info.allowed && info.exists && info.isDir;
  const plan = !target
    ? '# pick a folder'
    : [
        `register ${target} as "${name.trim() || basename(target)}"${info?.registered ? '  (already registered — reopens it)' : ''}`,
        info?.isGit
          ? info.ignored
            ? `# ${info.ignorePath} already ignores briefs`
            : ignoreBriefs
              ? `append /briefs to ${info.ignorePath}`
              : '# briefs/ will show up in git (commit them with your code)'
          : '# not a git repo — worktrees off',
        `watch ${target}/briefs/ (${watch})`,
        `worktrees in ${wtRoot.trim() || '$CAYRNX_HOME/worktrees'}/<project>/<change>`,
      ].join('\n');

  return (
    <>
      <div className={inline ? '' : 'dbody'}>
        <div className="field" style={{ position: 'relative' }}>
          <label className="flabel" htmlFor="op-path">
            Folder path
          </label>
          <input
            id="op-path"
            type="text"
            className="mono"
            placeholder="/projects/my-app"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => window.setTimeout(() => setFocus(false), 150)}
            onKeyDown={(e) => e.key === 'Enter' && ok && void open()}
            autoComplete="off"
          />
          {focus && suggest.length > 0 && (
            <div className="acomplete" style={{ top: 58 }}>
              {suggest.map((e) => (
                <button key={e.path} className="fbrow" onMouseDown={(ev) => (ev.preventDefault(), setPath(e.path + '/'))}>
                  <Icon d={I.files} size={13} cls="fx-dir" />
                  <span className="mono ell">{e.path}</span>
                  {e.isGit && <span className="gm U">git</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <FolderPicker onSelect={(d) => (setSel(d), setPath(''))} selected={sel} height={inline ? 180 : 220} />
        <div className="row" style={{ gap: 8, margin: '10px 0', minHeight: 24, flexWrap: 'wrap' }}>
          {chip}
        </div>
        {ok && !info?.ignored && (
          <div className="field">
            <button className="row" style={{ gap: 8, alignItems: 'flex-start', textAlign: 'left' }} onClick={() => setIgnoreBriefs(!ignoreBriefs)} aria-pressed={ignoreBriefs} data-testid="op-ignore-briefs">
              <Check on={ignoreBriefs} />
              <span>
                Keep briefs out of git — adds <span className="mono">/briefs</span> to the project's <span className="mono">.gitignore</span>
              </span>
            </button>
            <span className="fhelp" style={{ paddingLeft: 24 }}>
              Briefs are the working notes Cayrnx and the CLIs write for each change. Delete the line later if you want to commit them.
            </span>
          </div>
        )}
        <div className="field">
          <label className="flabel" htmlFor="op-name">
            Name
          </label>
          <input id="op-name" type="text" value={name} onChange={(e) => (setName(e.target.value), setNameTouched(true))} placeholder="defaults to the folder name" />
        </div>
        <button className="histt" style={{ paddingLeft: 0, fontSize: 12 }} onClick={() => setAdv(!adv)}>
          <Icon d={I.right} size={11} cls={cls('chev', adv && 'open')} />
          Advanced
        </button>
        {adv && (
          <>
            <div className="field" style={{ marginTop: 8 }}>
              <label className="flabel" htmlFor="op-wt">
                Worktree root
              </label>
              <input id="op-wt" type="text" className="mono" value={wtRoot} onChange={(e) => setWtRoot(e.target.value)} placeholder="$CAYRNX_HOME/worktrees (default)" />
              <span className="fhelp">Never inside the project, so its test runners and linters don't scan the copies.</span>
            </div>
            <div className="field">
              <span className="flabel">Watch mode</span>
              <Seg
                value={watch}
                onChange={setWatch}
                options={[
                  { value: 'native', label: 'native (inotify)' },
                  { value: 'polling', label: 'polling' },
                ]}
              />
              <span className="fhelp">Use polling for network shares (NFS/SMB) and bind mounts from another host — inotify misses their writes.</span>
            </div>
          </>
        )}
        <div className="mlabel" style={{ padding: '8px 0 6px' }}>
          Opening does exactly this
        </div>
        <div className="cmd" style={{ color: 'var(--muted)' }}>
          {plan}
        </div>
      </div>
      <div className={inline ? 'row' : 'dfoot'} style={inline ? { gap: 8, marginTop: 14 } : undefined}>
        <span className="grow" />
        {!inline && (
          <button className="btn" onClick={closeDialog}>
            Cancel
          </button>
        )}
        <button className="btn primary" onClick={() => void open()} disabled={!ok || busy} data-testid="open-project">
          Open
        </button>
      </div>
    </>
  );
}

export function OpenProjectDialog() {
  return (
    <Dialog title="Open project" width={600} onClose={closeDialog}>
      <OpenProjectBody onOpened={() => closeDialog()} />
    </Dialog>
  );
}
