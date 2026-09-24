# Cayrnx

**Cayrnx** is a self-hosted web app for running coding-agent CLIs (**Claude Code**, **OpenAI
Codex CLI** and **OpenCode**) side by side in real terminals, from any browser, including your
phone.

The agents don't message each other. They work through small, numbered **markdown briefs** that
live next to the code: a researcher writes `findings-001.md`, a planner reads it and writes
`plan-001.md`, a coder reads the plan and writes `code-001.md`, a reviewer writes
`review-001.md`. You decide who reads what and when, and every step leaves a plain file behind
that you (or a fresh agent session) can open later.

```
            ┌────────────── briefs/bug-login-timeout/ ──────────────┐
  you ──▶  brief-001 ──▶ findings-001 ──▶ plan-001 ──▶ code-001 ──▶ review-001
            ▲ Grill Me     ▲ researcher     ▲ planner    ▲ coder      ▲ reviewer
            └──── each is a real CLI tab running on the server ─────┘
```

- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Setting it up](#setting-it-up)
- [Using it](#using-it)
- [Technology](#technology)
- [Repository layout](#repository-layout)
- [Development](#development)
- [Security model](#security-model)
- [Status and limitations](#status-and-limitations)
- [Contributing](#contributing)
- [Credits](#credits)
- [License](#license)

---

## What it does

- **Real CLI terminals in the browser.** Every tab is a real `claude`, `codex` or `opencode`
  process in a server-side PTY, shown with xterm.js. The CLIs keep running when you close the
  browser. Open the page on another device and you get an exact replay of each screen.
- **Projects, changes and briefs.** Open any folder as a *project*. Each piece of work is a
  *change* (bug, story, spike, or your own types) with a folder of versioned docs:
  `briefs/<change>/<type>-NNN.md`. What you type in the **Brief** box when you create a change
  becomes the start of `brief-001.md`, so you can always look back at what the change was for.
- **Read ▾ / Write ▾ hand-offs.** *Write* asks a tab to save its work as the next version of a
  doc type. The server works out the file name, then watches for the file and confirms it.
  *Read* puts "read these files" into another tab's prompt. Nothing is sent without you seeing
  it first.
- **Layouts (teams).** A layout is a set of roles, each with a CLI, model, effort and permission
  mode, arranged on a grid. A new install comes with `team`:
  Grill Me → researcher → planner → coder → reviewer → ops. Apply a layout to a change and all
  its tabs launch at once. Edit it, or build your own in *Setups → Layouts*.
- **Progress at a glance.** Each change shows a dot for its brief and one for each CLI tab,
  lit once that tab has run. A board view sorts changes into columns based on which docs exist.
- **Approvals.** Permission prompts from any tab show up as a badge and can be answered from a
  dialog, including on your phone.
- **Token breakdown.** Tokens per tab and per change. Click the total for a per-model table
  (input, output, reasoning, cache read, cache write, and cost where the CLI reports it), read
  from each CLI's own session store.
- **Sessions and history.** Browse every CLI session a project has used, resume one in a new tab,
  or copy its resume command. Tabs survive a server restart with **Resume session**.
- **Files, diffs and git.** A file tree, a markdown viewer with `path:line` links, a diff against
  the previous version of any doc, and git history.
- **Changes (git diff).** Like VS Code's Source Control view, a panel lists every uncommitted file
  in the change's folder. Files are split into *staged* and *not staged* (new files included),
  with lines added and removed. Click a file to see its diff side by side or inline, with line
  numbers, or the whole file. It refreshes as the agents work, so you can check exactly what
  changed before you commit. It's read-only: commit from a terminal tab.
- **Themes that reach the CLIs.** Fifteen colour themes, each with its own tinted surfaces and
  accent, restyle the app *and* the CLIs: Cayrnx (dark/light), Dracula, Nord, Solarized
  Dark/Light, Gruvbox, Tokyo Night, Catppuccin Mocha, One Dark, Cyberpunk, Green Phosphor,
  Forest, Amber CRT, High Contrast and Paper.
  Claude Code and OpenCode are started in their terminal-palette modes, and colour queries are
  answered with the theme's colours.
- **Shared-folder warnings.** By default tabs work in the project folder, like terminals you
  opened there yourself. Cayrnx warns you when two CLIs that can edit files share a folder, and
  again if you prompt one while another is still working. Git worktrees per change are
  available, but off by default.
- **Mobile.** A full phone layout: section sheets, a composer for staged text, a foldable top
  bar for more terminal room, and swipe gestures.
- **Resource limits.** At most 13 CLIs running at once (the longest-idle one stops first),
  background CLIs stopped after 24 hours idle, and CLIs stopped when you archive a change. The
  idle clock restarts whenever you open the tab, reload the page or type in it, so long-running
  work you keep checking on stays up. Busy CLIs and pending approvals are never stopped. All of
  it is adjustable in *Settings → Running CLIs*.
- **Bundled `/grill-me` skill.** Matt Pocock's `grill-me` skill is available in every Claude
  Code and OpenCode tab. Use it when you want an agent to question you until the brief is clear
  (see [Skills](#skills-grill-me)). Nothing runs it for you.

## How it works

### Concepts

| Term | Meaning |
|---|---|
| **Project** | A folder you opened. Its briefs live in `<project>/briefs/`. Opening a git folder can add `/briefs` to that project's `.gitignore` (optional; delete the line to commit briefs). |
| **Change** | One piece of work: `briefs/<type>-<name>/` with a `meta.json` and its docs. Can be archived, reopened or deleted. |
| **Doc** | `<type>-NNN.md`, e.g. `plan-002.md`. Doc types (brief, findings, plan, code, review, or your own) are *superseding* (each version is complete and replaces the last) or *delta* (each version adds to the ones before). |
| **Tab** | A CLI process for one role in one change (or a plain shell / doc viewer). |
| **Layout** | A reusable team: roles, CLI settings and a grid. |
| **Status** | Worked out from which files exist (and which tabs have run), not stored separately. |

### The brief loop

1. **Write ▾** on a tab: the server works out the next version number (say `plan-002`) and fills
   in the Write message template. The preview in the popover shows exactly the same text. Then
   it records an *expectation*.
2. The CLI saves the file. A file watcher (chokidar) sees `briefs/<change>/plan-002.md` and
   confirms the write: a toast, an unread dot, and a ⚠ on the change's other tabs to say there's
   something new.
3. If the tab goes idle without the file appearing, you get a soft "brief not updated" warning.
   If another tab created that version in the meantime, the stale send is refused and you're
   offered the next number.
4. **Read ▾** on another tab puts "Read briefs/<change>/plan-002.md …" into its prompt, or into
   the composer on a phone. You add your own words and press Enter.

The Read/Write wording follows common practice for handing work between agent sessions through
files:
[Anthropic's Claude Code best practices](https://code.claude.com/docs/en/best-practices),
[HumanLayer's research → plan → implement](https://ai.engineer/talks/context-engineering-for-complex-codebases),
[Harper Reed's spec → plan → todo](https://harper.blog/2025/02/16/my-llm-codegen-workflow-atm/) and
[Addy Osmani on specs for agents](https://addyosmani.com/blog/good-spec/).
Each doc type adds guidance: *findings* are facts with `path:line` evidence; a *plan* has
phases, success criteria and a "Not doing" list; *code* says what changed and how it was
verified; a *review* gives a verdict checked against the brief and plan. You can edit all of it
in *Settings → Briefs* and *Setups → Doc types*.

### Terminals

- PTYs are owned by the server (`node-pty`). Each has a headless xterm alongside it, so any
  client that attaches mid-session gets an exact screen replay. The browser that last focused a
  tab sets its size.
- All tabs share **one WebSocket per browser**. It pings every 25 s and reconnects with a replay,
  so it copes with tunnels that drop idle connections.
- Launch commands come from per-CLI **adapters** (`packages/shared/src/adapters`). The Add CLI
  dialog uses the same code for its preview, so the command you see is exactly what the server
  runs. If a CLI rejects its flags, the tab falls back to a plain terminal.
- **Status and approvals:** Claude Code gets `--settings` hooks (Stop, UserPromptSubmit,
  PermissionRequest), and approvals go back through the hook. Codex uses `notify`. For
  OpenCode, and as a fallback, prompts are detected on screen and answered with the CLI's own
  keys.
- **Session tracking** reads each CLI's own store (read-only). That covers Claude transcripts in
  `~/.claude/projects`, Codex rollouts in `~/.codex/sessions` and OpenCode's SQLite database. It
  gives tokens, models, and whether a model or effort was switched inside the CLI.

### State

All app state lives in `CAYRNX_HOME` (default `~/.local/share/cayrnx`, `/data` in Docker):

```
config.json        settings
auth.json          password hash + session token hashes (mode 600)
registries/        layouts.json, change-types.json, doc-types.json (editable JSON)
state/<project>.json   tabs, sessions used, what you've read
worktrees/         per-change git worktrees (only if you turn them on)
term-colors.json   the theme colours given to the CLIs
```

Briefs live in the target projects themselves, as plain markdown. Cayrnx has no database.

## Setting it up

### Requirements

- **Node.js 22+** and **pnpm** (the repo pins `pnpm@12`; `corepack enable` sets it up).
- Build tools for `node-pty` if no prebuilt binary matches your platform: `python3`, `make`,
  and a C++ compiler.
- At least one agent CLI, installed and logged in on the same machine:
  [Claude Code](https://code.claude.com/docs), [Codex CLI](https://github.com/openai/codex),
  [OpenCode](https://opencode.ai). Cayrnx can install a missing one for you from *Settings →
  Services → Install…*, which shows the official command and runs it in a visible tab.
- Linux or macOS. Windows isn't tested.

### Option 1: Docker (recommended for a server)

```bash
git clone <this repo> cayrnx && cd cayrnx
PROJECTS_DIR=/srv/code docker compose -f deploy/compose.yaml up -d --build
docker compose -f deploy/compose.yaml logs cayrnx     # prints the one-time setup token
```

- `/data` holds all app state, including the CLIs' own logins (`HOME=/data/home`). Your code is
  mounted at `/projects`.
- Set `PUID`/`PGID` to the user that owns your project files.
- The CLIs are built into the image at pinned versions (`CLAUDE_VERSION`, `CODEX_VERSION`,
  `OPENCODE_VERSION` build args).
- Log the CLIs in from *Settings → Services → Log in*, or set `ANTHROPIC_API_KEY` /
  `OPENAI_API_KEY` in `compose.yaml`.

### Option 2: VM or your own machine

```bash
git clone <this repo> cayrnx && cd cayrnx
pnpm install
pnpm build
pnpm start                         # http://127.0.0.1:4717
```

Or install it as a command: `npm install -g ./apps/server && cayrnx`. To run it as a service,
copy `deploy/cayrnx.service` to `~/.config/systemd/user/` and
`systemctl --user enable --now cayrnx`.

```
cayrnx [--host 127.0.0.1] [--port 4717] [--home <dir>]

CAYRNX_HOME   app state (default ~/.local/share/cayrnx; /data in Docker)
CAYRNX_HOST   bind address (default 127.0.0.1; 0.0.0.0 in Docker)
CAYRNX_PORT   port (default 4717)
```

### First run

1. Open Cayrnx **on localhost**, or from another device using the one-time setup token printed
   in the server log.
2. Set a password, choose which folders Cayrnx may open (or leave it unrestricted), and list the
   public URLs you'll use (LAN address, tunnel hostname) so their origins are allowed.
3. Open a project folder, then **New change**: pick a type, a name, write the brief, and pick a
   layout.

### Reaching it from other devices

| Path | What to set |
|---|---|
| **LAN** | Bind to `0.0.0.0` and add `http://<lan-ip>:4717` under *Allowed origins*. Browsers disable notifications and clipboard access on plain HTTP. |
| **Reverse proxy / Pangolin** | Point it at port 4717, turn on **Trust X-Forwarded-\*** and add the public URL under *Allowed origins*. |
| **Cloudflare Tunnel** | Same as above. You can optionally require Cloudflare Access too: requests then need a valid `Cf-Access-Jwt-Assertion` *and* a Cayrnx session. |

More detail is in [`docs/deploy.md`](docs/deploy.md).

## Using it

- **New change:** type, name, **Brief** (the bug, story or request, in the words you'd use for a
  first prompt), an optional worktree, and a layout to launch.
- **Tabs:** click to focus, double-click for the **tiled view** (the layout's grid). Right-click
  a tab for its launch command, Relaunch, Resume, or Resume with launch settings. Hover for its
  role, CLI, model and folder.
- **Write ▾ / Read ▾** hand docs between tabs as described above. Shift-click Read to stage the
  text in the composer instead of the CLI prompt.
- **Briefs panel:** changes with their docs, unread dots and progress dots. Archived changes can
  be reopened or deleted (you're asked to confirm).
- **Board:** *Terminals / Board* in the top bar.
- **Settings:** appearance (themes, fonts, CLI colours), services (paths, extra args, install,
  log in, Codex skills), briefs (message templates, unread mode, worktree default), running-CLI
  limits, notifications, access & security, and *Install app*: adds Cayrnx to your phone's home
  screen (Android Chrome: an install button; iOS Safari: Share → Add to Home Screen). Chrome needs
  HTTPS or localhost, and the section is hidden when you're already in the installed app.
- **Setups:** layouts, change types (brief templates and default layout) and doc types, or edit
  the raw registry JSON.

### Skills (/grill-me)

Cayrnx bundles Matt Pocock's [`grill-me`](https://github.com/mattpocock/skills) and `grilling`
skills (`apps/server/skills`, MIT). They make the agent interview you until nothing about the
change is left to assumption, which is handy before you save a brief.

- **Claude Code** tabs get them via `--plugin-dir`, for that launch only: type `/grill-me`.
- **OpenCode** tabs get them via `skills.paths` in the launch config.
- **Codex** can't be given a skills folder when it starts, so install them into its own skills
  folder yourself (every Codex session will then have them). *Settings → Services → Codex*
  shows whether they're installed and gives the same command:

  ```bash
  mkdir -p ~/.codex/skills && cp -r apps/server/skills/skills/grill-me apps/server/skills/skills/grilling ~/.codex/skills/
  ```

  Use `$CODEX_HOME/skills` if you set `CODEX_HOME`. In Codex, type `$grill-me` or pick it from
  `/skills`.

## Technology

| Area | Used |
|---|---|
| Language | TypeScript throughout (strict), ES modules |
| Monorepo | pnpm workspaces: `packages/shared`, `apps/server`, `apps/web` |
| Server | Node.js 22+, [Fastify 5](https://fastify.dev) (+ cookie, static, websocket), [zod](https://zod.dev) validation |
| Terminals | [node-pty](https://github.com/microsoft/node-pty) PTYs, [@xterm/headless](https://github.com/xtermjs/xterm.js) + serialize addon for replay |
| File watching | [chokidar](https://github.com/paulmillr/chokidar) (native or polling per project, for network shares) |
| Storage | JSON files in `CAYRNX_HOME`; reads OpenCode's store with the built-in `node:sqlite` |
| Auth | argon2id ([@node-rs/argon2](https://github.com/napi-rs/node-rs)), server-side sessions, Origin allow-list, optional Cloudflare Access JWT |
| Web app | [React 19](https://react.dev), [zustand](https://github.com/pmndrs/zustand), [Vite](https://vite.dev) |
| In-browser terminal | [xterm.js 6](https://xtermjs.org) with fit, WebGL, unicode11 and web-links addons |
| Editor / markdown | [CodeMirror 6](https://codemirror.net), [markdown-it](https://github.com/markdown-it/markdown-it) |
| Server bundle | esbuild (`apps/server/build.mjs`); the built SPA is served from `apps/server/web` |
| Tests | [Vitest](https://vitest.dev) (shared logic + server integration), [Playwright](https://playwright.dev) end-to-end (desktop Chromium, mobile Chromium + WebKit) |
| Test doubles | Scriptable fake `claude`/`codex`/`opencode` CLIs in `tools/fake-cli`, so no test ever runs a real agent |
| Deployment | Dockerfile + compose (optional `cloudflared` / Pangolin `newt` sidecars), systemd user unit |

## Repository layout

```
apps/server       Fastify API + one multiplexed WebSocket; PTYs, briefs model, watcher,
                  worktrees, auth, session/token readers, bundled skills (apps/server/skills)
apps/web          React SPA: desktop shell, mobile shell, xterm.js, CodeMirror, markdown-it
packages/shared   Types, zod schemas, version/status logic, Read/Write templates, diff, and the
                  CLI launch adapters used by both the preview and the server
tools/fake-cli    Scriptable stand-ins for claude/codex/opencode (tests and the mock world)
tools/fixtures    Throwaway sample projects for tests (under .dev/)
tools/mock        Seeds the "mock world" used by `pnpm dev`
deploy            Dockerfile, compose.yaml, entrypoint, systemd unit
e2e               Playwright specs
docs              Deployment notes, CLI help snapshots, spike notes
design            The original UI prototype (extracted from CAYRNX_Design_mockup.html)
```

The original spec and plan are in [`CAYRNX_UI_MOCKUP_SPEC.md`](CAYRNX_UI_MOCKUP_SPEC.md) and
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

## Development

```bash
pnpm install
pnpm dev            # mock world: server :4718 + Vite :5173 (password: cayrnx-dev)
pnpm dev:reset      # rebuild the mock world from scratch
pnpm dev:lan        # your own instance: built app on 0.0.0.0:4717, CAYRNX_HOME=.dev/home
pnpm typecheck
pnpm test           # vitest
pnpm build          # SPA + bundled server
pnpm test:e2e       # Playwright against the built server
```

- **Everything a dev run writes stays in the repo.** `.dev/` (git-ignored) holds the pnpm store,
  node-gyp headers, fixtures, the mock world, your dev home and test sandboxes.
- **The mock world** (`.dev/mock`) is a few sample repos with dated history, changes, briefs
  and finished CLI sessions. It's created with the fake CLIs through the real API, so every
  screen has realistic content. It's seeded once; `pnpm dev:reset` starts over.
- **Real CLIs:** point *Settings → Services* at the real `claude`/`codex`/`opencode` when you
  want them. Be aware they then write to their own stores in your home directory.
- A component gallery is at `/?gallery`.

## Security model

Cayrnx hands out shells, so treat it like SSH:

- Every REST call and the WebSocket need a session. Unauthenticated requests get 401.
- A foreign `Origin` is rejected on the WebSocket and on every state-changing call. Changes also
  need an `X-Cayrnx: 1` header, which forces a CORS preflight.
- First-run setup only works from localhost without proxy headers, or with the one-time token.
- Login is rate-limited (5 failures per 15 minutes per client). Passwords use argon2id, and
  only session token hashes are stored.
- File access is limited to the allowed folders, and symlinks are resolved and checked again.
- Cookies are `httpOnly`, `SameSite=Lax` and `Secure` over HTTPS. Responses send
  `frame-ancestors 'none'`, `X-Frame-Options: DENY` and `nosniff`.

These are covered by `apps/server/test/server.test.ts`.

## Status and limitations

Cayrnx is a working single-user app in daily use. It isn't a hosted service and has no
multi-user accounts.

- Codex and OpenCode approvals are detected on screen. Only Claude Code has a structured hook.
- In-CLI model/effort switches are followed for Claude Code and Codex, not OpenCode yet.
- A managed `opencode serve` (event stream instead of screen detection) isn't built.
- The Docker image is defined but hasn't been through a full release build yet.

## Contributing

Issues and pull requests are welcome. Before opening a PR, run `pnpm typecheck`, `pnpm test` and
`pnpm build && pnpm test:e2e`. The tests only use the fake CLIs, so they never touch your real
Claude/Codex/OpenCode logins. Match the style of the code around your change, and add a test for
new behaviour.

## Credits

- `grill-me` / `grilling` skills by [Matt Pocock](https://github.com/mattpocock/skills), MIT;
  see `apps/server/skills/LICENSE-mattpocock-skills`.
- Built with Claude Code.

## License

[MIT](LICENSE) © 2026 Luke Hallinan. The bundled `grill-me` / `grilling` skills keep their own
MIT licence (`apps/server/skills/LICENSE-mattpocock-skills`).
