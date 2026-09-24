import { useCallback, useEffect, useState } from 'react';
import type { GitChange, GitChanges } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { enc, get } from '../api.ts';
import { activeTabId, curChange, curProject, openGitDiff, useStore } from '../store.ts';
import { Empty } from '../components/common.tsx';
import { cls } from '../util.ts';
import { useFilesRoot } from './FilesPanel.tsx';

// Changes (like VS Code's Source Control view, read-only): what changed in the change's folder
// since the last commit, split into staged and not staged. Click a file for its diff.

const WORD: Record<GitChange['status'], string> = { M: 'modified', A: 'added', D: 'deleted', R: 'renamed', U: 'untracked', C: 'conflict' };

export function useGitChanges(root: string | null, pid: string | null) {
  const [data, setData] = useState<GitChanges | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!root || !pid) return;
    try {
      setData(await get<GitChanges>(`/api/projects/${pid}/git-changes?root=${enc(root)}`));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [root, pid]);
  useEffect(() => {
    setData(null);
    void load();
    // Agents change files while you watch: keep it current while the panel is open.
    const iv = window.setInterval(() => document.visibilityState === 'visible' && void load(), 5000);
    const f = () => void load();
    window.addEventListener('focus', f);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener('focus', f);
    };
  }, [load]);
  return { data, err, load };
}

function Row({ root, g, staged, sel }: { root: string; g: GitChange; staged: boolean; sel: boolean }) {
  const slash = g.path.lastIndexOf('/');
  const name = g.path.slice(slash + 1);
  const dir = slash > 0 ? g.path.slice(0, slash) : '';
  return (
    <button
      className={cls('frow', 'gcrow', sel && 'sel')}
      onClick={() => openGitDiff(root, g.path, staged)}
      title={`${g.from ? `${g.from} → ` : ''}${g.path} · ${WORD[g.status]}`}
      data-testid={`gc-${staged ? 'staged' : 'work'}-${g.path}`}
    >
      <span className={cls('ell', g.status === 'D' && 'gcdel')} style={{ fontWeight: 500 }}>
        {name}
      </span>
      <span className="dim ell" style={{ fontSize: 11.5, flexShrink: 1 }}>
        {dir}
      </span>
      <span className="grow" />
      {g.add !== null && g.add > 0 && <span className="gcn add">+{g.add}</span>}
      {g.del !== null && g.del > 0 && <span className="gcn del">−{g.del}</span>}
      <span className={cls('gm', `gs-${g.status}`)} title={WORD[g.status]}>
        {g.status}
      </span>
    </button>
  );
}

export function ChangesPanel({ mobile }: { mobile?: boolean }) {
  const s = useStore();
  const p = curProject(s);
  const c = curChange(s);
  const root = useFilesRoot();
  const { data, err, load } = useGitChanges(root, p?.id || null);
  const [shut, setShut] = useState<Record<string, boolean>>({});
  useEffect(() => {
    void load();
  }, [c?.activity, load]);
  const active = activeTabId(s);
  const activeDoc = s.docTabs.find((d) => d.id === active);
  const isSel = (g: GitChange, staged: boolean) => activeDoc?.kind === 'diff' && activeDoc.root === root && activeDoc.path === g.path && !!activeDoc.staged === staged;
  const all = data ? [...data.staged, ...data.changes] : [];
  const adds = all.reduce((n, g) => n + (g.add || 0), 0);
  const dels = all.reduce((n, g) => n + (g.del || 0), 0);

  const group = (key: 'staged' | 'changes', title: string, list: GitChange[]) =>
    list.length > 0 && (
      <>
        <button className="secthead" onClick={() => setShut((x) => ({ ...x, [key]: !x[key] }))} aria-expanded={!shut[key]}>
          <Icon d={I.right} size={12} cls={cls('chev', !shut[key] && 'open')} />
          {title} ({list.length})
        </button>
        {!shut[key] && list.map((g) => <Row key={`${key}-${g.path}`} root={root!} g={g} staged={key === 'staged'} sel={isSel(g, key === 'staged')} />)}
      </>
    );

  return (
    <>
      {!mobile && (
        <div className="phead">
          <div className="ptitle">Changes</div>
          <button className="ibtn" onClick={() => void load()} aria-label="Refresh" title="Refresh">
            <Icon d={I.refresh} size={16} />
          </button>
        </div>
      )}
      <div className="pbody" style={{ paddingTop: 4 }} data-testid="changes-panel">
        {!p ? (
          <Empty icon={I.files} title="No project open" />
        ) : err ? (
          <div className="warnrow">{err}</div>
        ) : !data ? (
          <div className="dim" style={{ padding: 12 }}>
            Loading…
          </div>
        ) : !data.repo ? (
          <Empty icon={I.branch} title="Not a git repository">This folder isn't in a git repository, so there's nothing to compare against.</Empty>
        ) : (
          <>
            <div className="row gchead">
              <Icon d={I.branch} size={13} />
              <span className="mono ell">{data.branch || 'detached HEAD'}</span>
              <span className="grow" />
              {all.length > 0 && (
                <span className="dim" style={{ fontSize: 11.5 }}>
                  {all.length} file{all.length > 1 ? 's' : ''} · <span className="gcn add">+{adds}</span> <span className="gcn del">−{dels}</span>
                </span>
              )}
            </div>
            {all.length === 0 ? (
              <Empty icon={I.check} title="No changes">Nothing has changed since the last commit.</Empty>
            ) : (
              <>
                {group('staged', 'Staged changes', data.staged)}
                {group('changes', data.staged.length ? 'Not staged' : 'Changes', data.changes)}
              </>
            )}
          </>
        )}
      </div>
      {!mobile && data?.repo && (
        <div className="pfoot row" style={{ gap: 8 }}>
          <span className="dim grow ell" title="Staged: what `git commit` records now. Not staged: edits `git add` hasn't picked up yet, and new files.">
            Read-only · commit from a terminal tab
          </span>
        </div>
      )}
    </>
  );
}
