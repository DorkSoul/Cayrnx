import { useEffect, useState } from 'react';
import { ADAPTERS, SERVICE_IDS, spec as mkSpec, type ClaudePermission, type CodexApproval, type CodexSandbox, type ModelOption, type ServiceId, type TabLaunchSpec } from '@cayrnx/shared';
import { I, Icon } from '../icons.tsx';
import { enc, get } from '../api.ts';
import { useStore } from '../store.ts';
import { Glyph, Seg, Switch } from './common.tsx';
import { cls } from '../util.ts';

const CLAUDE_PERMS: { value: ClaudePermission; label: string; danger?: boolean }[] = [
  { value: 'manual', label: 'manual' },
  { value: 'acceptEdits', label: 'acceptEdits' },
  { value: 'plan', label: 'plan' },
  { value: 'auto', label: 'auto' },
  { value: 'dontAsk', label: 'dontAsk' },
  { value: 'bypassPermissions', label: 'bypass', danger: true },
];

/** Switching service resets the service-specific fields to that CLI's safe defaults. */
export function switchService(spec: TabLaunchSpec, id: ServiceId): TabLaunchSpec {
  if (id === spec.service) return spec;
  return { ...mkSpec({ service: id, role: spec.role }), model: id === 'claude' ? 'sonnet' : '' };
}

/**
 * The per-CLI launch fields (model, effort/variant, agent/profile, permissions) shared by
 * Add CLI (S10) and the layout editor, so a layout role is configured exactly like a tab.
 */
