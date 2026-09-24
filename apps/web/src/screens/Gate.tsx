import { useState, type FormEvent } from 'react';
import { Logo, I, Icon } from '../icons.tsx';
import { post } from '../api.ts';
import { boot, loadAll, useStore } from '../store.ts';
import { socket } from '../ws.ts';
import { OpenProjectBody } from '../dialogs/OpenProjectDialog.tsx';
import { cls } from '../util.ts';

function Wordmark() {
  return (
    <div className="wordmark">
      <Logo size={30} />
      Cayrnx
    </div>
  );
}

/** Login (plan §3.11): centered card, one password. */
export function Login() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await post('/api/auth/login', { password: pw });
      await boot();
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="gate">
      <form className="gcard" onSubmit={(e) => void submit(e)}>
        <Wordmark />
        <div className="field">
          <label className="flabel" htmlFor="pw">
            Password
          </label>
          <input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password" className={err ? 'inerr' : ''} />
          {err && <span className="ferr">{err}</span>}
        </div>
        <button className="btn primary lg full" type="submit" disabled={busy || !pw} data-testid="sign-in">
          Sign in
        </button>
        <div className="dim" style={{ fontSize: 12, marginTop: 14, textAlign: 'center' }}>
          Signed-in sessions last 30 days.
        </div>
      </form>
    </div>
  );
}

/** First-run setup (plan §3.11): ① password ② allowed roots + public URLs ③ open a project. */
export function Setup() {
  const auth = useStore((s) => s.auth)!;
  const [step, setStep] = useState(1);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [token, setToken] = useState('');
  const [roots, setRoots] = useState((auth.defaultRoots || []).join('\n'));
  const [origins, setOrigins] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const step1ok = pw.length >= 8 && pw === pw2 && (auth.local || token.trim().length > 0);
  const finish2 = async () => {
    setBusy(true);
    setErr(null);
    try {
      await post('/api/auth/setup', {
        password: pw,
        token: token.trim() || undefined,
        allowedRoots: roots.split('\n').map((r) => r.trim()).filter(Boolean),
        publicOrigins: origins.split('\n').map((r) => r.trim()).filter(Boolean),
      });
      await loadAll();
      socket.start();
      setStep(3);
    } catch (x: any) {
      setErr(x.message);
      if (/token|password/i.test(x.message)) setStep(1);
    } finally {
      setBusy(false);
    }
  };
  const done = () => useStore.setState({ boot: 'ready', auth: { ...auth, setUp: true, authenticated: true } });
  return (
    <div className="gate">
      <div className={cls('gcard', step === 3 && 'wide')}>
        <div className="row" style={{ marginBottom: 6 }}>
          <div className="grow">
            <Wordmark />
          </div>
          <div className="stepper" aria-label={`Step ${step} of 3`}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={cls('stepdot', n === step && 'on', n < step && 'done')} />
            ))}
          </div>
        </div>
        {step === 1 && (
          <>
            <div className="sgh">Set a password</div>
            <div className="note" style={{ marginBottom: 12 }}>
              Cayrnx hands out shells, so every browser signs in — also behind Pangolin or Cloudflare.
            </div>
            {!auth.local && (
              <div className="field">
                <label className="flabel" htmlFor="tok">
                  Setup token
                </label>
                <input id="tok" type="text" className="mono" value={token} onChange={(e) => setToken(e.target.value)} placeholder="from the server log / docker logs" autoComplete="off" />
                <span className="fhelp">You're not on localhost, so first-run setup needs the one-time token Cayrnx printed when it started.</span>
              </div>
            )}
            <div className="field">
              <label className="flabel" htmlFor="pw1">
                Password
              </label>
              <input id="pw1" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus />
              <span className="fhelp">At least 8 characters.</span>
            </div>
            <div className="field">
              <label className="flabel" htmlFor="pw2">
                Confirm
              </label>
              <input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" className={pw2 && pw !== pw2 ? 'inerr' : ''} />
              {pw2 && pw !== pw2 && <span className="ferr">The passwords don't match.</span>}
            </div>
            {err && <div className="ferr" style={{ marginBottom: 8 }}>{err}</div>}
            <div className="row">
              <span className="grow" />
              <button className="btn primary" disabled={!step1ok} onClick={() => setStep(2)} data-testid="setup-next">
                Next
              </button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="sgh">Where your projects live</div>
            <div className="field">
              <label className="flabel" htmlFor="roots">
                Limit to folders <span className="dim" style={{ fontWeight: 400 }}>· optional, one per line</span>
              </label>
              <textarea id="roots" rows={3} className="mono" value={roots} onChange={(e) => setRoots(e.target.value)} placeholder={auth.docker ? '/projects' : '/home/you/code'} />
              <span className="fhelp">Leave empty to open projects anywhere on this machine. If you add folders, Cayrnx only opens projects inside them and file APIs never leave them.</span>
            </div>
            <div className="field">
              <label className="flabel" htmlFor="origins">
                Public URLs <span className="dim" style={{ fontWeight: 400 }}>· optional, one per line</span>
              </label>
              <textarea id="origins" rows={3} className="mono" value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder={'https://cayrnx.example.com\nhttp://192.168.1.20:4717'} />
              <span className="fhelp">
                Other addresses you'll open Cayrnx from (LAN host, Pangolin or Cloudflare domain). <span className="mono">{location.origin}</span> is always allowed.
              </span>
            </div>
            {err && <div className="ferr" style={{ marginBottom: 8 }}>{err}</div>}
            <div className="row" style={{ gap: 8 }}>
              <button className="btn ghost" onClick={() => setStep(1)}>
                Back
              </button>
              <span className="grow" />
              <button className="btn primary" disabled={busy || !roots.trim()} onClick={() => void finish2()} data-testid="setup-finish">
                Save &amp; continue
              </button>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <div className="sgh">Open your first project</div>
            <OpenProjectBody inline onOpened={done} />
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn ghost sm" onClick={done}>
                Skip for now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function BootScreen({ error }: { error?: string | null }) {
  return (
    <div className="gate">
      <div className="gcard" style={{ textAlign: 'center' }}>
        <Wordmark />
        {error ? (
          <>
            <div className="warnrow" style={{ marginBottom: 12, textAlign: 'left' }}>
              <Icon d={I.warn} />
              <span>Can't reach the Cayrnx server: {error}</span>
            </div>
            <button className="btn primary" onClick={() => void boot()}>
              Retry
            </button>
          </>
        ) : (
          <div className="row dim" style={{ gap: 8, justifyContent: 'center' }}>
            <span className="stc st-busy" />
            Loading…
          </div>
        )}
      </div>
    </div>
  );
}
