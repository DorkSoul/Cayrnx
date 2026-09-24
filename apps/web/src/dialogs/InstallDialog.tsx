import { useState } from 'react';
import { ADAPTERS, type ServiceId, type TabStatus } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { post } from '../api.ts';
import { closeDialog, curProject, errToast, setActive, toast, useStore, WORKSPACE } from '../store.ts';
import { Dialog, Glyph } from '../components/common.tsx';
import { cls } from '../util.ts';

/** Install a missing CLI on a VM: shows the official command, then runs it in a visible tab. */
export function InstallDialog({ service }: { service: ServiceId }) {
  const s = useStore();
  const p = curProject(s);
  const a = ADAPTERS[service];
  const [opt, setOpt] = useState(0);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!p) return;
    setBusy(true);
    try {
      const t = await post<TabStatus>(`/api/services/${service}/install`, { projectId: p.id, option: opt });
      useStore.setState((st) => ({ tabs: { ...st.tabs, [t.id]: t }, current: { ...st.current, [p.id]: WORKSPACE }, view: 'term' }));
      setActive(t.id);
      closeDialog();
      toast(`Installing ${a.name} in a terminal tab — press Test in Settings → Services when it's done`, 'info');
    } catch (e) {
      errToast(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={
        <span className="row" style={{ gap: 8 }}>
          <Glyph service={service} />
          Install {a.name}
        </span>
      }
      width={600}
      onClose={closeDialog}
      footer={
        <>
          <span className="grow dim" style={{ fontSize: 12 }}>
            {p ? '' : 'Open a project first — the install runs in one of its terminal tabs.'}
          </span>
          <button className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void run()} disabled={!p || busy || s.meta?.docker} data-testid="run-install">
            <Icon d={I.play} size={14} />
            Run in a terminal tab
          </button>
        </>
      }
    >
      <div className="dbody">
        {s.meta?.docker ? (
          <div className="warnrow amber" style={{ marginBottom: 12 }}>
            <Icon d={I.warn} />
            <span>This is the Docker image: CLIs are part of the image. Set its version build arg in compose.yaml and rebuild.</span>
          </div>
        ) : (
          <div className="note" style={{ marginBottom: 10 }}>
            Runs as the user Cayrnx runs as, on this machine, exactly as shown. The tab stays open as a normal shell afterwards, so you can finish anything the installer asks for (for example a sudo password). Then log in with <b>Log in</b> and press <b>Test</b>.
          </div>
        )}
        {a.install.map((o, i) => (
          <button key={o.label} className={cls('lcard', 'row')} onClick={() => setOpt(i)} style={{ width: '100%', gap: 10, alignItems: 'flex-start', textAlign: 'left', borderColor: opt === i ? 'var(--accent)' : undefined }} aria-pressed={opt === i}>
            <span className={cls('radio', opt === i && 'on')} style={{ marginTop: 2 }} />
            <span className="grow" style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>{o.label}</span>
              <span className="cmd" style={{ display: 'block' }} data-testid={`install-cmd-${i}`}>
                {o.cmd}
              </span>
              <span className="fhelp" style={{ display: 'block', marginTop: 6 }}>
                {o.note}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
