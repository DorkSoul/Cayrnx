import { useEffect, useMemo } from 'react';
import { parseDocName } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { changesOf, curChange, curKey, curProject, loadTree, openDialog, openDoc, openFile, openGitHistory, toast, togglePop, useStore, WORKSPACE, type TreeData } from '../store.ts';
import { Empty, Popover } from '../components/common.tsx';
import { cls, copyText, fuzzy } from '../util.ts';

interface Row {
  path: string;
  name: string;
  dir: boolean;
  depth: number;
  anc: string[];
}

function buildRows(files: string[]): Row[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  const all = [...[...dirs].map((d) => ({ p: d, dir: true })), ...files.map((f) => ({ p: f, dir: false }))];
  // Folders first within each parent, then alphabetical — like an editor tree.
  const key = (x: { p: string; dir: boolean }) =>
    x.p
      .split('/')
      .map((seg, i, arr) => ((i < arr.length - 1 || x.dir ? '0' : '1') + seg.toLowerCase()))
      .join('\u0000'); // NUL sorts before every name char, so children stay right under their folder
  all.sort((a, b) => (key(a) < key(b) ? -1 : 1));
  return all.map(({ p, dir }) => {
    const parts = p.split('/');
    return { path: p, name: parts[parts.length - 1], dir, depth: parts.length - 1, anc: parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/')) };
  });
}

const EXT_CLS: Record<string, string> = { ts: 'fx-ts', tsx: 'fx-tsx', md: 'fx-md', json: 'fx-json', yml: 'fx-yml', yaml: 'fx-yaml' };

export function useFilesRoot(): string | null {
  const s = useStore();
  const p = curProject(s);
  if (!p) return null;
  const c = curChange(s);
  return c ? c.cwd : p.path;
}

export function FilesPanel({ mobile }: { mobile?: boolean }) {
  const s = useStore();
  const p = curProject(s);
  const c = curChange(s);
  const root = useFilesRoot();
  const tree = root ? s.trees[root] : undefined;
  const activity = c?.activity;
  useEffect(() => {
    if (root) void loadTree(root);
  }, [root, activity]);
  useEffect(() => {
    const f = () => root && void loadTree(root);
    window.addEventListener('focus', f);
    return () => window.removeEventListener('focus', f);
  }, [root]);

  const data = tree && 'files' in tree ? (tree as TreeData) : null;
  const rows = useMemo(() => (data ? buildRows(data.files) : []), [data]);
  const q = s.fileFilter.trim().toLowerCase();
  let visible: Row[];
  if (q) {
    const keep = new Set<string>();
    for (const r of rows) if (!r.dir && fuzzy(r.path, q)) {
      keep.add(r.path);
      r.anc.forEach((a) => keep.add(a));
    }
    visible = rows.filter((r) => keep.has(r.path));
  } else visible = rows.filter((r) => r.anc.every((a) => s.fileOpen[a]));

  const click = (r: Row) => {
    if (r.dir) {
      useStore.setState((st) => ({ fileOpen: { ...st.fileOpen, [r.path]: !st.fileOpen[r.path] } }));
      return;
    }
    useStore.setState({ fileSel: r.path });
    const bm = /^briefs\/([^/]+)\/([^/]+)$/.exec(r.path);
    const d = bm ? parseDocName(bm[2]) : null;
    if (bm && d && changesOf(s, s.projectId).some((x) => x.slug === bm[1])) {
      openDoc(bm[1], d.type, d.n);
      return;
    }
    if (root) openFile(`${root}/${r.path}`);
  };

  const parts = (root || '').split('/');
  const tail = parts[parts.length - 1];
  const head = parts.length > 3 ? `/${parts.slice(1, 3).join('/')}/…/` : parts.slice(0, -1).join('/') + '/';
  const isWs = curKey(s) === WORKSPACE || !c;

  const menu = (
    <div className="rel">
      <button className="ibtn" onClick={() => togglePop('files')} aria-label="More" title="More">
        <Icon d={I.more} size={16} fat />
      </button>
      {s.pop === 'files' && (
        <Popover title="Files" className="menu" style={{ right: 0, top: 34, width: 230 }}>
          <button className="mi" disabled={isWs} title={isWs ? 'Pick a change first' : ''} onClick={() => openDialog({ kind: 'dir' })}>
            <Icon d={I.folderOpen} />
            Change directory…
          </button>
          <button
            className="mi"
            onClick={() => {
              if (root) void copyText(root).then(() => toast(`Copied ${root}`, 'ok'));
              useStore.setState({ pop: null });
            }}
          >
            <Icon d={I.copy} />
            Copy path
          </button>
          <button className="mi" disabled={!s.fileSel || !data?.isGit} title={s.fileSel ? '' : 'Select a file first'} onClick={() => root && s.fileSel && openGitHistory(`${root}/${s.fileSel}`)}>
            <Icon d={I.branch} />
            Reveal selected file in git
          </button>
        </Popover>
      )}
    </div>
  );
  const refresh = (
    <button className="ibtn" onClick={() => root && void loadTree(root, true).then(() => toast('File tree refreshed', 'ok'))} aria-label="Refresh" title="Refresh">
      <Icon d={I.refresh} size={16} />
    </button>
  );

  return (
    <>
      {!mobile && (
        <div className="phead">
          <div className="ptitle">Files</div>
          {refresh}
          {menu}
        </div>
      )}
      <div className="pbody" style={{ paddingTop: 4 }}>
        {!p ? (
          <Empty icon={I.files} title="No project open">
            Open a project folder to browse it.
          </Empty>
        ) : (
          <>
            <div className="row" style={{ gap: 4 }}>
              <div className="crumb grow" title={root || ''}>
                <Icon d={I.files} size={13} />
                {head}
                <b>{tail}</b>
              </div>
              {mobile && refresh}
              {mobile && menu}
            </div>
            <div className="search" style={{ marginBottom: 8 }}>
              <Icon d={I.search} size={14} />
              <input type="text" placeholder="Filter files (fuzzy)" value={s.fileFilter} onChange={(e) => useStore.setState({ fileFilter: e.target.value })} aria-label="Filter files" />
            </div>
            {!tree && (
              <div className="row dim" style={{ gap: 8, padding: '10px 6px', fontSize: 12 }}>
                <span className="stc st-busy" />
                Loading tree…
              </div>
            )}
            {tree && 'error' in tree && <div className="warnrow" style={{ margin: '6px 0' }}><Icon d={I.warn} /> {tree.error}</div>}
            {data && !data.files.length && (
              <Empty icon={I.files} title="No files">
                Check the change's worktree — {root} is empty or not mounted.
              </Empty>
            )}
            {q && data && !visible.length && data.files.length > 0 && (
              <div className="dim" style={{ padding: '12px 6px', fontSize: 12 }}>
                No files match "{s.fileFilter}".
              </div>
            )}
            {visible.map((r) => {
              const g = data?.git[r.path];
              const ext = r.dir ? 'dir' : r.name.split('.').pop() || '';
              const open = !!s.fileOpen[r.path] || !!q;
              return (
                <button
                  key={r.path}
                  className={cls('frow', s.fileSel === r.path && 'sel')}
                  onClick={() => click(r)}
                  onContextMenu={(e) => {
                    if (r.dir) return;
                    e.preventDefault();
                    useStore.setState({ fileSel: r.path });
                    togglePop('filectx', { x: Math.min(e.clientX, window.innerWidth - 240), y: e.clientY, id: r.path });
                  }}
                  title={r.path}
                  data-testid={`file-${r.path}`}
                >
                  {Array.from({ length: r.depth }, (_, i) => (
                    <span key={i} className="guide" />
                  ))}
                  <span style={{ width: 6 }} />
                  {r.dir ? <Icon d={I.right} size={12} cls={cls('chev', open && 'open')} /> : <span style={{ width: 12 }} />}
                  <Icon d={r.dir ? (open ? I.folderOpen : I.files) : I.file} cls={r.dir ? 'fx-dir' : EXT_CLS[ext] || ''} />
                  <span className="ell">{r.name}</span>
                  {g && (
                    <span className={`gm ${g === 'U' ? 'U' : 'M'}`} title={g === 'U' ? 'Untracked' : g === 'A' ? 'Added' : g === 'D' ? 'Deleted' : 'Modified'}>
                      {g}
                    </span>
                  )}
                </button>
              );
            })}
            {data?.truncated && <div className="note" style={{ padding: 6 }}>Large tree — showing the first 8000 files. Use the filter.</div>}
            {s.pop === 'filectx' && s.popAt?.id && root && (
              <div className="pop menu" style={{ position: 'fixed', left: s.popAt.x, top: s.popAt.y, width: 230 }}>
                <div className="mlabel ell">{s.popAt.id}</div>
                <button className="mi" onClick={() => click({ path: s.popAt!.id!, name: '', dir: false, depth: 0, anc: [] })}>
                  <Icon d={I.file} />
                  Open as doc tab
                </button>
                <button className="mi" onClick={() => (useStore.setState({ pop: null }), void copyText(`${root}/${s.popAt!.id}`).then(() => toast('Copied path', 'ok')))}>
                  <Icon d={I.copy} />
                  Copy path
                </button>
                <button className="mi" disabled={!data?.isGit} onClick={() => openGitHistory(`${root}/${s.popAt!.id}`)}>
                  <Icon d={I.branch} />
                  Reveal in git
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {!mobile && <div className="pfoot dim">Click a brief .md to open it as a doc tab · other files open read-only</div>}
    </>
  );
}
