import { z } from 'zod';
import { SLUG_RE } from './slug.ts';

export const serviceIdSchema = z.enum(['claude', 'codex', 'opencode']);

export const tabLaunchSpecSchema = z.object({
  service: serviceIdSchema,
  role: z.string().max(60).default(''),
  model: z.string().max(200).default(''),
  effort: z.string().max(40).default(''),
  agent: z.string().max(120).default(''),
  claudePerm: z.enum(['manual', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions']).optional(),
  codexApproval: z.enum(['on-request', 'never']).optional(),
  codexSandbox: z.enum(['read-only', 'workspace-write', 'danger-full-access']).optional(),
  ocAuto: z.boolean().optional(),
});

const slug = z.string().regex(SLUG_RE, 'lowercase letters, digits and dashes');

export const docTypeSchema = z.object({
  slug,
  mode: z.enum(['superseding', 'delta']),
  keep: z.union([z.literal('all'), z.number().int().min(1)]),
  cap: z.string().max(20).default('4 KB'),
  builtin: z.boolean().default(false),
  guide: z.string().max(2000).optional(),
});

export const changeTypeSchema = z.object({
  id: slug,
  color: z.string().max(60),
  layout: z.string().nullable(),
  tpl: z.string().max(20000),
  builtin: z.boolean().default(false),
});

export const layoutSchema = z.object({
  id: slug,
  name: z.string().min(1).max(60),
  desc: z.string().max(300).default(''),
  areas: z.string().max(200).default("'a'"),
  tabs: z.array(tabLaunchSpecSchema.extend({ area: z.string().max(4).default('a') })).max(12),
  custom: z.array(z.string()).default([]),
});

export const registriesSchema = z.object({
  layouts: z.array(layoutSchema),
  changeTypes: z.array(changeTypeSchema),
  docTypes: z.array(docTypeSchema),
});

const serviceSettingsSchema = z.object({
  enabled: z.boolean(),
  bin: z.string().min(1).max(500),
  hooks: z.boolean().default(true),
  extraArgs: z.string().max(500).default(''),
});

export const settingsSchema = z.object({
  appearance: z.object({
    theme: z.enum(['dark', 'light', 'system']),
    monoFont: z.string().max(60),
    fontSize: z.number().min(9).max(24),
    lineHeight: z.number().min(1).max(2),
    cursor: z.enum(['block', 'bar', 'underline']),
    statusLabels: z.enum(['dots', 'numbers']).default('dots'),
    palette: z.string().max(40).default('cayrnx'),
    cliColors: z.enum(['theme', 'own']).default('theme'),
  }),
  buttons: z.object({ writeBehavior: z.enum(['insert', 'fill', 'stage']), readBehavior: z.enum(['insert', 'stage']).default('insert'), shiftInvert: z.boolean(), stagedPlacement: z.enum(['overlay', 'toolbar']).default('overlay') }),
  briefs: z.object({
    unreadMode: z.enum(['user', 'tab']),
    keep: z.union([z.literal('all'), z.number().int().min(1)]),
    writeTemplate: z.string().max(4000).default(''),
    readTemplate: z.string().max(4000).default(''),
    worktreeDefault: z.boolean().default(false),
  }),
  services: z.object({ claude: serviceSettingsSchema, codex: serviceSettingsSchema, opencode: serviceSettingsSchema }),
  notifications: z.object({ approval: z.boolean(), finished: z.boolean(), sound: z.boolean() }),
  resources: z.object({
    maxRunning: z.number().int().min(0).max(200),
    idleStopMinutes: z.number().int().min(0).max(60 * 24 * 14),
    onProjectSwitch: z.enum(['ask', 'keep', 'stop']),
    stopOnArchive: z.boolean(),
  }),
  access: z.object({
    allowedRoots: z.array(z.string()),
    publicOrigins: z.array(z.string()),
    trustProxy: z.boolean(),
    cloudflare: z.object({
      enabled: z.boolean(),
      teamDomain: z.string(),
      aud: z.string(),
      hostnames: z.array(z.string()),
    }),
    pangolinNote: z.string().default(''),
  }),
});

export const newChangeSchema = z.object({
  type: slug,
  name: z.string().min(1).max(80),
  worktree: z.boolean().default(false),
  layout: z.string().nullable().default(null),
  seed: z.boolean().default(false),
  /** What the change is about (the first prompt you'd type) — goes into brief-001. */
  brief: z.string().max(20000).default(''),
});

export const openProjectSchema = z.object({
  path: z.string().min(1).max(4096),
  name: z.string().max(80).optional(),
  worktreeRoot: z.string().max(4096).nullable().optional(),
  watchMode: z.enum(['native', 'polling']).default('native'),
  ignoreBriefs: z.boolean().default(true),
});

export const launchTabSchema = z.object({
  projectId: z.string(),
  change: z.string().nullable(),
  spec: tabLaunchSpecSchema,
  cwd: z.string().max(4096).optional(),
  /** Resume this CLI session instead of starting a new one (S3 "Open in new tab"). */
  resume: z.string().max(200).optional(),
});
