# Skills bundled with Cayrnx

Handed to the CLIs Cayrnx launches, never installed into your own CLI setup:
Claude Code gets this folder as `--plugin-dir`, OpenCode gets `skills/` in `skills.paths`
(through OPENCODE_CONFIG_CONTENT).
Codex can't be given skills per launch: install them into `~/.codex/skills` yourself
(`cp -r skills/grill-me skills/grilling ~/.codex/skills/`; Settings → Services → Codex has the commands).

- `skills/grill-me`, `skills/grilling`: from [mattpocock/skills](https://github.com/mattpocock/skills)
  (commit c55ee46073ed), MIT, see LICENSE-mattpocock-skills. Unchanged: `grill-me` hands over to
  `grilling` by name (Claude Code also lists it as `cayrnx:grilling`).