export function LaunchFields({
  spec,
  onChange,
  cwd,
  idPrefix = 'lf',
  showService,
  wide = true,
}: {
  spec: TabLaunchSpec;
  onChange: (next: TabLaunchSpec) => void;
  cwd?: string | null;
  idPrefix?: string;
  showService?: boolean;
  wide?: boolean;
}) {
  const mobile = useStore((s) => s.isMobile);
  const a = ADAPTERS[spec.service];
  const [models, setModels] = useState<ModelOption[]>(a.modelHints);
  const [loadingModels, setLoadingModels] = useState(false);
  const [agents, setAgents] = useState<string[]>(a.agentHints);
  useEffect(() => {
    setModels(a.modelHints);
    setAgents(a.agentHints);
    setLoadingModels(true);
    let alive = true;
    void get<ModelOption[]>(`/api/services/${spec.service}/models`)
      .then((m) => alive && m.length && setModels(m), () => undefined)
      .finally(() => alive && setLoadingModels(false));
    void get<string[]>(`/api/services/${spec.service}/agents${cwd ? `?cwd=${enc(cwd)}` : ''}`).then((m) => alive && setAgents(m), () => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.service]);
  const upd = (patch: Partial<TabLaunchSpec>) => onChange({ ...spec, ...patch });
  const danger = a.danger(spec);
  const coerce = a.coerce?.(spec) || null;
  const two = wide && !mobile;
  const picked = models.find((m) => m.id === spec.model);
  const chips = models.filter((m) => m.featured).slice(0, 10);
  const groups = [...new Set(models.map((m) => m.group || ''))];
  // Efforts follow the chosen model when its catalog says which it takes.
  const effortIds = picked?.efforts ?? (a.effortFreeText ? null : a.efforts.map((e) => e.value));
  const effortChoices = effortIds ? [...effortIds, ...(spec.effort && !effortIds.includes(spec.effort) ? [spec.effort] : [])] : null;
  const pickModel = (id: string) => {
    const m = models.find((x) => x.id === id);
    // Drop an effort the new model doesn't take (it would be rejected or silently ignored).
    const keep = !spec.effort || !m?.efforts || m.efforts.includes(spec.effort);
    upd({ model: id, ...(keep ? {} : { effort: '' }) });
  };
  return (
    <>
      {showService && (
        <div className="field">
          <span className="flabel">CLI</span>
          <Seg
            value={spec.service}
            onChange={(v) => onChange(switchService(spec, v))}
            options={SERVICE_IDS.map((id) => ({
              value: id,
              label: (
                <>
                  <Glyph service={id} />
                  {ADAPTERS[id].name}
                </>
              ),
            }))}
          />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: two ? 'repeat(2, minmax(0, 1fr))' : '1fr', columnGap: 16 }}>
        <div className="field">
          <label className="flabel" htmlFor={`${idPrefix}-model`}>
            Model
          </label>
          <div className="modelrow">
            <input id={`${idPrefix}-model`} type="text" className="mono" value={spec.model} placeholder="blank = CLI default" onChange={(e) => upd({ model: e.target.value })} list={`${idPrefix}-models`} />
            <select
              className="modelpick"
              value=""
              onChange={(e) => e.target.value && pickModel(e.target.value === '\u0000' ? '' : e.target.value)}
              aria-label="Choose a model"
              title={loadingModels ? 'Loading models…' : `${models.length} models`}
              data-testid={`${idPrefix}-model-pick`}
            >
              <option value="">{loadingModels ? 'Loading…' : `All (${models.length})`}</option>
              <option value={'\u0000'}>CLI default</option>
              {groups.map((g) => {
                const opts = models
                  .filter((m) => (m.group || '') === g)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label && m.label !== m.id ? `${m.label} — ${m.id}` : m.id}
                    </option>
                  ));
                return g ? (
                  <optgroup key={g} label={g}>
                    {opts}
                  </optgroup>
                ) : (
                  opts
                );
              })}
            </select>
          </div>
          <datalist id={`${idPrefix}-models`}>
            {models.map((m) => (
              <option key={m.id} value={m.id} label={m.label} />
            ))}
          </datalist>
          {chips.length > 0 && (
            <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
              {chips.map((m) => (
                <button key={m.id} className={cls('sugg', spec.model === m.id && 'on')} onClick={() => pickModel(m.id)} title={[m.id, m.description].filter(Boolean).join(' — ')}>
                  {m.label || m.id}
                </button>
              ))}
            </div>
          )}
          <span className="fhelp">{picked?.description ? `${picked.label || picked.id}: ${picked.description}` : a.modelHelp}</span>
        </div>
        <div className="field">
          <label className="flabel" htmlFor={`${idPrefix}-agent`}>
            {a.agentLabel}
          </label>
          <input id={`${idPrefix}-agent`} type="text" className="mono" value={spec.agent} placeholder="optional" onChange={(e) => upd({ agent: e.target.value })} />
          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
            {agents.slice(0, 8).map((m) => (
              <button key={m} className={cls('sugg', spec.agent === m && 'on')} onClick={() => upd({ agent: spec.agent === m ? '' : m })}>
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="field">
        <span className="flabel">{a.effortLabel}</span>
        {effortChoices && effortChoices.length === 0 ? (
          <span className="fhelp">{picked?.label || picked?.id} has no {a.effortLabel.toLowerCase()} setting.</span>
        ) : effortChoices ? (
          <Seg
            value={spec.effort}
            onChange={(v) => upd({ effort: v })}
            options={[{ value: '', label: picked?.defaultEffort ? `default (${picked.defaultEffort})` : 'default' }, ...effortChoices.map((v) => ({ value: v, label: v }))]}
          />
        ) : a.effortFreeText ? (
          <>
            <input type="text" className="mono" style={{ maxWidth: 240 }} value={spec.effort} placeholder="optional, e.g. high" onChange={(e) => upd({ effort: e.target.value })} aria-label="Variant" />
            <span className="fhelp">
              Sent as <span className="mono">provider/model#variant</span> in the inline config (unverified until spike P0-b — leave blank if unsure).
            </span>
          </>
        ) : (
          <Seg value={spec.effort} onChange={(v) => upd({ effort: v })} options={[{ value: '', label: 'default' }, ...a.efforts]} />
        )}
        {coerce && <span className="fhelp" style={{ color: 'var(--accent)' }}>{coerce}</span>}
      </div>
      <div className="field">
        <span className="flabel">
          <Icon d={I.shield} size={14} />
          Permission mode
        </span>
        {spec.service === 'claude' && <Seg value={spec.claudePerm || 'manual'} onChange={(v) => upd({ claudePerm: v })} options={CLAUDE_PERMS} />}
        {spec.service === 'codex' && (
          <>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span className="dim" style={{ fontSize: 11.5, width: 62 }}>
                approval
              </span>
              <Seg<CodexApproval>
                value={spec.codexApproval || 'on-request'}
                onChange={(v) => upd({ codexApproval: v })}
                options={[
                  { value: 'on-request', label: 'on-request' },
                  { value: 'never', label: 'never', danger: true },
                ]}
              />
            </div>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span className="dim" style={{ fontSize: 11.5, width: 62 }}>
                sandbox
              </span>
              <Seg<CodexSandbox>
                value={spec.codexSandbox || 'workspace-write'}
                onChange={(v) => upd({ codexSandbox: v })}
                options={[
                  { value: 'read-only', label: 'read-only' },
                  { value: 'workspace-write', label: 'workspace-write' },
                  { value: 'danger-full-access', label: 'danger-full-access', danger: true },
                ]}
              />
            </div>
          </>
        )}
        {spec.service === 'opencode' && (
          <div className="row" style={{ gap: 10 }}>
            <Switch on={!!spec.ocAuto} onChange={(v) => upd({ ocAuto: v })} label="Auto approve" />
            <span className="mono" style={{ fontSize: 12 }}>
              --auto
            </span>
            <span className="dim" style={{ fontSize: 11.5 }}>
              approve all tool calls without asking
            </span>
          </div>
        )}
        {danger && (
          <div className="warnrow">
            <Icon d={I.warn} />
            <span>{danger}</span>
          </div>
        )}
      </div>
    </>
  );
}
