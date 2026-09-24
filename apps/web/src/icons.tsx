import type { CSSProperties } from 'react';

/** Icon paths from the prototype (24×24, stroked). */
export const I = {
  files: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  briefs: 'M9 3.5h6v3H9zM7 5H5.5A1.5 1.5 0 0 0 4 6.5v13A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 18.5 5H17M8 11h8M8 15h5',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v4h4M12 7.5V12l3 2',
  setups: 'M4 4.5h7v6H4zM13 4.5h7v3h-7zM13 9.5h7v10h-7zM4 12.5h7v7H4z',
  settings: 'M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4',
  down: 'M6 9l6 6 6-6',
  up: 'M6 15l6-6 6 6',
  right: 'M9 6l6 6-6 6',
  left: 'M15 6l-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  minus: 'M5 12h14',
  read: 'M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13',
  write: 'M12 3v10M8 9.5l4 4 4-4M5 16v2.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V16',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  enter: 'M19 5v6a3 3 0 0 1-3 3H6M10 10l-4 4 4 4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  refresh: 'M19.5 10A8 8 0 0 0 5 7.5M4.5 4v4h4M4.5 14A8 8 0 0 0 19 16.5M19.5 20v-4h-4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  kebab: 'M12 5h.01M12 12h.01M12 19h.01',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
  term: 'M4 5h16v14H4zM8 10l3 2-3 2M13 15h3',
  tiles: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  board: 'M4 4h4.5v16H4zM10 4h4v11h-4zM15.5 4H20v8h-4.5z',
  focus: 'M4 5h16v14H4z',
  archive: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
  branch: 'M6 4v10M6 14a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM18 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 9c0 5-7 3.5-12 7',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  warn: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  check: 'M5 12.5l4.5 4.5L19 7',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  upload: 'M12 15V4M8 8l4-4 4 4M5 14v5h14v-5',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  hand: 'M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7-2.4 0-4-1.4-5.4-3.8L4 14a1.5 1.5 0 0 1 2.6-1.5L8 14.5',
  diff: 'M8 4v7M4.5 7.5h7M13 17h7M6 20.5h12',
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13',
  sidebar: 'M4 4h16v16H4zM9.5 4v16',
  clear: 'M4 7h16M4 12h10M4 17h6M15 15l5 5M20 15l-5 5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  play: 'M7 5v14l11-7z',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  code: 'M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14',
  folderOpen: 'M3 18V7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1M3 18l2.6-6.6A2 2 0 0 1 7.5 10H21l-2.6 7.6A2 2 0 0 1 16.5 19H4',
  key: 'M14.5 9.5a4 4 0 1 0-3.6 4l1.1 1.1H14v2h2v2h2.5v-2.4l-4.3-4.3a4 4 0 0 0 .3-2.4zM9 8.5h.01',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 9h17M3.5 15h17M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
  download: 'M12 4v11M8 11l4 4 4-4M5 18h14',
};

export type IconName = keyof typeof I;

export function Icon({ d, size = 15, cls = '', style, fat }: { d: string; size?: number; cls?: string; style?: CSSProperties; fat?: boolean }) {
  return (
    <svg className={`ic${fat ? ' fat' : ''} ${cls}`} viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <ellipse cx="12" cy="18.6" rx="8" ry="3" />
      <ellipse cx="11.2" cy="12.4" rx="5.6" ry="2.6" />
      <ellipse cx="12.4" cy="7" rx="3.4" ry="2.1" />
    </svg>
  );
}
