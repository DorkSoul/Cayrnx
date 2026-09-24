import { useState } from 'react';
import { Check, Dialog, Glyph } from '../components/common.tsx';
import { closeDialog, idleRunning, saveSettings, stopIdle, useStore } from '../store.ts';

/** Leaving a project with idle CLIs: keep them running, or stop them (they stay resumable). */
export function BgTabsDialog({ projectId }: { projectId: string }) {
  const s = useStore();
  const [remember, setRemember] = useState(false);
  const name = s.projects.find((p) => p.id === projectId)?.name || 'the previous project';
  const idle = idleRunning(s, projectId);
  const busy = Object.values(s.tabs).filter((t) => t.projectId === projectId && t.kind === 'term' && t.proc === 'running' && !idle.includes(t));
  const choose = async (v: 'keep' | 'stop') => {
    closeDialog();
    if (remember) await saveSettings({ resources: { onProjectSwitch: v } }).catch(() => undefined);
    if (v === 'stop') await stopIdle(projectId);
  };
  return (
    <Dialog
      title={`CLIs still running in ${name}`}
      width={460}
      onClose={closeDialog}
      footer={
        <>
          <button className="row" style={{ gap: 8, fontSize: 12.5 }} onClick={() => setRemember(!remember)} aria-pressed={remember} data-testid="bg-remember">
            <Check on={remember} />
            Remember my choice
          </button>
          <span className="grow" />
          <button className="btn" onClick={() => void choose('keep')} data-testid="bg-keep">
            Keep running
          </button>
          <button className="btn primary" onClick={() => void choose('stop')} data-testid="bg-stop">
            Stop idle CLIs
          </button>
        </>
      }
    >
      <div className="dbody">
        <p style={{ margin: '0 0 10px' }}>
          {idle.length} idle CLI{idle.length > 1 ? 's' : ''} {idle.length > 1 ? 'are' : 'is'} still running there. Stopping frees the machine; each tab stays put with <b>Resume session</b>, so nothing is lost.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {idle.map((t) => (
            <div key={t.id} className="row" style={{ gap: 8 }}>
              <Glyph service={t.spec.service} />
              <span style={{ fontWeight: 500 }}>{t.spec.role || t.spec.service}</span>
              <span className="dim ell">{t.change || 'workspace'} · idle</span>
            </div>
          ))}
          {busy.map((t) => (
            <div key={t.id} className="row" style={{ gap: 8 }}>
              <Glyph service={t.spec.service} />
              <span style={{ fontWeight: 500 }}>{t.spec.role || t.spec.service}</span>
              <span className="dim ell">{t.change || 'workspace'} · {t.approval ? 'waiting for approval' : 'working'} — keeps running</span>
            </div>
          ))}
        </div>
        <p className="fhelp" style={{ marginTop: 12 }}>
          Settings → Running CLIs sets this, the idle limit for background projects and how many CLIs may run at once.
        </p>
      </div>
    </Dialog>
  );
}
