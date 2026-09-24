import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ADAPTERS,
  CAYRNX_VERSION,
  SERVICE_IDS,
  docKey,
  launchTabSchema,
  newChangeSchema,
  openProjectSchema,
  serviceIdSchema,
  tabLaunchSpecSchema,
  type ChangeUsage,
  type SkillsInfo,
  type ModelUsageRow,
  type Project,
  type ProjectSummary,
  type ServiceId,
  type TabStatus,
} from '@cayrnx/shared';
import type { Core } from './core.ts';
import { SESSION_COOKIE, SESSION_TTL_MS } from './auth.ts';
import { clientIp, isLocalRequest, requestProto } from './http.ts';
import { HttpError, guardPath, underAny } from './util/paths.ts';
import { createChange, deleteChange, deleteLatest, getChange, prune, readDoc, removeWorktree, saveDoc, scanChanges, updateMeta } from './briefs.ts';
import { browseFolders, listTree, readTextFile } from './files.ts';
import { git } from './util/git.ts';
import { detect, listAgents, listModels } from './services.ts';
import { codexHome, listSessions, resumeCommand, sessionTokens } from './sessions.ts';
import { bundledSkills } from './core.ts';
import { addUsage, emptyUsage, sessionUsage, usageTotal, type SessionUsage } from './usage.ts';
import type { RegistryKind } from './registries.ts';

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) {
    const i = r.error.issues[0];
    throw new HttpError(400, `${i?.path.join('.') || 'body'}: ${i?.message}`);
  }
  return r.data;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function registerRoutes(app: FastifyInstance, core: Core): void {
  const S = () => core.settings.get();
  // Allowed folders are an optional limit: none configured = anywhere this machine lets us read.
  const roots = () => (S().access.allowedRoots.length ? S().access.allowedRoots : ['/']);
  const project = (req: FastifyRequest) => core.projects.get((req.params as any).id);

  const setCookie = (req: FastifyRequest, reply: FastifyReply, value: string) => {
    reply.setCookie(SESSION_COOKIE, value, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: requestProto(req.raw, S().access.trustProxy) === 'https',
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
  };

  const summary = (p: Project): ProjectSummary => {
    const tabs = core.tabs.list(p.id);
    return {
      ...p,
      activeChanges: scanChanges(p).filter((c) => !c.meta.archived).length,
      attention: tabs.filter((t) => t.chip === 'approval' || t.chip === 'updated' || t.chip === 'notsaved').length,
    };
  };

  /* ---------------- auth ---------------- */

  app.get('/api/auth/state', async (req) => ({
    setUp: core.auth.isSetUp(),
    authenticated: !!(req as any).sessionId,
    local: isLocalRequest(req.raw),
    docker: core.docker,
    version: CAYRNX_VERSION,
    defaultRoots: S().access.allowedRoots,
  }));

  app.post('/api/auth/setup', async (req, reply) => {
    const b = parse(
      z.object({
        password: z.string(),
        token: z.string().optional(),
        allowedRoots: z.array(z.string()).optional(),
        publicOrigins: z.array(z.string()).optional(),
      }),
      req.body,
    );
    if (core.auth.isSetUp()) throw new HttpError(409, 'Cayrnx is already set up', 'set_up');
    if (!isLocalRequest(req.raw) && !core.auth.checkSetupToken(b.token)) {
      throw new HttpError(403, 'First-run setup needs the one-time token from the server log (or open Cayrnx on localhost).', 'setup_token');
    }
    const allowedRoots = (b.allowedRoots || []).map((r) => r.trim()).filter(Boolean).map((r) => path.resolve(r));
    await core.auth.setPassword(b.password);
    const patch: any = { access: {} };
    if (b.allowedRoots) patch.access.allowedRoots = allowedRoots;
    if (b.publicOrigins) patch.access.publicOrigins = b.publicOrigins.map((o) => o.trim()).filter(Boolean);
    core.settings.update(patch);
    setCookie(req, reply, core.auth.createSession(str(req.headers['user-agent']), clientIp(req.raw, S().access.trustProxy)));
    return { ok: true };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const b = parse(z.object({ password: z.string() }), req.body);
    const ip = clientIp(req.raw, S().access.trustProxy);
    const wait = core.limiter.check(ip);
    if (wait) throw new HttpError(429, `Too many attempts — try again in ${Math.ceil(wait / 60)} min.`, 'rate_limited');
    if (!(await core.auth.verify(b.password))) {
      core.limiter.fail(ip);
      throw new HttpError(401, 'Wrong password.', 'bad_password');
    }
    core.limiter.reset(ip);
    setCookie(req, reply, core.auth.createSession(str(req.headers['user-agent']), ip));
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const sid = (req as any).sessionId;
    if (sid) core.auth.revoke(sid);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/sessions', async (req) => core.auth.list((req as any).sessionId));
  app.delete('/api/auth/sessions/:sid', async (req) => {
    core.auth.revoke((req.params as any).sid);
    return { ok: true };
  });
  app.post('/api/auth/password', async (req) => {
    const b = parse(z.object({ current: z.string(), next: z.string() }), req.body);
    if (!(await core.auth.verify(b.current))) throw new HttpError(401, 'Current password is wrong.');
    await core.auth.setPassword(b.next);
    core.auth.revokeAllExcept((req as any).sessionId);
    return { ok: true };
  });

  /* ---------------- settings & registries ---------------- */

  app.get('/api/settings', async () => ({
    settings: S(),
    version: CAYRNX_VERSION,
    docker: core.docker,
    bind: core.bind,
    paths: { home: core.paths.home, config: core.paths.config, registries: core.paths.registries, state: core.paths.state, worktrees: core.paths.worktrees },
  }));
  app.patch('/api/settings', async (req) => core.settings.update(req.body));
  app.put('/api/settings', async (req) => core.settings.replace(req.body));

  app.get('/api/registries', async () => ({
    registries: core.registries.get(),
    paths: { layouts: core.registries.path('layouts'), changeTypes: core.registries.path('changeTypes'), docTypes: core.registries.path('docTypes') },
  }));
  app.put('/api/registries/:kind', async (req) => {
    const kind = (req.params as any).kind as RegistryKind;
    if (!['layouts', 'changeTypes', 'docTypes'].includes(kind)) throw new HttpError(404, 'Unknown registry');
    return core.registries.put(kind, req.body);
  });

  /* ---------------- services ---------------- */

  app.get('/api/services', async () => Promise.all(SERVICE_IDS.map((id) => detect(id, S()))));

  /**
   * Cayrnx's bundled skills (grill-me). Claude and OpenCode tabs get them per launch; Codex only
   * reads its own skills folder, so Settings shows whether they're installed there and how to.
   */
  app.get('/api/skills', async (): Promise<SkillsInfo> => {
    const names = ['grill-me', 'grilling'];
    const dir = path.join(codexHome(), 'skills');
    return { bundled: bundledSkills(), names, codex: { dir, installed: names.filter((n) => fs.existsSync(path.join(dir, n, 'SKILL.md'))) } };
  });
  app.post('/api/services/:svc/test', async (req) => detect(parse(serviceIdSchema, (req.params as any).svc), S(), true, true));

  // Install a missing CLI (VM installs): runs the adapter's official command, verbatim, in a
  // plain terminal tab so you watch it; the tab drops into a shell afterwards.
  app.post('/api/services/:svc/install', async (req) => {
    const id = parse(serviceIdSchema, (req.params as any).svc) as ServiceId;
    const b = parse(z.object({ projectId: z.string(), option: z.number().int().min(0).default(0) }), req.body);
    if (core.docker) throw new HttpError(400, 'In Docker the CLIs are part of the image — set its version build arg and rebuild.');
    const opt = ADAPTERS[id].install[b.option];
    if (!opt) throw new HttpError(400, 'Unknown install option');
    const p = core.projects.get(b.projectId);
    const script = `${opt.cmd}\nrc=$?\necho\nif [ $rc -eq 0 ]; then echo "✓ Done. In Cayrnx: Settings → Services → ${ADAPTERS[id].name} → Test."; else echo "✗ The installer exited with $rc — fix it here (this is a normal shell), then Test in Settings."; fi\nexec "\${SHELL:-/bin/bash}" -l`;
    return core.tabs.launch({
      projectId: p.id,
      change: null,
      kind: 'plain',
      spec: { service: id, role: `install ${id}`, model: '', effort: '', agent: '' },
      plainArgv: ['/bin/bash', '-lc', script],
      cwd: p.path,
    });
  });
  app.get('/api/services/:svc/models', async (req) => listModels(parse(serviceIdSchema, (req.params as any).svc), S()));
  app.get('/api/services/:svc/agents', async (req) => {
    const cwd = str((req.query as any).cwd);
    return listAgents(parse(serviceIdSchema, (req.params as any).svc), cwd && underAny(cwd, roots()) ? cwd : null);
  });
  app.post('/api/services/:svc/login', async (req) => {
    const id = parse(serviceIdSchema, (req.params as any).svc) as ServiceId;
    const b = parse(z.object({ projectId: z.string() }), req.body);
    const p = core.projects.get(b.projectId);
    const a = ADAPTERS[id];
    return core.tabs.launch({
      projectId: p.id,
      change: null,
      kind: 'plain',
      spec: { service: id, role: `${id} login`, model: '', effort: '', agent: '' },
      plainArgv: [S().services[id].bin, ...a.loginArgs],
      cwd: p.path,
    });
  });

  /* ---------------- projects & folders ---------------- */

  app.get('/api/projects', async () => core.projects.list().map(summary));

  app.post('/api/projects/open', async (req) => {
    const b = parse(openProjectSchema, req.body);
    const r = await core.projects.open(b, roots());
    if (r.created) {
      // Existing docs start as read; only what agents write from now on is unread.
      const st = core.state.get(r.project.id);
      for (const c of scanChanges(r.project)) for (const d of c.docs) st.viewed[docKey(c.slug, d.type, d.n)] = d.mtime;
      core.state.save(r.project.id);
    }
    core.watcher.ensure(r.project);
    return { project: summary(r.project), created: r.created, ignoreFile: r.ignoreFile };
  });

  app.patch('/api/projects/:id', async (req) => {
    const b = parse(z.object({ name: z.string().optional(), worktreeRoot: z.string().nullable().optional(), watchMode: z.enum(['native', 'polling']).optional() }), req.body);
    const p = core.projects.update((req.params as any).id, b);
    core.watcher.ensure(p);
    return summary(p);
  });

  app.post('/api/projects/:id/touch', async (req) => {
    core.projects.touch((req.params as any).id);
    return { ok: true };
  });

  app.delete('/api/projects/:id', async (req) => {
    const p = project(req);
    core.tabs.closeProject(p.id);
    core.watcher.stop(p.id);
    core.projects.remove(p.id);
    return { ok: true };
  });

  app.post('/api/projects/:id/git-init', async (req) => summary(await core.projects.gitInit((req.params as any).id, (req.body as any)?.ignoreBriefs !== false)));

  app.get('/api/fs/browse', async (req) => {
    const rs = roots();
    const limited = S().access.allowedRoots.length > 0;
    // Unlimited: start at home like a file explorer, with shortcuts to where projects live.
    const home = os.homedir();
    const places = limited ? rs : [...new Set([home, '/', ...core.projects.list().map((p) => path.dirname(p.path))])];
    const q = str((req.query as any).path) || (limited ? rs[0] : home);
    const dir = guardPath(q, rs, 'Folder');
    const parent = path.dirname(dir);
    return { path: dir, parent: parent !== dir && underAny(parent, rs) ? parent : null, entries: await browseFolders(dir), roots: places, limited };
  });

  app.get('/api/fs/inspect', async (req) => core.projects.inspect(str((req.query as any).path), roots()));

  /* ---------------- changes & docs ---------------- */

  const launchLayout = (p: Project, slug: string, layoutId: string): TabStatus[] => {
    const L = core.registries.layout(layoutId);
    if (!L) throw new HttpError(404, `Unknown layout ${layoutId}`);
    return L.tabs.map(({ area: _area, ...spec }) => core.tabs.launch({ projectId: p.id, change: slug, spec }));
  };

  app.get('/api/projects/:id/changes', async (req) => scanChanges(project(req)));

  app.post('/api/projects/:id/changes', async (req) => {
    const p = project(req);
    const b = parse(newChangeSchema, req.body);
    const ct = core.registries.changeType(b.type);
    if (!ct) throw new HttpError(400, `Unknown change type ${b.type}`);
    const layout = b.layout && b.layout !== 'none' ? b.layout : null;
    if (layout && !core.registries.layout(layout)) throw new HttpError(400, `Unknown layout ${layout}`);
    const r = await createChange(p, { type: b.type, name: b.name, tpl: ct.tpl, brief: b.brief, worktree: b.worktree, layout, worktreeDir: core.projects.worktreeDir(p) });
    core.watcher.ensure(p);
    const tabs: TabStatus[] = [];
    if (layout) tabs.push(...launchLayout(p, r.change.slug, layout));
    core.hub.broadcast({ t: 'change', projectId: p.id, change: r.change });
    return { change: r.change, tabs, warning: r.warning };
  });

  app.patch('/api/projects/:id/changes/:slug', async (req) => {
    const p = project(req);
    const b = parse(z.object({ archived: z.boolean().optional(), layout: z.string().nullable().optional(), name: z.string().optional(), statusOverride: z.string().nullable().optional() }), req.body);
    const c = updateMeta(p, (req.params as any).slug, b);
    core.hub.broadcast({ t: 'change', projectId: p.id, change: c });
    if (b.archived && S().resources.stopOnArchive) {
      const n = core.tabs.stopChange(p.id, c.slug);
      if (n) core.hub.broadcast({ t: 'toast', text: `Archived · stopped ${n} CLI${n > 1 ? 's' : ''} (resume any time)`, kind: 'info', projectId: p.id });
    }
    return c;
  });

  app.delete('/api/projects/:id/changes/:slug', async (req) => {
    const p = project(req);
    const slug = (req.params as any).slug;
    await deleteChange(p, slug);
    for (const t of core.tabs.list(p.id)) if (t.change === slug) core.tabs.close(t.id);
    const st = core.state.get(p.id);
    delete st.sessions[slug];
    for (const k of Object.keys(st.viewed)) if (k.startsWith(`${slug}/`)) delete st.viewed[k];
    core.state.save(p.id);
    core.hub.broadcast({ t: 'change.remove', projectId: p.id, slug });
    return { ok: true };
  });

  app.post('/api/projects/:id/changes/:slug/layout', async (req) => {
    const p = project(req);
    const slug = (req.params as any).slug;
    const b = parse(z.object({ layout: z.string() }), req.body);
    getChange(p, slug);
    const tabs = launchLayout(p, slug, b.layout);
    const c = updateMeta(p, slug, { layout: b.layout });
    core.hub.broadcast({ t: 'change', projectId: p.id, change: c });
    return { change: c, tabs };
  });

  // S14: change working directory → relaunch the change's tabs there, resuming sessions.
  app.post('/api/projects/:id/changes/:slug/cwd', async (req) => {
    const p = project(req);
    const slug = (req.params as any).slug;
    const b = parse(z.object({ cwd: z.string() }), req.body);
    const dir = guardPath(b.cwd, [...roots(), ...core.projects.rootsOf(p)], 'Directory');
    const before = getChange(p, slug);
    const c = updateMeta(p, slug, { cwd: dir === (before.meta.worktree?.path || p.path) ? null : dir });
    const tabs = core.tabs
      .list(p.id)
      .filter((t) => t.change === slug && t.kind === 'term')
      .map((t) => core.tabs.relaunch(t.id, { resume: true, cwd: c.cwd }));
    core.hub.broadcast({ t: 'change', projectId: p.id, change: c });
    return { change: c, tabs };
  });

  app.post('/api/projects/:id/changes/:slug/worktree/remove', async (req) => {
    const p = project(req);
    const b = parse(z.object({ force: z.boolean().default(false) }), req.body);
    const c = await removeWorktree(p, (req.params as any).slug, b.force);
    core.hub.broadcast({ t: 'change', projectId: p.id, change: c });
    return c;
  });

  app.post('/api/projects/:id/changes/:slug/prune', async (req) => {
    const p = project(req);
    const b = parse(z.object({ keep: z.number().int().min(1) }), req.body);
    return { removed: prune(p, (req.params as any).slug, b.keep) };
  });

  app.get('/api/projects/:id/changes/:slug/docs/:file', async (req) => {
    const { slug, file } = req.params as any;
    return readDoc(project(req), slug, file);
  });
  app.put('/api/projects/:id/changes/:slug/docs/:file', async (req) => {
    const { slug, file } = req.params as any;
    const b = parse(z.object({ text: z.string().max(2 * 1024 * 1024) }), req.body);
    return { mtime: saveDoc(project(req), slug, file, b.text) };
  });
  app.delete('/api/projects/:id/changes/:slug/docs/:file', async (req) => {
    const { slug, file } = req.params as any;
    deleteLatest(project(req), slug, file);
    return { ok: true };
  });

  app.get('/api/projects/:id/viewed', async (req) => core.state.get(project(req).id).viewed);
  app.post('/api/projects/:id/viewed', async (req) => {
    const p = project(req);
    const b = parse(z.object({ marks: z.record(z.string(), z.number()) }), req.body);
    const st = core.state.get(p.id);
    Object.assign(st.viewed, b.marks);
    core.state.save(p.id);
    core.hub.broadcast({ t: 'unread', projectId: p.id, keys: Object.keys(b.marks) });
    return { ok: true };
  });

  /* ---------------- files ---------------- */

  const fileRoots = (p: Project) => [...core.projects.rootsOf(p), ...roots()];

  app.get('/api/projects/:id/files', async (req) => {
    const p = project(req);
    const root = guardPath(str((req.query as any).root) || p.path, fileRoots(p), 'Folder');
    return listTree(root);
  });

  // "Reveal in git" (S1): the file's history, and one commit's change to it.
  app.get('/api/projects/:id/git-log', async (req) => {
    const p = project(req);
    const abs = guardPath(str((req.query as any).path), fileRoots(p), 'File');
    const dir = path.dirname(abs);
    const sha = str((req.query as any).sha);
    if (sha) {
      if (!/^[0-9a-f]{4,64}$/.test(sha)) throw new HttpError(400, 'Bad commit id');
      const r = await git(dir, ['show', '--format=%H%n%an%n%ad%n%s', '--date=iso', sha, '--', abs], { timeout: 20000 });
      if (r.code !== 0) throw new HttpError(404, r.stderr.trim() || 'Commit not found');
      return { text: r.stdout.slice(0, 512 * 1024) };
    }
    const r = await git(dir, ['log', '-n', '50', '--format=%h%x09%at%x09%an%x09%s', '--follow', '--', abs], { timeout: 20000 });
    if (r.code !== 0) throw new HttpError(400, r.stderr.trim().split('\n')[0] || 'Not in a git repository');
    return r.stdout
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [sha, at, author, ...rest] = l.split('\t');
        return { sha, at: Number(at) * 1000, author, subject: rest.join('\t') };
      });
  });

  app.get('/api/projects/:id/file', async (req) => {
    const p = project(req);
    return readTextFile(guardPath(str((req.query as any).path), fileRoots(p), 'File'));
  });

  /* ---------------- tabs ---------------- */

  app.get('/api/tabs', async () => core.tabs.list());

  app.post('/api/tabs', async (req) => {
    const b = parse(launchTabSchema, req.body);
    const p = core.projects.get(b.projectId);
    const cwd = b.cwd ? guardPath(b.cwd, fileRoots(p), 'Working dir') : undefined;
    return core.tabs.launch({ projectId: p.id, change: b.change, spec: b.spec, cwd, resume: b.resume });
  });

  app.post('/api/tabs/reorder', async (req) => {
    const b = parse(z.object({ projectId: z.string(), ids: z.array(z.string()) }), req.body);
    core.tabs.reorder(b.projectId, b.ids);
    return { ok: true };
  });

  app.post('/api/tabs/:tab/relaunch', async (req) => {
    const b = parse(z.object({ resume: z.boolean().default(false), spec: tabLaunchSpecSchema.optional(), cwd: z.string().optional() }), req.body);
    const t = core.tabs.get((req.params as any).tab);
    const p = core.projects.get(t.projectId);
    const cwd = b.cwd ? guardPath(b.cwd, fileRoots(p), 'Working dir') : undefined;
    return core.tabs.relaunch(t.id, { resume: b.resume, spec: b.spec, cwd });
  });

  // Stop the process, keep the tab (exited, Resume session). Running CLIs list, leaving a project.
  app.post('/api/tabs/:tab/stop', async (req) => core.tabs.stop((req.params as any).tab, 'Stopped from Cayrnx.'));
  app.post('/api/projects/:id/stop-idle', async (req) => ({ stopped: core.tabs.stopIdle(project(req).id) }));

  // Images pasted or dropped in the browser: the CLI runs on this machine and can't see the
  // browser's clipboard, so save the image here and paste its path (the CLIs attach image paths).
  const IMAGE_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
  app.addContentTypeParser(/^image\//, { parseAs: 'buffer', bodyLimit: 25 * 1024 * 1024 }, (_req, body, done) => done(null, body));
  app.post('/api/tabs/:tab/paste-image', { bodyLimit: 25 * 1024 * 1024 }, async (req) => {
    const id = (req.params as any).tab as string;
    const ext = IMAGE_EXT[String(req.headers['content-type'] || '').split(';')[0].trim()];
    if (!ext) throw new HttpError(415, 'Only PNG, JPEG, GIF and WebP images can be pasted');
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || !body.length) throw new HttpError(400, 'Empty image');
    const dir = path.join(core.paths.home, 'pastes');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `paste-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}.${ext}`);
    fs.writeFileSync(file, body, { mode: 0o600 });
    core.tabs.paste(id, file + ' ');
    return { path: file, bytes: body.length };
  });

  app.delete('/api/tabs/:tab', async (req) => {
    core.tabs.close((req.params as any).tab);
    return { ok: true };
  });

  app.post('/api/tabs/:tab/send', async (req) => {
    const b = parse(z.object({ text: z.string().max(256 * 1024) }), req.body);
    return { text: core.tabs.send((req.params as any).tab, b.text) };
  });

  app.post('/api/tabs/:tab/insert-read', async (req) => {
    const b = parse(z.object({ text: z.string().min(1).max(20000) }), req.body);
    core.tabs.insertRead((req.params as any).tab, b.text);
    return { ok: true };
  });

  app.post('/api/tabs/:tab/write', async (req) => {
    const b = parse(z.object({ type: z.string(), expectN: z.number().int().optional(), insert: z.boolean().optional() }), req.body);
    return core.tabs.sendWrite((req.params as any).tab, b.type, b.expectN, !!b.insert);
  });

  app.post('/api/tabs/:tab/ack', async (req) => {
    const b = parse(z.object({ what: z.enum(['updated', 'notsaved', 'finished']) }), req.body);
    const id = (req.params as any).tab;
    if (b.what === 'updated') core.tabs.ackUpdated(id);
    else if (b.what === 'finished') core.tabs.ackFinished(id);
    else core.tabs.dismissNotSaved(id);
    return { ok: true };
  });

  // S13: answer a pending approval (hook decision, or keystrokes for a screen-detected prompt).
  app.post('/api/tabs/:tab/approval', async (req) => {
    const b = parse(z.object({ decision: z.enum(['once', 'always', 'deny', 'terminal']), scope: z.enum(['exact', 'prefix', 'all']).default('prefix') }), req.body);
    core.tabs.answerApproval((req.params as any).tab, b.decision, b.scope);
    return { ok: true };
  });

  // CLI hook relay (Claude hooks, Codex notify) — token + loopback checked in app.ts.
  app.post('/api/hook/:tab/:token', async (req) => {
    const { tab, token } = req.params as any;
    return core.tabs.onHook(tab, token, req.body ?? {});
  });

  /* ---------------- CLI sessions & tokens (V2) ---------------- */

  const sessionRoots = (p: Project) => [...core.projects.rootsOf(p), ...scanChanges(p).map((c) => c.cwd)];

  app.get('/api/projects/:id/sessions', async (req) => {
    const p = project(req);
    return listSessions(sessionRoots(p)).map((r) => ({ ...r, resume: r.id ? resumeCommand(r.service, r.id) : null }));
  });

  /** One session's per-model usage; a v1 OpenCode store only gives a total (counted as input). */
  const usageOf = (service: ServiceId, id: string, cwd: string): SessionUsage[] | null => {
    const u = sessionUsage(service, id, cwd);
    if (u) return u;
    const total = sessionTokens(service, id, cwd);
    return total === null ? null : [{ model: 'unknown', usage: { ...emptyUsage(), input: total } }];
  };
  const totalOf = (u: SessionUsage[] | null) => (u ? u.reduce((a, x) => a + usageTotal(x.usage), 0) : null);

  const tokenCache = new Map<string, { at: number; value: unknown }>();
  app.get('/api/projects/:id/tokens', async (req) => {
    const p = project(req);
    const hit = tokenCache.get(p.id);
    if (hit && Date.now() - hit.at < 8000) return hit.value;
    const st = core.state.get(p.id);
    const changes: Record<string, number | null> = {};
    for (const [slug, list] of Object.entries(st.sessions)) {
      let sum: number | null = null;
      for (const x of list) {
        const n = totalOf(usageOf(x.service, x.id, x.cwd));
        if (n !== null) sum = (sum || 0) + n;
      }
      changes[slug || 'workspace'] = sum;
    }
    const tabs: Record<string, number | null> = {};
    for (const t of core.tabs.list(p.id)) {
      if (!t.sessionId || t.kind !== 'term') continue;
      tabs[t.id] = totalOf(usageOf(t.spec.service, t.sessionId, t.cwd));
      if (!t.ranAt && (tabs[t.id] || 0) > 0) core.tabs.usedTokens(t.id);
    }
    const value = { changes, tabs };
    tokenCache.set(p.id, { at: Date.now(), value });
    return value;
  });

  /** The token breakdown: every session a change's tabs used, grouped by CLI + model. */
  app.get<{ Params: { id: string; slug: string } }>('/api/projects/:id/changes/:slug/usage', async (req): Promise<ChangeUsage> => {
    const p = project(req);
    const slug = req.params.slug === 'workspace' ? '' : req.params.slug;
    const list = core.state.get(p.id).sessions[slug] || [];
    // Older records have no role: take it from the tab that holds the session.
    const roleOf = new Map(core.tabs.list(p.id).filter((t) => t.sessionId).map((t) => [t.sessionId!, t.spec.role]));
    const rows = new Map<string, ModelUsageRow>();
    let total = emptyUsage();
    let missing = 0;
    for (const x of list) {
      const u = usageOf(x.service, x.id, x.cwd);
      if (!u || !u.length) {
        missing++;
        continue;
      }
      const role = x.role || roleOf.get(x.id) || '';
      for (const m of u) {
        const key = `${x.service}\n${m.model}`;
        const r = rows.get(key) || { service: x.service, model: m.model, roles: [], sessions: 0, ...emptyUsage() };
        const sum = addUsage(r, m.usage);
        const next: ModelUsageRow = { ...r, ...sum, sessions: r.sessions + 1, roles: role && !r.roles.includes(role) ? [...r.roles, role] : r.roles };
        rows.set(key, next);
        total = addUsage(total, m.usage);
      }
    }
    return { rows: [...rows.values()].sort((a, b) => usageTotal(b) - usageTotal(a)), total, missing };
  });
}
