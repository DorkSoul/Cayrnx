import { useSyncExternalStore } from 'react';

// Installing Cayrnx as an app (Settings → Install app). Chrome/Edge on Android and desktop fire
// beforeinstallprompt, which we hold on to so a button can show the install dialog later; it has
// to be caught before React mounts, hence the listener at import time. iOS Safari has no such
// event: the only way in is Share → Add to Home Screen, so there we show the steps instead.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
}

/** Running as the installed app (home-screen icon), not in a browser tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/** iPhone / iPad (iPadOS reports itself as a Mac, but with touch). */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export type InstallState =
  | 'standalone' // already the app: nothing to offer
  | 'installed' // just installed from this tab
  | 'prompt' // the browser's install dialog is ready
  | 'ios' // Share → Add to Home Screen
  | 'insecure' // plain-HTTP LAN: browsers only install over HTTPS or localhost
  | 'manual'; // no prompt (yet, or this browser never gives one): use the browser menu

function snapshot(): InstallState {
  if (isStandalone()) return 'standalone';
  if (installed) return 'installed';
  if (deferred) return 'prompt';
  if (isIos()) return 'ios';
  if (!window.isSecureContext) return 'insecure';
  return 'manual';
}

function subscribe(f: () => void) {
  subs.add(f);
  const mq = window.matchMedia('(display-mode: standalone)');
  mq.addEventListener('change', f);
  return () => {
    subs.delete(f);
    mq.removeEventListener('change', f);
  };
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, snapshot);
}

/** Shows the browser's install dialog. The event is single use, whatever the answer. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  emit();
  return outcome === 'accepted';
}
