# P0 spikes: status

The plan's spikes a–d need the **real** CLIs running against a fixture repo. Those CLIs write
session data to their own stores in your home directory, so they run only with your go-ahead
(plan §4, memory "dev boundary"). Nothing below ran a real CLI beyond `--help`/`--version`, and
those ran with `HOME` redirected into `.dev/clihome`.

| Spike | Status | What's implemented meanwhile | To verify |
|---|---|---|---|
| **a. PTY send semantics** | Done against the fake CLIs; pending for the real ones | Bracketed paste (only when the TUI has enabled it, read from the headless terminal's mode) then `\r` after 120 ms (`submitDelayMs` per adapter). The fake CLI logs every submit; E2E asserts the staged text reaches the PTY byte-for-byte. | Multi-line pastes and a send while busy, in Claude Code 2.1.280, Codex 0.154.0 and OpenCode 2.0.14. Adjust `pasteMode` / `submitDelayMs` in `packages/shared/src/adapters/*`. |
| **b. OpenCode option A** | Flags confirmed from `--help`; behaviour pending | `opencode <dir> --standalone [--auto]` with `OPENCODE_CONFIG_CONTENT={"model":"p/m[#variant]","default_agent":"…"}` and `OPENCODE_DISABLE_AUTOUPDATE=1`. The variant field is free text and marked unverified in the Add CLI dialog. | Do model and agent take effect? Where does the variant go (`model#variant` or agent config)? Memory cost of one private server per tab. A quick look at `opencode serve` events for V2. |
| **c. Sandboxed writes to `briefs/`** | Pending | Worktrees get a `briefs` symlink to `<target>/briefs`; Claude and Codex also get `--add-dir <target>/briefs`. The exclude rule is `/briefs` (not `briefs/`) so the symlink is ignored too — verified by the server tests. | Codex `workspace-write` and Claude `acceptEdits`/`plan` writing through the symlink. Fallback if they can't: a real excluded `briefs/<slug>` dir in the worktree synced by the server (plan §7). |
| **d. Session IDs and resume** | Claude done by construction; Codex best effort; OpenCode fallback | Claude: `--session-id <uuid>` assigned up front, `--resume <id>`. Codex: on exit, scan `$CODEX_HOME/sessions/**/rollout-*.jsonl` for a matching cwd, else `codex resume --last` (cwd-filtered). OpenCode: `-s <id>` when known, else `-c` (continue last in the folder). | Rollout file format for 0.154.0. Where OpenCode v2 keeps sessions (`opencode session list --format json` needs a server). |
| **e. chokidar native vs polling** | Implemented | Per-project watch mode (native/polling, 1 s interval, 250 ms write-settle). The client also re-scans on window focus. Before declaring "not saved", the server re-reads the folder so a missed event can't produce a false warning. | Try polling on a network share (NFS) with writes from another machine. |
| **f. WebSocket through tunnels** | Implemented | 25 s server pings plus client app-level pings, exponential reconnect (0.5–5 s), and scrollback resync from the headless-terminal replay on re-attach. | Through Pangolin and a Cloudflare tunnel: idle survival, and reconnect after a network change on a phone. |

Captured `--help` output lives in `docs/cli-help/`. The adapter argv tests in
`packages/shared/test/shared.test.ts` pin the flags taken from it.

## V2 plumbing to verify with the real CLIs

Everything below is exercised end to end with the fake CLIs (`apps/server/test/v2.test.ts`,
`e2e/v2.spec.ts`). The formats themselves come from the CLIs' documentation and their prompts
as seen in the prototype, so check them on first use:

| Piece | Assumption | If it's wrong |
|---|---|---|
| Claude `--settings` hooks | Events `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `Stop`, `Notification`, `PermissionRequest`; hook JSON arrives on stdin; `PermissionRequest` output `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"\|"deny", "updatedPermissions":[{"type":"addRules","rules":[{"toolName","ruleContent"}],"behavior":"allow","destination":"session"}]}}}` | Turn off *Precise status via hooks* for Claude in Settings → Services; approvals then fall back to on-screen detection |
| Codex `-c notify=[…]` | The program gets one JSON argument with `type: "agent-turn-complete"` after each turn | Turn the toggle off; the "finished" state falls back to heuristics |
| Screen approval keys | Claude `1`/`2`/`3`; Codex `y`/`a`/Esc; OpenCode Enter/`a`/Esc | Edit `approvalKeys` in `packages/shared/src/adapters/*` |
| Session stores | Claude `$CLAUDE_CONFIG_DIR/projects/<cwd with non-alphanumerics as ->/<id>.jsonl` (usage on assistant lines); Codex `$CODEX_HOME/sessions/Y/M/D/rollout-*.jsonl` (`session_meta`, `turn_context.model`, `token_count`); OpenCode v1 `storage/session/*/<id>.json` | Unparsable files show as muted "unrecognized" rows; OpenCode v2's store is unknown |
| ⚡ fallback trigger | A non-zero exit within 6 s whose output says `unknown option` / `unexpected argument` / … | The tab stays exited with the CLI's own error |

## Findings from `--help` that change the plan/prototype

- **Claude Code 2.1.280:** the permission modes are `manual | acceptEdits | auto | bypassPermissions | dontAsk | plan`.
  There's no `default` (the prototype had one); `manual` is used instead. Effort is
  `low | medium | high | xhigh | max`. Login is `claude auth login`, status is `claude auth status`.
- **Codex 0.154.0:** `--ask-for-approval` takes only `on-request | never` (no `untrusted`).
  `resume --last` is cwd-filtered unless `--all`. `-p/--profile` layers
  `$CODEX_HOME/<name>.config.toml`.
- **OpenCode 2.0.14:** it isn't published to npm (`opencode-ai` stops at 1.18.x), so the Docker
  image uses the official install script, which is unverified until the first image build. The
  full TUI has no model or agent flags; see spike b.
