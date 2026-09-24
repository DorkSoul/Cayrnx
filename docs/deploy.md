# Deploying Cayrnx

Cayrnx is single-user and self-hosted: it runs on a VM or in Docker, with the agent CLIs installed
and logged in on that same host or container (plan D3, D9). You open *other* projects in it —
folders it can reach, such as a mounted volume.

It hands out shells. Every browser signs in with the Cayrnx password, including behind Pangolin
or Cloudflare.

## Docker (recommended)

```bash
PROJECTS_DIR=/srv/code docker compose -f deploy/compose.yaml up -d --build
docker compose -f deploy/compose.yaml logs cayrnx     # prints the one-time setup token
```

- **Volumes:** `/data` holds `config.json`, `auth.json`, the registries, per-project state,
  the change worktrees, and `HOME=/data/home` (so `~/.claude`, `~/.codex` and
  `~/.local/share/opencode` survive image updates). Your projects mount at `/projects`, which
  is the default allowed folder.
- **Ownership:** set `PUID`/`PGID` to the host user that owns the project files, so files the
  agents write keep the right owner.
- **CLIs** are baked in at pinned versions (build args `CLAUDE_VERSION`, `CODEX_VERSION`,
  `OPENCODE_VERSION`). To update one, bump the arg and rebuild. Their auto-updaters are off
  (`DISABLE_AUTOUPDATER=1`, `OPENCODE_DISABLE_AUTOUPDATE=1`), and the root-owned install
  means an updater couldn't change the image anyway.
- **Logging in the CLIs:** open a project, then go to Settings → Services and click
  **Log in** for each service. That opens a terminal tab running `claude auth login`,
  `codex login` or `opencode auth login`. Finish the flow in the browser. The alternative is
  API keys in `compose.yaml` (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).
- **First run:** the setup wizard only works from localhost, or with the one-time token from
  `docker logs`. Requests from the Docker host arrive via the bridge network, so you'll
  normally need the token.

## VM / bare metal

```bash
pnpm install && pnpm build          # in this repo
node apps/server/bin/cayrnx.js      # or: npm install -g ./apps/server && cayrnx
```

For a service, copy `deploy/cayrnx.service` to `~/.config/systemd/user/`. It binds
`127.0.0.1:4717` by default and keeps state in `~/.local/share/cayrnx`. The CLIs use your
normal home and logins.

## Access paths

| Path | What to set |
|---|---|
| **LAN** | Bind to the LAN (`CAYRNX_HOST=0.0.0.0` on a VM, or publish `0.0.0.0:4717:4717` in compose). Add `http://<lan-ip>:4717` under *Allowed origins*. Plain HTTP means no desktop notifications or async clipboard (browsers need a secure context). |
| **Pangolin** | Run `newt` (compose profile `pangolin`) and point the resource at `http://cayrnx:4717`. Turn on **Trust X-Forwarded-\*** and add the public URL under *Allowed origins*. Pangolin's SSO sits in front; the Cayrnx password is still required. |
| **Cloudflare Tunnel** | Run `cloudflared` (compose profile `cloudflare`) with the public hostname routed to `http://cayrnx:4717`. Turn on **Trust X-Forwarded-\*** and add the public URL under *Allowed origins*. Optionally put an Access application in front and fill in *Cloudflare Access* (team domain, AUD, hostnames): requests on those hostnames then need a valid `Cf-Access-Jwt-Assertion` **in addition to** the Cayrnx session. |

Tunnels close idle WebSockets (Cloudflare after ~100 s). Cayrnx pings every 25 s and reconnects
with a scrollback replay, and the terminals keep running on the server meanwhile.

## Security model (checklist)

Covered by `apps/server/test/server.test.ts`:

- Unauthenticated REST (401) and WebSocket (401) are rejected.
- A foreign `Origin` is rejected on the WebSocket and on every state-changing call. Mutations
  also need the `X-Cayrnx: 1` header, which forces a CORS preflight from other sites.
- First-run setup is accepted only from localhost without proxy headers, or with the setup
  token. A tunnel sidecar on the same host doesn't count as local.
- Login is rate-limited (5 failures per 15 min per client).
- Path traversal outside the allowed folders is blocked. Symlinks are resolved and re-checked.
- Sessions: `httpOnly`, `SameSite=Lax`, and `Secure` over HTTPS. Only token hashes are
  stored (`auth.json`, mode 600). Passwords use argon2id.
- Responses send CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY` and `nosniff`.
