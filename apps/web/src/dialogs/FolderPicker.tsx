import { useEffect, useState } from 'react';
import type { FolderEntry } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { enc, get } from '../api.ts';
import { cls } from '../util.ts';

interface Listing {
  path: string | null;
  parent: string | null;
  entries: FolderEntry[];
  /** Shortcuts: the allowed folders, or (no limit) home, / and where your projects live. */
  roots: string[];
  limited?: boolean;
}

/**
 * Server-side folder browser limited to the allowed roots (Open project, Working dir, S14).
 * With `onSelect`, a click selects and a double-click opens; otherwise a click opens.
 */
export function FolderPicker({
  start,
  onPick,
  onSelect,
  selected,
  height = 200,
}: {
  start?: string | null;
  onPick?: (dir: string) => void;
  onSelect?: (dir: string) => void;
  selected?: string | null;
  height?: number;
}) {
  const [dir, setDir] = useState<string | null>(start || null);
  const [list, setList] = useState<Listing | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setErr(null);
    get<Listing>(`/api/fs/browse${dir ? `?path=${enc(dir)}` : ''}`).then(
      (l) => alive && setList(l),
      (e) => {
        if (!alive) return;
        // Outside the allowed roots (or gone): fall back to the first root.
        if (dir) setDir(null);
        else setErr(e.message);
      },
    );
    return () => {
      alive = false;
    };
  }, [dir]);
  const go = (p: string) => {
    setDir(p);
    onSelect?.(p);
  };
  if (err) return <div className="warnrow">{err}</div>;
  return (
    <div>
      {list && list.roots.length > 1 && (
        <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
          {list.roots.map((r) => (
            <button key={r} className={cls('sugg', list.path === r && 'on')} onClick={() => go(r)} title={r} data-testid={`place-${r}`}>
              {r === '/' ? '/ (root)' : r}
            </button>
          ))}
        </div>
      )}
      <div className="mono dim ell" style={{ fontSize: 11, margin: '0 0 4px 2px' }} title={list?.path || ''}>
        {list?.path || '…'}
      </div>
      <div className="fbrowser" style={{ height }} role="listbox" aria-label="Folders">
        {list?.parent && (
          <button className="fbrow" onClick={() => go(list.parent!)}>
            <Icon d={I.left} size={13} cls="dim" />
            <span className="dim">..</span>
          </button>
        )}
        {list?.entries.map((e) => (
          <button
            key={e.path}
            className={cls('fbrow', selected === e.path && 'sel')}
            onClick={() => (onSelect ? onSelect(e.path) : go(e.path))}
            onDoubleClick={() => (onSelect ? go(e.path) : onPick?.(e.path))}
            role="option"
            aria-selected={selected === e.path}
            title={e.path}
          >
            <Icon d={I.files} size={14} cls="fx-dir" />
            <span className="ell">{e.name}</span>
            {e.isGit && (
              <span className="gm U" title="git repository">
                git
              </span>
            )}
          </button>
        ))}
        {list && !list.entries.length && <div className="dim" style={{ padding: 8, fontSize: 12 }}>No sub-folders.</div>}
      </div>
      {onPick && list?.path && (
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <span className="grow" />
          <button className="btn sm primary" onClick={() => onPick(list.path!)}>
            Use this folder
          </button>
        </div>
      )}
    </div>
  );
}
