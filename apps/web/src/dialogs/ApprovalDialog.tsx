import { useState } from 'react';
import { ADAPTERS } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { answerApproval, closeDialog, jumpToTab, useStore } from '../store.ts';
import { Dialog, Glyph } from '../components/common.tsx';
import { cls } from '../util.ts';
import { tabLabel } from '../shell/Terminal.tsx';

type Scope = 'exact' | 'prefix' | 'all';

/** S13 — answer a CLI's permission prompt from Cayrnx. */
export function ApprovalDialog({ tabId }: { tabId: string }) {
  const t = useStore((s) => s.tabs[tabId]);
  const [always, setAlways] = useState(false);
  const [scope, setScope] = useState<Scope>('prefix');
  if (!t || !t.approval) {
    return (
      <Dialog title="Approval" width={460} onClose={closeDialog} footer={<><span className="grow" /><button className="btn" onClick={closeDialog}>Close</button></>}>
        <div className="dbody" style={{ paddingBottom: 14 }}>Nothing is waiting any more — the prompt was answered or went away.</div>
      </Dialog>
    );
  }
  const ap = t.approval;
  const hook = ap.source === 'hook';
  const keys = t.kind === 'term' ? ADAPTERS[t.spec.service].approvalKeys : null;
  const words = ap.detail.split(/\s+/).slice(0, 2).join(' ');
  const scopes: [Scope, string, string][] = [
    ['exact', 'This exact command', `${ap.tool || 'Bash'}(${ap.detail.length > 40 ? ap.detail.slice(0, 40) + '…' : ap.detail})`],
    ['prefix', `Commands starting with ${words}`, `${ap.tool || 'Bash'}(${words}:*)`],
    ['all', `All ${ap.tool || 'tool'} calls`, `${ap.tool || 'Bash'}(*)`],
  ];
  const how = (d: 'once' | 'always' | 'deny') => (hook ? 'hook decision' : keys ? `sends ${keys.labels[d]}` : '');
  return (
    <Dialog
      title="Approval needed"
      width={540}
      onClose={closeDialog}
      head={<span className="stc st-approval" />}
      footer={
        <>
          <span className="grow" />
          <button className="btn danger" onClick={() => void answerApproval(t.id, 'deny')} title={how('deny')} data-testid="appr-deny">
            Deny
          </button>
          {always ? (
            <button className="btn" onClick={() => void answerApproval(t.id, 'always', scope)} title={how('always')} data-testid="appr-always">
              Confirm always-allow
            </button>
          ) : (
            <button className="btn" onClick={() => (hook ? setAlways(true) : void answerApproval(t.id, 'always'))} title={how('always')} data-testid="appr-always">
              Always allow{hook ? '…' : ''}
            </button>
          )}
          <button className="btn primary" onClick={() => void answerApproval(t.id, 'once')} title={how('once')} data-testid="appr-once">
            <Icon d={I.check} size={14} />
            Approve once
          </button>
        </>
      }
    >
      <div className="dbody">
        <div className="row" style={{ gap: 8, marginBottom: 12 }}>
          <Glyph service={t.spec.service} />
          <span style={{ fontWeight: 500 }}>{tabLabel(t)}</span>
          <span className="dim">· {t.change || 'workspace'}</span>
        </div>
        {ap.tool && (
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <span className="flabel">Tool</span>
            <span className="pill cur">{ap.tool}</span>
          </div>
        )}
        <div className="apprbox" data-testid="appr-detail">
          {ap.detail}
        </div>
        <div className="mono dim" style={{ fontSize: 11, margin: '6px 0 12px' }}>
          cwd {t.cwd}
        </div>
        {hook ? (
          <div className="note" style={{ marginBottom: 10 }}>
            Precise: {ADAPTERS[t.spec.service].name} asked through its PermissionRequest hook — your answer goes straight back to it.
          </div>
        ) : (
          <div className="note" style={{ marginBottom: 10 }}>
            Detected on screen. Answering types the CLI's own key into the terminal — once <span className="kbd">{keys?.labels.once}</span> · always <span className="kbd">{keys?.labels.always}</span> · deny <span className="kbd">{keys?.labels.deny}</span>.
          </div>
        )}
        {always && hook && (
          <div className="lcard" style={{ marginBottom: 8 }}>
            <div className="flabel" style={{ marginBottom: 8 }}>
              Always allow… <span className="dim" style={{ fontWeight: 400 }}>(this session)</span>
            </div>
            {scopes.map(([id, label, rule]) => (
              <button key={id} className={cls('rpop-row', scope === id && 'on')} onClick={() => setScope(id)}>
                <span className={cls('radio', scope === id && 'on')} />
                <span className="grow">{label}</span>
                <span className="mono dim ell" style={{ fontSize: 11, maxWidth: 200 }}>
                  {rule}
                </span>
              </button>
            ))}
          </div>
        )}
        <button className="link" style={{ fontSize: 12 }} onClick={() => (hook ? void answerApproval(t.id, 'terminal') : (closeDialog(), void jumpToTab(t)))}>
          Focus terminal instead →
        </button>
      </div>
    </Dialog>
  );
}
