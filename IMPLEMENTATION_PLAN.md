# Cayrnx — Implementation Plan

**Version:** 0.3 — 2026-09-22 (v0.3: OpenCode option A confirmed; open-folder-only projects; Docker image, /data, diff-in-MVP and Forgejo decided)
**Inputs:** `CAYRNX_UI_MOCKUP_SPEC.md` (v0.3), `CAYRNX_Design_mockup.html` (bundled React prototypes: desktop 1440×900 + mobile 390×844, dark/light)
**Scope:** MVP (spec phase **M**, incl. mobile) planned in detail; V2/V3 outlined.

> **What Cayrnx is for:** a hosted tool (VM, Docker or similar) that a user opens *other* projects in, so they can build those apps with several coding-agent CLIs coordinated through briefs.
> Two kinds of folder appear in this plan and must not be confused:
> - **Cayrnx repo** (this repo): this application's source. It is developed the normal way and never gets a `briefs/` folder of its own.
> - **Target project**: any repo a user opens *inside* a running Cayrnx. The `briefs/` folder, the `.git/info/exclude` entry and the change worktrees all belong to target projects.

---

## 0. Decisions (from planning Q&A, 2026-09-22)

| # | Topic | Decision |
|---|-------|----------|
| D1 | Stack | **Node + TypeScript** backend; **React + TypeScript + Vite + xterm.js** frontend (the prototype is already React). |
| D2 | Network access | Must work over **local network**, a **Pangolin tunnel** (from a VPS) and a **Cloudflare tunnel**. The owner uses LAN + Pangolin; other users may use any of them. → Built-in auth is mandatory; proxy/WebSocket friendliness is a requirement. |
| D3 | Users | **Single-user, self-hosted.** Other people run their own instances. No accounts or multi-user state (stays a spec non-goal). |
| D4 | Briefs location | In each **target project**: `<target>/briefs/<change-slug>/`. |
| D5 | Brief history | **Numbered files only** (`plan-001.md`, `plan-002.md`, …). No git commits of briefs. |
| D6 | Ignoring briefs | When a target project is opened, Cayrnx adds `briefs/` to **that project's `.git/info/exclude`**. The target's tracked `.gitignore` is never modified, and briefs are never pushed. |
| D7 | Projects | **Multi-project, VS Code-style:** users **open a project from its folder** (like File → Open Folder). Cayrnx never clones or creates projects. One server with a project selector and recent-projects list (§3.10). |
| D8 | Dev boundary | Developing Cayrnx touches **nothing outside its own repo folder**. Tests use throwaway target projects under `./.dev/fixtures`. (`demo-app` was only the mockup's sample content.) |
| D9 | Deployment | Runs on a **VM or in Docker** (both supported). The agent CLIs are installed and logged in *inside* that host or container. Target projects are folders it can reach, such as a mounted volume. |
| D10 | Unmocked screens | Built **in the existing mockup style** (same tokens and components). Specs are in §3.11; no separate design round. |
| D11 | OpenCode tabs | **Option A:** the full TUI, each tab with its own private server (`--standalone`) and settings passed in `OPENCODE_CONFIG_CONTENT`. The extra memory is acceptable because only a few tabs are open at once (§3.5.1). |
| D12 | Docker image | The usual approach: **CLIs baked into the image at pinned versions**, with their auto-updaters disabled. The **`/data`** volume holds app state, worktrees and the CLI logins (§3.9). |
| D13 | Diff vs previous | **In the MVP** (P3). It's a plain diff of two numbered files, and the prototype already has the diff code. |
| D14 | Cayrnx's own git | The home-network **Forgejo** instance until the project is complete. A public remote comes later. |

### Spec changes these decisions cause

| Spec location | Change |
|---|---|
| §4.5 Settings → Briefs "auto-commit folder on confirmed write" | **Removed** (D5). |
| §5.2 S7 edit-mode footer `saved + committed`; toasts `✓ findings-001 committed` | Becomes `saved` / `✓ findings-001 written`. |
| §5.2 S7 "Diff vs previous" (V2) | **Moved into the MVP** (D13): a diff of the `<type>-N-1` and `<type>-N` files, reusing the prototype's LCS `diffLines`. |
| §4.5 "prune keep-N" | With no git history, pruning **deletes** the only history. Default `keep = all`; pruning asks for confirmation. |
| §3 Top bar | **New: project selector** left of the change selector (D7, §3.11). |
| §10 sample paths `/home/you/code/demo-app/wt-…` | Worktrees don't nest inside the target project (§3.6). Sample content is used as test-fixture data only. |
| New screens | Login, first-run setup, project selector, Open project dialog + recent projects, Settings → Projects, Settings → Access & security (§3.11). |
| §6.2 S10 OpenCode fields and argv | Rebuilt for OpenCode v2 (§3.5.1). The prototype's `opencode <dir> --model … --variant … --agent …` doesn't exist in the full TUI any more. |

---

## 1. Findings from the mockup

The HTML file is a nested bundle: an outer page iframes two inner bundles, and each contains React 18 UMD, a small "dc-runtime" template engine, self-hosted woff2 fonts (IBM Plex Sans, JetBrains Mono, IBM Plex Mono, Fira Code) and one big logic class. I unpacked it during planning. P0 will commit the extracted sources to `design/prototype/` for reference.

Parts of the prototype to port instead of re-inventing:

| Prototype piece | Where it goes |
|---|---|
| CSS token sets `.cx.dark` / `.cx.light` (`--bg --panel --raised --elev --line --text --muted --dim --accent --blue …`), button/row/chip styles | `apps/web/src/styles/tokens.css`, verbatim first and then refactored |
| `writeMsg(change, type)`: the exact Write template (superseding vs delta, "if the file exists, stop") | `packages/shared/templates.ts`. Client preview and server send both use it. |
| Read-staging message `Read from briefs/<slug>/: a.md, b.md.` | `packages/shared/templates.ts` |
| `buildCmd()` per-service argv builder | `packages/shared/adapters/*`, corrected against the real CLIs |
| `dotsOf` / `derivedIdx` (status derived from files) | `packages/shared/status.ts` |
| `inline()` path:line linkifier, `parseMd`, `diffLines` | `apps/web` (linkifier becomes a markdown-it plugin); `diffLines` goes to shared |
| Seed data (changes, tabs, layouts, doc types, change types, briefs text) | Test fixtures + Storybook/Ladle stories |
| Demo toggles (missing binary, write not saved, write race, process exited, adapter fallback) | E2E scenarios driven by fake CLIs (§6) |
| Mobile: `section` overlays, `sheet` titles (read/write/new/overflow/badge/change/appr), `kb` keyboard state | Mobile shell components (P5) |

Installed CLIs on the dev machine (checked 2026-09-22): `claude 2.1.280`, `codex-cli 0.154.0`, `opencode v2.0.14`. Node 26.9, pnpm 12.4, git 2.53, g++ 15 (needed for node-pty).

---

## 2. Repository layout (the Cayrnx repo)

```
Cayrnx/
├─ apps/
│  ├─ server/          Fastify API + WebSocket + PTY manager + watchers
│  └─ web/             React SPA (desktop + mobile shells)
├─ packages/
│  └─ shared/          types, zod schemas, templates, adapters (argv), status/version logic
├─ tools/
│  ├─ fake-cli/        scriptable stand-ins for claude/codex/opencode (tests; §6)
│  └─ fixtures/        generator for throwaway target-project repos under .dev/
├─ deploy/             Dockerfile, compose.yaml, systemd unit, tunnel/proxy docs
├─ design/prototype/   extracted mockup sources (reference only)
├─ .dev/               (gitignored) dev CAYRNX_HOME, fixture target projects, pnpm store, caches
├─ CAYRNX_UI_MOCKUP_SPEC.md · IMPLEMENTATION_PLAN.md
└─ pnpm-workspace.yaml · tsconfig.base.json · .npmrc (store-dir/cache-dir → .dev/)
```

pnpm workspaces. A single `cayrnx` CLI entry (`apps/server/bin`) serves the built SPA. It ships as a Docker image and as an npm package (`npx cayrnx`) for VM installs.

---

## 3. Architecture

### 3.1 Overview

```
Browser (desktop / phone)                 Cayrnx server (Node) — VM or container
┌──────────────────────┐   HTTPS/WSS   ┌────────────────────────────────────┐
│ React SPA            │◀────────────▶│ Fastify REST  (projects, changes,   │
│  zustand store       │  (LAN,        │   docs, registries, settings, auth) │
│  xterm.js per tab    │   Pangolin,   │ WS hub (1 socket/client, muxed):    │
│  composer overlay    │   Cloudflare) │   pty.data / pty.input / pty.resize │
└──────────────────────┘               │   events: fs, tab state, toasts     │
                                       │ PTY manager (node-pty, ring buffer) │
                                       │ Adapters: claude / codex / opencode │
                                       │ Brief model + chokidar watcher      │
                                       │ Git helper (worktrees, status)      │
                                       └───────────────┬────────────────────┘
                                                       │ spawn (argv, no shell)
                                           claude · codex · opencode (PTYs)
                                                       │ cwd
                                       target projects: /projects/<app>/…  (briefs/ inside each)
```

### 3.2 Storage

- **App home** `$CAYRNX_HOME` (default `~/.local/share/cayrnx`; `/data` in Docker; **`./.dev/home` during development**):
  - `config.json`: settings (appearance, buttons, services, notifications, access)
  - `auth.json`: argon2id password hash, session secret
  - `projects.json`: registered target projects `{id, name, path, worktreeRoot?, watchMode}`
  - `registries/layouts.json`, `change-types.json`, `doc-types.json`: global registries (the Setups "Raw JSON" toggle edits these files; import/export is per file)
  - `state/<projectId>.json`: unread/viewed marks (per user, spec default), tab records for restore
  - `worktrees/<projectId>/<slug>/`: default worktree root (§3.6)
- **Per target project** `<target>/briefs/<slug>/`: `brief-001.md …` plus `meta.json` = `{type, name, created, archived, worktree: {path, branch} | null, layout, statusOverride?}`. The change list is **derived by scanning `briefs/*/meta.json`**, and status is **derived from the files present** (spec principle 1).
- Every project path goes through a guard. File APIs only resolve inside registered project roots and their worktrees (no `..`, symlinks resolved and re-checked). Registering or creating a project is limited to configured **allowed roots** (e.g. `/projects`).

### 3.3 Terminal model

- The **server owns the PTYs.** Browsers attach and detach. Each PTY has a ring-buffer scrollback (~2 MB) that gets replayed on attach. That makes desktop → phone hand-off seamless and lets closed tabs keep running.
- **Multi-client sizing:** the most recently *focused* client sets the PTY cols/rows. Other attached clients render with xterm `fit` and may letterbox.
- **Server restart:** PTYs die with the process. Tabs come back from `state/` as **exited**, with **Resume session** (spec S6 state (d)). Session IDs are captured at launch:
  - Claude: assign up front with `--session-id <uuid>`, resume with `--resume <id>`
  - Codex: read from its session store by cwd + start time, resume with `codex resume <id>`
  - OpenCode: `opencode session list --format json`, resume with `-s <id>`
  - tmux-backed persistence is a possible later option, not MVP.
- **Sending text** (Write send, composer ⏎ Send): write as **bracketed paste** (`ESC[200~ … ESC[201~`) and then `\r`, with per-adapter overrides where a TUI mishandles either one (spike P0-a). **Staging never touches the PTY.** Staged text lives in the app's composer overlay until Send. That is the transparency contract.
- **Busy/idle (MVP, coarse):** output-activity heuristic per adapter (bytes in the last N ms, known spinner glyphs, an "esc to interrupt" pattern). **V2 precise:** CLI hooks/events (§5).

### 3.4 Brief loop mechanics

- **Versioning:** `^(?<type>[a-z0-9-]+)-(?<n>\d{3,})\.md$`. The highest `n` is current. The next version is computed server-side at send time and embedded in the message by the shared template.
- **Write confirmation:** on Write-send the server records an expectation `{tab, path, sentAt}`.
  - The watcher sees the file created → **confirmed**. The server emits a toast, marks the doc unread and sets the other idle tabs of that change to ⚠ *brief updated*.
  - The tab returns to idle with no file → soft ⚠ **"brief not updated"** (spec §11).
  - The target file already exists at send time, or appears before the agent's write → **race** info row: "created by another tab".
- **Unread:** keyed by `project/slug/type-NNN` plus mtime. Cleared on Doc-tab open. Per-tab ⚠ clears when a Read is staged from that tab (spec §8).
- **Watcher:** chokidar on `<target>/briefs/**`. Watch mode is a per-project setting: `native` (inotify) or `polling`. Use polling when target projects sit on a network share (NFS, SMB, Docker bind-mounts from another host), where inotify misses writes from other machines.

### 3.5 Service adapters

A shared interface is used by both client (preview) and server (spawn), so the S10 command preview is **the same argv** that launches:

```ts
interface ServiceAdapter {
  id: 'claude' | 'codex' | 'opencode';
  fields: FieldSchema[];                 // drives S10 dynamic form (effort hidden if unsupported…)
  buildLaunch(o: LaunchOpts): { cmd: string; args: string[]; env: Record<string,string>; cwd: string };
  buildResume(sessionId: string, o: LaunchOpts): Launch;
  detect(): Promise<{ path; version; auth: string; ok: boolean }>;   // Settings → Services "Test"
  listModels?(): Promise<string[]>;      // opencode models, codex profiles, claude aliases
  listAgents?(): Promise<string[]>;      // opencode debug agents, claude agents dir
  discoverSessions?(project): Promise<SessionRow[]>;                  // V2 History
  activity: ActivityPatterns;            // busy/idle/approval heuristics
  pasteMode: 'bracketed' | 'raw';
}
```

- **Claude:** `--model`, `--effort`, `--agent`, `--permission-mode`, `--session-id`, `--add-dir <target>/briefs`. Spawned with `cwd` instead of the prototype's `cd … &&`. The preview can still render the `cd` form for readability.
- **Codex:** `-m`, `-p/--profile`, `-c model_reasoning_effort=…`, `-a/--ask-for-approval`, `-s/--sandbox`, `-C/--cd`, `--add-dir <target>/briefs`. Effort coercion note as in the prototype.
- **OpenCode:** see §3.5.1.
- Bypass/yolo options get warning styling (spec S10).

#### 3.5.1 OpenCode v2: what exists now and the alternatives

**Checked on v2.0.14** (`--help` for every subcommand plus the env vars the binary references; nothing was run beyond `--help` / `debug paths`):

| Command | Relevant flags | Use in Cayrnx |
|---|---|---|
| `opencode [dir]` (full TUI) | `--standalone`, `--server <url>`, `--auto`, `-c/--continue`, `-s/--session <id>`, `--prompt` | Main terminal tab. **No `--model`, `--agent` or `--variant`.** |
| `opencode mini` (minimal TUI) | `--model provider/model`, `--agent`, `--session`, `--fork`, `--replay`, `--prompt`, `--standalone`, `--server` | Fallback tab kind with native model/agent flags (reduced UI) |
| `opencode run [msg]` (one-shot) | `--model provider/model#variant`, `--agent`, `--format json`, `--session`, `--fork`, `--auto`, `--file` | Not a tab. Shows the variant syntax: `#variant` on the model ID. |
| `opencode serve` | `--hostname`, `--port`, `--cors`, `--stdio`; v2 HTTP API + event stream | **V2 precise status and approvals** (below) |
| `opencode api <operation>` | OpenAPI operation IDs, `--server` | Scripting/debug against a running server |
| `opencode acp` | Agent Client Protocol server (stdio) | Future "app skin" view (spec §13 stretch) |
| `opencode models` / `debug agents` / `debug config` / `debug paths` | `--server`, `--standalone` | S10 model and agent comboboxes; Settings → Services readout |
| `opencode session list --format json` / `export` / `import` | `-n` | Session discovery for resume and History (S3) |
| `opencode service start/stop/status/get/set` | — | The shared background server that TUIs use by default |

Relevant env vars: `OPENCODE_CONFIG_CONTENT` (inline JSON config), `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, `OPENCODE_SERVER_PASSWORD`, `OPENCODE_DISABLE_AUTOUPDATE`. Config keys include `model`, `default_agent` and `permission`.

**Key change in v2:** the TUI is a *client* of a background server (`opencode service`), and **config (model, agent) is loaded by the server**. A per-tab env var only takes effect if that tab has its own server. The alternatives:

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. Full TUI + private server + inline config** (recommended MVP) | `OPENCODE_CONFIG_CONTENT='{"model":"deepseek/deepseek-v3","default_agent":"build"}' opencode <dir> --standalone [--auto] [-s <id>]` | Full TUI; per-tab model/agent; independent of the user's global service | One server process per tab (memory); variant placement in config needs verifying |
| **B. `opencode mini`** | `opencode mini --standalone --model p/m --agent a` | Plain flags; simplest argv | Minimal interface, not the full TUI; no variant flag (try `p/m#variant`) |
| **C. Cayrnx-managed server per target project** (recommended V2) | Cayrnx runs `opencode serve --port <p>` (with `OPENCODE_SERVER_PASSWORD`); tabs run `opencode <dir> --server http://127.0.0.1:<p>`; model/agent set per session via the API | One server per project; **event stream gives precise busy/idle and approvals** (`session.execution.started/succeeded`, `permission.asked/replied`); prompts could go through the API instead of paste | Depends on the v2 API surface; more moving parts |
| D. Shared background service | TUI with no flags; Cayrnx sets nothing | Zero setup | No per-tab model/agent: breaks the layout concept |

**Decided (D11):** the MVP ships **A** (full TUI for every OpenCode tab). **B** stays only as an emergency fallback if a future OpenCode release breaks option A. Spike P0-b confirms two things: that `OPENCODE_CONFIG_CONTENT` + `--standalone` sets model and agent, and where the variant goes (`model#variant` or agent config). V2 moves OpenCode tabs to **C** for precise status and the S13 approval dialog. The S10 OpenCode fields become: model (from `opencode models`), variant (`#…` suffix, hidden if unsupported), agent (from `debug agents`) and the `--auto` toggle. The command preview shows the env var as well as the argv.

### 3.6 Changes, worktrees, ignore rules (all in target projects)

- **Opening a target project** (§3.10): Cayrnx checks that it's a git repo, then appends `briefs/` to **the target's** `.git/info/exclude`. That file lives in the common git dir, so the rule covers all its worktrees. The target's `.gitignore` is never touched. Cayrnx's own repo is never modified by this.
- **New change:** slug `<type>-<name>`. Create `<target>/briefs/<slug>/brief-001.md` from the change-type template, plus `meta.json`. Optionally create a worktree, then optionally launch the layout.
- **Worktree location:** `<worktreeRoot>/<projectId>/<slug>`. **Default root `$CAYRNX_HOME/worktrees`** (a persistent volume in Docker), configurable per project. It never nests inside the target, so the target's test runners and linters don't scan duplicate copies. Created with `git worktree add -b <branch> <path>`; branch default `wt-<slug>` per spec.
- **Briefs in worktrees:** a `briefs` symlink in each worktree points to `<target>/briefs`, so agents keep using the relative `briefs/<slug>/…` paths. The symlink is covered by the same exclude rule. Claude and Codex also get `--add-dir <target>/briefs` so sandboxed writes are allowed (to be verified in P0-c).
- **Archive** sets `meta.archived = true`. Tabs keep running until closed. Removing a worktree is a separate, explicit, confirmed action.
- **Directory switch (S14):** relaunch the change's tabs in the new cwd, resuming sessions where supported.

### 3.7 Access & security (D2/D3)

The app hands out shells, so this section is not optional.

- **Bind** `127.0.0.1` by default on a VM. The Docker image binds `0.0.0.0` inside the container and the compose file publishes it to a chosen host interface. LAN exposure is an explicit setting and shows a warning.
- **Login:** single password (argon2id) set at first run. First-run setup is only reachable from localhost, or with a one-time setup token printed to the server log / `docker logs`. Session cookie is `httpOnly`, `SameSite=Lax`, and `Secure` whenever the request arrived over HTTPS (also via proxy). Login is rate-limited. Passkeys are a later option.
- **WebSocket:** authenticated by the session cookie, with an **Origin allow-list** check (configurable list of public URLs: LAN host, Pangolin domain, Cloudflare domain). State-changing REST calls require the Origin check plus a custom header (CSRF).
- **Proxy support:** a `trustProxy` setting (off by default) for `X-Forwarded-*`. Optionally trust an upstream identity *in addition to* the password:
  - Cloudflare Access: verify the `Cf-Access-Jwt-Assertion` JWT against the team's JWKS
  - Pangolin: rely on its SSO in front, but still require the app login unless explicitly disabled
- **Tunnel robustness:** WS ping every 25 s (Cloudflare closes idle WebSockets at ~100 s), auto-reconnect with scrollback resync, and no reliance on long-lived HTTP streams other than the WS.
- **Desktop notifications** need a secure context. They work on `localhost` and over the HTTPS tunnels, but not on plain-HTTP LAN; Settings says so.

### 3.8 Frontend

- React 19, Vite, TypeScript. **zustand** store shaped like the prototype's state, which makes the port mechanical. **TanStack Query** for REST.
- **xterm.js** with fit, webgl, unicode11 and web-links addons. Themes are derived from the CSS tokens so the terminal "glass" follows the app theme (spec §4.5).
- **CodeMirror 6** for the markdown edit mode. **markdown-it** with a `path:line` linkify plugin for rendering.
- Fonts self-hosted via `@fontsource` (IBM Plex Sans UI; JetBrains Mono, IBM Plex Mono or Fira Code for terminals).
- **Two shells, one app:** `useMediaQuery('(max-width: 768px)')` picks `DesktopShell` or `MobileShell`. Panels, dialogs and popovers are shared content components. Only the chrome differs (spec §15).
- Popovers are click-open, close on outside-click or Esc (spec §6). Mobile renders them as bottom sheets.
- Mobile keyboard: `visualViewport` resize and scroll listeners keep the composer overlay above the soft keyboard.

### 3.9 Deployment (D9)

- **Docker image** (`deploy/Dockerfile`, D12): Node runtime, git, build deps for node-pty, and the three CLIs installed at build time (pinned versions via build args; updating a CLI means bumping the arg and rebuilding). The CLIs' own auto-updaters are turned off (`OPENCODE_DISABLE_AUTOUPDATE=1`, and the Claude and Codex equivalents) so the image stays reproducible. It runs as a non-root user with configurable `PUID`/`PGID`, so files written into target projects keep the right owner.
- **Volumes:**
  - `/data`: `CAYRNX_HOME`, worktrees, **and the CLIs' own homes**. `HOME=/data/home` means `~/.claude`, `~/.codex` and `~/.local/share/opencode` (logins, sessions) survive image updates.
  - `/projects`: target projects, bind-mounted from the host (e.g. the NAS share). This is the default *allowed root*.
- **CLI login inside the container:** the CLIs need a one-time interactive login. Cayrnx provides a **"Log in" button per service** in Settings → Services. It opens a plain terminal tab running `claude` / `codex login` / `opencode auth login`, and the user completes the login from the browser. The alternative is API-key env vars in compose.
- **VM install:** `npx cayrnx` / global install, plus a systemd user unit (`deploy/cayrnx.service`). The CLIs use the VM user's normal home.
- **Compose example** also shows optional `cloudflared` and Pangolin `newt` sidecars, with docs for all three access paths (LAN, Pangolin, Cloudflare).

### 3.10 Target projects

Cayrnx works like VS Code with AI agents in place of the editor: you **open a project folder** and work in it (D7).

- **Open project** = a server-side folder picker limited to the allowed roots, plus a type-in path field. There is no clone and no "new project". The project must already exist on disk.
- **Git repo folders** get the full feature set: worktrees, the `briefs/` exclude entry, git-status dots.
- **Non-git folders** still open. Briefs and tabs work, the worktree toggle is disabled with the tooltip "Not a git repository", and there's no exclude entry (nothing to exclude from). An optional **[Initialize git]** action runs `git init` on explicit request only.
- **Recent projects** list (like VS Code's): the last-opened projects show on the empty state and in the project selector.
- Each project records a name, path, worktree root and watch mode. Removing a project from Cayrnx never deletes files.
- Switching project scopes the whole UI: change selector, briefs, files, tabs, status bar. Running tabs from other projects keep running and still feed the global ⚠ badge cluster (grouped by project).

### 3.11 Screens without mocks: specs in the existing style (D10)

These are built with the prototype's tokens and existing components (`.btn`, chips, cards, segmented control, dialog and sheet shells, form rows, monospace preview strips). On mobile, every dialog below is a bottom sheet (spec §15).

| Screen | Layout & content | Reused patterns |
|---|---|---|
| **Login** | Centered card (~380px) on `--bg`: Cayrnx wordmark, password field, [Sign in] primary, muted line "Signed-in sessions last 30 days". Error row in `--red` text. Honors the theme (follows the system until signed in). | S9 dialog card, input focus ring, toast styling |
| **First-run setup** | 3-step card (stepper dots in the dialog header): ① set password (+ confirm), ② allowed roots (prefilled `/projects` in Docker) + public URLs for the Origin allow-list, ③ "Open your first project" (the Open project dialog inline). Final CTA leads to the S17 empty state. | S9 single-column form, segmented control, S17 empty state |
| **Project selector** (top bar, left of the change selector) | Button: folder glyph + project name + ▾. Popover: search, rows (name, dimmed path, active-changes count, ⚠ count), footer "Open project…" and "Manage projects…". Mobile: first row in the change sheet. | Change-selector popover (§6.7), rows, badge pills |
| **Open project dialog** | Path field (mono, with autocomplete) over a folder browser (the Files-panel tree restricted to allowed roots, folders only). The selected folder shows a chip: "git repo ✓ · branch main" or "not a git repo: worktrees off" + [Initialize git]. Name field (defaults to the folder name). Advanced (collapsible): worktree root, watch mode (native/polling). Footer: [Cancel] **[Open]**. Monospace preview strip at the bottom listing exactly what opening does (`append briefs/ to <path>/.git/info/exclude`), in the S10 transparency style. | S1 tree, S10 command preview strip, S9 form rows |
| **Empty state / recent projects** | With no project open: S17-style CTA "Open a project folder" + a recent-projects list (name, dimmed path, last opened). | S17 empty state, History changes rows |
| **Settings → Projects** | Table: name · path · worktree root · watch mode · active changes · kebab (Rename, Edit, Remove from Cayrnx: confirm, "files are not deleted"). | S4 doc-types table |
| **Settings → Access & security** | Groups: *Password* (change); *Allowed origins* (editable chip list); *Reverse proxy* (trustProxy toggle, Cloudflare Access team domain + AUD, Pangolin note); *Sessions* (list of active sessions with sign-out); *Bind address* readout with an amber warning if not localhost. | S5 groups, service rows with chips |
| **Settings → Services additions** | Per service: **[Log in]** (opens a login terminal tab), OpenCode launch-mode readout (`--standalone` + config env). | S5 services rows |

---

## 4. MVP phases

Each phase ends with a demoable build and a short acceptance list. Rough size: S ≈ 1–3 days, M ≈ 1 week, L ≈ 2 weeks (solo-with-agents pace).

### P0: Foundations & spikes (M)

1. `git init` the Cayrnx repo. Workspace scaffold, lint/format, vitest, Playwright. `.npmrc` store and cache pointed at `.dev/`. Push to the home-network **Forgejo** (D14). Forgejo Actions CI workflow (optional).
2. Extract the prototype into `design/prototype/`. Port the tokens and base CSS. Build a Ladle/Storybook gallery of the static components in both themes.
3. `tools/fixtures` generates throwaway **target projects** under `.dev/fixtures/` (a small TS repo with the spec's §10 files and some briefs) so the brief loop can be tested. Fake CLIs go in `tools/fake-cli`.
4. **Spikes** (each ends in a short note in `docs/spikes/`):
   - **a.** PTY send semantics per real CLI (bracketed paste + Enter, multi-line, while the TUI is busy).
   - **b.** OpenCode: option A (`OPENCODE_CONFIG_CONTENT` + `--standalone`) sets model and agent; where the variant goes; cost of one server per tab; a quick look at option C's event stream for V2.
   - **c.** Codex `workspace-write` and Claude permission modes writing to `briefs/` through the worktree symlink and `--add-dir`.
   - **d.** Session-ID capture and resume for each CLI.
   - **e.** chokidar native vs polling on a network share.
   - **f.** WebSocket through a Cloudflare tunnel and through Pangolin: idle timeout, reconnect.

*Accept:* `pnpm dev` serves an empty shell in both themes; spike notes are written; the adapter argv for all three CLIs is confirmed.

⚠ Spikes a–d run the **real** CLIs against the `.dev/fixtures` repo. The CLIs write session data to their own stores in your home directory (outside the Cayrnx folder), so they run only with your go-ahead. Alternative: run them inside the dev Docker container from P6 with `HOME` inside `.dev/`.

### P1: Server core & auth (M)

- Fastify app: config loading, `CAYRNX_HOME`, allowed roots, project registry (open existing, validate the git repo, write the exclude rule into the target).
- Brief model: scan and parse, derived status, `meta.json` CRUD, the version helper. Watcher emits events over WS.
- Registries CRUD (layouts, change types, doc types) with zod validation. Built-ins are locked.
- Auth: first-run setup, login and logout, sessions, Origin allow-list, trustProxy.
- The WS hub skeleton (authenticated, ping/pong, reconnect protocol).

*Accept:* integration tests against fixture target projects cover scanning, derived status, the exclude entry in the *target's* `.git/info/exclude`, the watcher firing on file create, and WS rejection of an unauthenticated connection or a bad Origin.

### P2: Terminals (L)

- PTY manager: spawn by argv + env, ring buffer, attach and detach, resize policy, exit handling, restore-as-exited after restart.
- Adapters for claude, codex and opencode (per P0 findings). `detect()` powers Settings → Services **Test**; `listModels` and `listAgents` fill the S10 comboboxes.
- UI: tab strip (state chips, overflow scroll, drag to reorder, context menu), terminal viewport, exited/failed/launching overlays, **S10 Add CLI** with the live argv + env preview, Test launch, and edit-and-relaunch.
- Workspace tabs (no change attached): Read and Write are disabled with a tooltip.

*Accept:* launch all three real CLIs in a fixture target, then close and reopen the browser and the scrollback is intact. A missing binary gives an amber ⚡ tab rather than a dead one. Attaching from a phone viewport mirrors the desktop.

### P3: The brief loop (L), the core of the product

- **S11 Read popover:** doc types in the current change, version sub-checkboxes, custom path, live preview → **stage** in the composer.
- **S6 Composer overlay:** edit in place, ⏎ Send, ✕ clear, minimize to the `✎ N staged` chip.
- **S12 Write popover:** type list with next version, template preview, `+ New type…`, **Send now** (Shift = stage, respecting the Settings inversion).
- Write confirmation, not-saved and race handling (§3.4). Toasts.
- **S16 badges (coarse):** tab chips, rail unread count, global cluster and popover (jump-to-tab).
- **S7 Doc tab:** render, version prev/next, edit and save, **Diff vs previous**, Stage in tab ▾, Copy path. `path:line` refs reveal the file in the Files panel.

*Accept:* the spec §1 core loop runs end to end with fake CLIs in Playwright, including the not-saved and race variants. The staged preview text is byte-identical to what reaches the PTY (asserted in the fake CLI).

### P4: Projects, changes, layouts, panels (L)

- **Project selector**, **Open project dialog** and recent projects (§3.10–3.11), plus **change selector** with search, workspace entry, and "+ New change".
- **S9 New Change:** type cards, name → slug and folder preview, worktree toggle and branch preview, layout preview (mini tile diagram), seed option. Creation runs brief-001 from the template, then the worktree and symlink, then the layout launch. A partial launch with a missing binary leaves the other tabs fine.
- **S2 Briefs panel:** cards, dots, doc tree, history disclosure (collapse after 5, "…" for 10+ versions), unread, archived section, kebab actions.
- **S1 Files panel:** tree, fuzzy filter, git-status dots (`git status --porcelain`, debounced), open as doc tab, copy path, "Change directory…" → **S14**.
- **S3 History (changes segment):** table with reopen.
- **S4 Setups:** layouts grid (apply, edit, duplicate, export, delete, snapshot current tabs, import with the missing-types modal), change types editor, doc types table with inline add, Raw JSON toggle.
- Status bar: cwd (middle truncation), worktree@branch, dots, git count, token placeholder, archive.

*Accept:* every spec mock-list state for S1, S2, S4, S9 and S14, plus opening git and non-git project folders, is reachable in the running app.

### P5: Mobile shell (M)

- Top icon bar and section overlays with ✕ and swipe-down (the terminal keeps running underneath). Condensed top bar with the ⋮ overflow (Layout, Add CLI, theme). Compact tab strip. Icon-only Read/Write with long-press labels. Staged chip.
- All dialogs and popovers as bottom sheets, including the new screens. Composer above the soft keyboard. Touch targets ≥ 44 px, with a visible tap equivalent for every hover affordance.
- No tiled view on mobile.

*Accept:* spec §15 mock list (a)–(e) in Playwright at 390×844 (WebKit and Chromium). Manual check on a real phone over LAN and over Pangolin.

### P6: Settings, empty states, deployment, hardening (M)

- **S5 Settings:** appearance (theme toggle, terminal font picker, size, line height, cursor), buttons, briefs (unread mode, keep-N with a destructive-prune confirm), services (+ Log in, OpenCode launch mode), notifications, **Access & security**, **Projects**, About with export/import of all settings.
- **S17 empty and first-run states** (no projects, no changes, no tabs), login screen, first-run wizard.
- Work through the §11 edge-state checklist: long-label truncation, 8+ tabs, 10+ versions, a multi-line TUI composer with the staged overlay.
- **Deployment:** Dockerfile + compose (volumes `/data` and `/projects`, PUID/PGID, optional cloudflared/newt sidecars), the npm `cayrnx` bin, a systemd unit, and docs for LAN, Pangolin and Cloudflare.

*Accept (MVP done):* `docker compose up` → first run → log in each CLI from the browser → open a project folder → full core loop on desktop and phone. A security checklist passes: unauthenticated WS and REST are rejected, a foreign Origin is rejected, path traversal outside the allowed roots is blocked, and the login is rate-limited.

---

## 5. Post-MVP

**V2**
- **Precise status and approvals (S13, S16 precise):**
  - OpenCode via a Cayrnx-managed `opencode serve` per target project (§3.5.1 option C): `session.execution.*` and `permission.asked/replied` events, answering approvals through the API
  - Claude Code hooks (Stop/Notification/PermissionRequest → a local HTTP endpoint the server exposes per tab)
  - Codex `notify` and its approval surface
  - Heuristics stay as the fallback ("degrade gracefully").
- **S3 session browser:** `opencode session list --format json`, Codex and Claude session stores. "Open in new tab" uses resume; "Copy resume command" is offered too. Unrecognized formats get a muted row.
- **S8 tiled view** (desktop only) from the layout `areas` (the prototype already stores CSS-grid template areas like `'a b' 'a c'`).
- Per-change token counter.
- The adapter-fallback ⚡ chip becomes real.
- Mobile sheets for S9/S10 polish.

**V3**
- **S15 change board:** full-screen five columns, observational drag with the ✋ override marker.
- Verification surfaces.
- "App skin" chat view via `opencode acp` / agent protocols (spec §13 stretch).
- Tagged options from spec §14: toolbar staged strip, board side panel, numeric ①–⑤ labels.

---

## 6. Testing strategy

| Layer | Tooling | Notes |
|---|---|---|
| Shared logic | vitest | Slug and version parsing, `writeMsg`, read message, status derivation, diff, argv/env builders (snapshot tests, re-checked against `--help` output captured in P0) |
| Server | vitest + throwaway target repos in `.dev/` | Brief scanning, watcher, write-confirmation state machine, worktree + exclude + symlink, open project (git and non-git), auth/Origin/CSRF, path guard |
| Terminal | vitest + **fake CLIs** | `tools/fake-cli/*` mimic each TUI's banner, spinner, prompt, file writes, approval prompts and exit codes, driven by a script file. They cover the prototype's demo toggles (missing binary, not saved, race, exited). |
| E2E | Playwright | 1440×900 and 390×844, dark and light. The spec §1 core loop, §11 edge states and §15 mobile list. Visual snapshots compared with prototype screenshots for the Wave-1 screens. |
| Container | docker compose smoke test | Image builds, first-run token flow, volumes persist logins and projects across restarts |
| Manual | checklist | Real CLIs (with your go-ahead), a real phone over LAN and Pangolin, Cloudflare tunnel |

**Dev boundary (D8):** Cayrnx itself is built the normal way, with no briefs. Tests and dev servers use `CAYRNX_HOME=./.dev/home` and throwaway target projects under `./.dev/fixtures`. The pnpm store and caches live under `./.dev`. Nothing is written outside `/home/you/code/Cayrnx`, except when the real CLIs are run on purpose.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| TUIs treat pasted input differently (multi-line, busy state, paste-detection UIs) | Spike P0-a; per-adapter `pasteMode`; the composer shows exactly what was sent |
| CLI flags drift (already seen: OpenCode v2 dropped the TUI's `--model` and `--agent`) | Adapters are data-driven (argv **and** env); Settings "launch arg template (advanced)" override; `detect()` version gate with a warning chip; pinned CLI versions in the Docker image |
| One OpenCode server per tab (option A) costs memory | Accepted (D11): few tabs are open at once. Measured in P0-b; V2 option C could share one server per project if needed |
| Coarse busy/idle heuristics misfire, so "not saved" fires falsely | Soft ⚠ only (never blocking); V2 hooks and events replace the heuristics |
| Sandboxed CLIs can't write `briefs/` through the symlink | `--add-dir`; fallback: a real (excluded) `briefs/<slug>` dir in the worktree, synced by the server |
| File-watch gaps on network shares / bind mounts | Per-project `polling` mode; re-scan on focus |
| Exposing shells through tunnels | §3.7: auth required even behind Pangolin or Cloudflare, Origin allow-list, localhost/token-only first run |
| CLI logins inside a container | Persisted `/data/home`; browser "Log in" terminal flow; API-key env fallback |
| File ownership in bind-mounted target projects | PUID/PGID matching the host user |
| PTY size conflicts across desktop and phone | Last-focused client sets the size; others fit |
| node-pty native build for self-hosters | Docker image ships it built; npm install uses prebuilds where available |

---

## 8. Open items (non-blocking; defaults chosen)

1. **Registries scope:** global only for MVP. Per-project overrides for layouts and types could come later.
2. **Forgejo repo** for Cayrnx: a private repo on the home-network Forgejo, created 2026-09-22 (default branch `main`). P0 step 1 only needs `git init` + first push. A license comes later, once it goes public.
3. **Platform support:** Docker (linux/amd64 + arm64) and Linux VMs first. macOS is likely fine via npm. Windows is not targeted.

*Resolved in v0.3:* worktree root = `/data` volume (`$CAYRNX_HOME/worktrees`); Diff vs previous in the MVP (D13); CLIs baked into the image (D12); OpenCode option A (D11); open-folder-only projects (D7).
