import { useEffect } from 'react';
import { setUnauthenticatedHandler } from './api.ts';
import { activeTabId, boot, curChange, effectiveTheme, loadProject, togglePop, useStore } from './store.ts';
import { configureTerminals, pruneTerminals } from './terminals.ts';
import { BootScreen, Login, Setup } from './screens/Gate.tsx';
import { DesktopShell, MobileShell } from './shell/Shells.tsx';
import { Gallery } from './screens/Gallery.tsx';
import { cls } from './util.ts';

const MOBILE_Q = '(max-width: 768px)';

function useGlobalEffects(): void {
  const settings = useStore((s) => s.settings);
  const mobile = useStore((s) => s.isMobile);
  const theme = useStore((s) => effectiveTheme(s));
  const tabIds = useStore((s) => Object.keys(s.tabs).join(','));
  useEffect(() => {
    void boot();
    setUnauthenticatedHandler(() => useStore.setState({ boot: 'gate', auth: { ...useStore.getState().auth!, authenticated: false } }));
    const mq = matchMedia(MOBILE_Q);
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => useStore.setState({ isMobile: mq.matches, section: null, pop: null });
    const onDark = () => useStore.setState({ sysDark: dark.matches });
    onMq();
    mq.addEventListener('change', onMq);
    dark.addEventListener('change', onDark);
    // Re-scan on focus (plan §7: file-watch gaps on network shares).
    const onFocus = () => {
      const s = useStore.getState();
      if (s.boot === 'ready' && s.projectId) void loadProject(s.projectId).catch(() => undefined);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      mq.removeEventListener('change', onMq);
      dark.removeEventListener('change', onDark);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
  // Theme also drives the terminal glass; wait a frame so the new class is applied.
  useEffect(() => {
    document.body.style.background = theme === 'dark' ? '#101214' : '#eeebe5';
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#15181b' : '#f7f5f1');
    const r = requestAnimationFrame(() => configureTerminals(settings, mobile));
    return () => cancelAnimationFrame(r);
  }, [settings, mobile, theme]);
  useEffect(() => {
    pruneTerminals(new Set(tabIds ? tabIds.split(',') : []));
  }, [tabIds]);
  // Alt+R / Alt+W open Read / Write on the active terminal tab.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || (e.code !== 'KeyR' && e.code !== 'KeyW')) return;
      const s = useStore.getState();
      const id = activeTabId(s);
      const t = id ? s.tabs[id] : null;
      if (!t || t.kind !== 'term' || !curChange(s)) return;
      e.preventDefault();
      togglePop(e.code === 'KeyR' ? 'read' : 'write');
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, []);
}

export function App() {
  return new URLSearchParams(location.search).has('gallery') ? <Gallery /> : <CayrnxApp />;
}

function CayrnxApp() {
  useGlobalEffects();
  const s = useStore();
  const theme = effectiveTheme(s);
  if (s.boot === 'ready') return s.isMobile ? <MobileShell /> : <DesktopShell />;
  return (
    <div className={cls('cx', theme, s.isMobile && 'mx')} data-palette={s.settings?.appearance.palette}>
      {s.boot === 'gate' && s.auth ? s.auth.setUp ? <Login /> : <Setup /> : <BootScreen error={s.boot === 'error' ? s.bootError : null} />}
    </div>
  );
}
