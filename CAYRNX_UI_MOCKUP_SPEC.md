# Cayrnx — UI Mockup Specification

**Product name:** **Cayrnx** — decided 2026-09-22 (replaces *Baton*; a respelling of "cairn" — the trail-marker metaphor: each brief marks where the last agent got to). Registry-verified free on npm / PyPI / crates.io; no conflicting product found.
**Version:** 0.3 — 2026-09-22 (renamed → Cayrnx; mobile layout added §15; v0.1 questions resolved §14)
**Audience:** UI/UX team producing mockups; later, the developer implementing them
**Baseline viewport:** Desktop-first, 1440×900 (min 1280×800) **plus a required mobile-compatible layout** (min 360×640 — see §15). Local single-user web app.
**Environment for realistic mock content:** projects live under `/home/you/code/<project>` (a network share), git remote a self-hosted Forgejo.

---

## 0. Screen inventory (what to mock)

| ID | Screen / surface | Phase |
|----|------------------|-------|
| S0 | App shell (rail + left panel + top bar + main area + status bar) | **M** |
| S1 | Files panel | **M** |
| S2 | Briefs panel | **M** |
| S3 | History panel (changes + CLI sessions) | M (changes) / **2** (session browser) |
| S4 | Setups panel (layouts, change types, doc types) | **M** |
| S5 | Settings panel | **M** |
| S6 | Terminal tab (tab strip + per-tab toolbar + staged composer overlay + terminal viewport) | **M** |
| S7 | Doc tab (brief document viewer/editor) | **M** |
| S8 | Tiled (board-of-terminals) view | **2** |
| S9 | New Change dialog | **M** |
| S10 | Add CLI dialog | **M** |
| S11 | Read popover (checkbox menu) | **M** |
| S12 | Write popover (type dropdown) | **M** |
| S13 | Permission/approval dialog | **2** |
| S14 | Directory-switch confirmation dialog | **M** |
| S15 | Change board view (cross-change overview) | **3** |
| S16 | Badge & notification system (cross-cutting) | M (coarse) / **2** (precise) |
| S17 | Empty / first-run states | **M** |
| S18 | Mobile shell (top icon bar + section overlays + dialog sheets) | **M** |

Phase legend: **M** = MVP mock now · **2** = V2 (needs event integration) · **3** = V3 · ◆ = optional stretch.

---

## 1. Product summary (for context)

Cayrnx is a **local web app that coordinates multiple coding-agent CLIs (OpenCode, Codex CLI, Claude Code) around markdown "briefs" instead of automatic agent-to-agent messaging.**

The user runs several CLIs at once as terminal tabs — any service, any model, any settings (e.g. an OpenCode tab on Mimo, another OpenCode tab on DeepSeek, Codex on Luna, Claude Code on Sonnet). Each unit of work — a bug, a story, a spike — is a **change** that owns a **brief folder**: a set of small, numbered, versioned markdown documents (brief, findings, plan, code changes, review, plus user-defined types).

Agents do **not** talk to each other. The human routes work: they tell one tab to investigate, click a button to have it write its findings into the brief folder, then tell another tab to read the plan and implement. The briefs carry context between agents so no conversation history has to be re-read — cheaper in tokens, auditable in git, and fully under user control.

**Core loop (use this story to make mocks feel real):**

1. User clicks **+ New change** → picks type *bug*, names it `login-timeout`, picks layout *triage*.
2. App creates `briefs/bug-login-timeout/brief-001.md` and launches 3 tabs (researcher / planner / coder), each attached to that brief.
3. User asks the researcher tab to investigate. It finds the likely cause. User clicks **Write ▾ → findings** → app fills & sends `…create findings-001.md…` → file appears in the Briefs panel, badge clears.
4. User clicks **Read ▾** on the planner tab → ticks `brief` + `findings` → the staged text lands in the composer → user adds "draft an implementation plan" → Enter.
5. Planner writes `plan-001.md`. Coder reads plan, implements, writes `code-001.md`. Reviewer tab writes `review-001.md`. Status dots ①→⑤ fill in.
6. Change archived. Next bug: same flow, setup loads instantly from the saved layout.

### Glossary (put this in the mockup doc footer)

| Term | Meaning |
|------|---------|
| **Change** | One unit of work (bug/story/spike…). Owns one brief folder, one worktree (optional), N tabs. |
| **Brief folder** | `briefs/<change-slug>/` containing versioned markdown docs + `meta.json` (app state only). |
| **Doc type** | A kind of document: `brief`, `findings`, `plan`, `code`, `review`, custom (e.g. `test-round`). |
| **Version** | Each write of a type creates `<type>-<NNN>.md` with the next number (zero-padded). Highest number = current. |
| **Superseding** | Default doc contract: each new version is complete and self-contained; old versions are history. |
| **Tab** | One running CLI session in a terminal view, attached to the current change's brief. |
| **Layout** | A saved, named set of tab configurations (service, model, effort, agent, permissions, role, tile) applied to a change in one click. |
| **Stage** | Put text into the composer *without* sending (reads always stage). |
| **Send** | Fill the composer and submit immediately (writes do this; Shift+click any send to stage instead). |
| **Workspace tab** | A tab not attached to any change (brief buttons disabled). |

---

## 2. Design principles (drive every mock decision)

1. **The human routes; files are the bus; the app only observes.** There is no UI for "auto-assign this task to model X." Anything that looks like orchestration magic is out of scope. Status is *derived* from what files exist, never from a maintained field.
2. **Interaction law: writes send, reads stage.** Write button = fill & send (explicit, one click, confirmed). Read button = stage-only; the user finishes the thought and presses Enter. This must be visually obvious (icon, color, hover hint).
3. **Transparency over everything.** The user must always see exactly what text will be / was sent to a terminal before it happens. No hidden prompts, no hidden state. The staged composer overlay (S6) is the contract.
4. **Modern chrome, real terminals.** VS Code / Zed-class: clean sans-serif UI, rounded panels, comfortable spacing, iconography — with embedded terminal views that are *themed to match* (monospace font choice, harmonized dark/light palette). Not a chat-bubble app; the transcript area is a terminal grid. Suggest: one UI font (sans, e.g. Inter), one mono (e.g. JetBrains Mono), 8pt spacing scale. **Theme: dark default + full light theme — both token sets required for V1 (decided, §14).**
5. **Labels are stickers, not wiring.** Role labels ("planner", "tester") name tabs and color them — they never imply the app will do anything automatically.
6. **Degrade gracefully, show it.** Status badges start coarse (file-watch heuristics) and get precise later; if a service adapter fails, the tab falls back to plain terminal with an explanatory chip — never a dead tab.
7. **Bounded content.** Brief docs are small and link-heavy (`path:line`, not pasted dumps). Mock realistic short documents, not walls of text.

---

## 3. S0 — App shell

```
┌───┬─────────────────────┬────────────────────────────────────────────────┐
│   │ LEFT PANEL (tabbed) │ TOP BAR                                        │
│ ◫ ├─────────────────────┤ [▾ bug-login-timeout] [+ New change]           │
│ 📁│ filter              │ [Layout: triage ▾] [+ Add CLI]      ⚠ 2        │
│ 📋│ [Files][Briefs][Hist]├────────────────────────────────────────────────┤
│ 🕘│                     │ TAB STRIP                                      │
│ 🛠│ panel content       │ ● researcher·opencode·ds-v3 │ planner·sonnet   │
│ ⚙ │                     │ ════════════════════════════════════════════  │
│   │                     │ [Read ▾][Write ▾]                            │
│   │                     │ ┌────────────────────────────────────────────┐  │
│ ⌄ │                     │ │      TERMINAL / DOC CONTENT AREA          │  │
│   │                     │ │  [ ✎ staged overlay …      ⏎ Send  ✕ ]   │  │
├───┴─────────────────────┤ └────────────────────────────────────────────┘ │
│ ▸ collapse               ├────────────────────────────────────────────────┤
└─────────────────────────┴────────────────────────────────────────────────┘
 cwd: /home/you/code/demo-app · worktree@bug-login-timeout · ●①②③④⑤ · git ●2 · tokens 184k
```

**Regions**

| Region | Spec |
|--------|------|
| **Icon rail** (far left, 48–56px) | Five icon buttons: Files 📁, Briefs 📋, History 🕘, Setups 🛠, Settings ⚙. Active = highlighted. **Briefs icon carries a numeric badge** when any brief doc changed and is unviewed. Bottom: collapse chevron (hides the panel entirely, rail remains). Tooltip labels on hover. |
| **Left panel** (240–320px, resizable) | One visible panel at a time (see S1–S5). Header row: panel title + contextual filter/search. |
| **Top bar** (48px) | Left: **change selector** — dropdown listing active changes (name, type chip, status dots), plus "No change (workspace)". Center/left: **+ New change** (primary button), **Layout ▾** (apply saved layout to current change), **+ Add CLI** (opens S10). Right: **global badge cluster** — e.g. `⚠ 2` = 2 tabs need approval or have unread brief updates across all tabs; click → popover listing them (tab, reason, jump-to). |
| **Main area** | Tabbed document space (see S6/S7). Supports focus mode (default) and tiled mode (S8). |
| **Status bar** (28px) | Left→right: cwd path (truncate middle) · worktree@branch (or "main checkout") · five **status dots ①–⑤** (see §9) · git dirty count · per-change token counter (V2; show placeholder in MVP) · right-aligned: mode indicator (Focus/Tiled toggle in V2), archive-change icon button. |

**Mobile variant:** the shell transforms per §15 — rail becomes a top icon bar, sections open as overlays over the terminal, bars condense. Mock the desktop shell here; mobile lives in S18.

**Mock list (S0):** (a) default dark, panel open on Briefs; (b) panel collapsed to rail; (c) top-bar badge popover open; (d) no-change/workspace state (change selector empty, New change emphasized); (e) **light theme variant of (a)** — both themes required for V1.

---

## 4. Left rail panels

### 4.1 S1 — Files panel

**Purpose:** browse the current change's working directory; switch directory (re-scoping all tabs).

- **Directory header:** breadcrumb of cwd (`/home/you/code/demo-app/wt-bug-login-timeout`), refresh icon, **⋯ menu → "Change directory…"** → opens S14.
- **Tree:** standard file tree (folders expand, icons per file type, indent guides). Right-click/kebab: *Open as doc tab* (main area), *Copy path*, *Reveal in git* (V3).
- **Unsaved/dirty markers:** subtle dot on changed files (from git status) — MVP can be static in mocks.
- **Filter box:** fuzzy filter within tree.
- **States:** empty directory ("No files — check the change's worktree"); tree load spinner; permission error row.

**Mock list:** populated tree for a realistic JS/TS project; filtered state; empty state.

### 4.2 S2 — Briefs panel (the coordination view — most important panel)

**Purpose:** see every change, its brief folder contents, versions, and unread state; open docs; start changes.

**Layout (top → bottom):**

1. **Header:** title "Briefs" · **+ New change** (primary, opens S9) · view toggle: *Active / All*.
2. **Change list (collapsible cards, one per change):**
   - Row: **type chip** (`bug` / `story` / `spike`, colored), change name, **status dots ①–⑤** (filled per existing doc types — see §9), relative last-activity ("2m ago"), kebab (Open, Rename brief, Archive, Show in Files).
   - Expanded: **folder tree of docs**, each row: type icon + label + **version number pill** (`plan-002`), muted timestamp, **unread dot** (user hasn't viewed this doc yet), "current" styling on highest number, older versions dimmed and nested under a "history (2)" disclosure.
   - Unread styling: unread doc = accent dot + slightly bolder label; viewed = plain.
3. **Archived section (bottom, collapsed by default):** archived changes, same card, dimmed, no live badges.
4. **Footer:** link "Open type manager →" (jumps to S4 Doc types).

**Interactions:** click doc → opens **Doc tab** (S7) and clears that doc's unread dot. Hover on version pill → tooltip with all versions (click to open old version). Rail icon badge = count of unread docs across all changes.

**States:** no changes yet (→ S17 empty state with "New change" CTA); change with only `brief-001` (status ① only); change mid-flight (③); fully reviewed (⑤, subtle green tint on dots).

**Mock list:** (a) overview with 3 active changes at different statuses; (b) one change expanded showing `brief-001, findings-001, plan-001, plan-002 (current, unread), code-001`; (c) archived section; (d) empty.

### 4.3 S3 — History panel

**Purpose:** two segmented views.

1. **Changes (MVP):** flat table/list of all changes ever (name, type, status, opened date, archived?, branch). Actions: reopen (un-archive), open brief folder.
2. **CLI sessions (V2):** sessions discovered on disk from each CLI's transcript store — rows: service icon, model if known, project path, date, duration/token (best effort), session id (copy button), actions: **"Open in new tab"** (relaunches that CLI resuming the session), "Copy resume command" (`claude -r <id>` / `codex resume <id>` / `opencode -s <id>`). Segmented filter: All / OpenCode / Codex / Claude.

**States:** session browser loading (parse in progress), unparsable entry (muted "unrecognized format" row — degrade, don't error).

**Mock list:** changes table; session browser with 3 services represented.

### 4.4 S4 — Setups panel

**Purpose:** manage the three registries: Layouts, Change types, Doc types. Segmented tabs across the top.

**Segment A — Layouts**
- **Layout cards:** name, description, **mini tile diagram** (3–6 rectangles showing terminal arrangement), tab chips (`opencode·ds-v3`, `claude·sonnet`, …), badge for embedded custom types, footer actions: **Apply to current change**, Edit, Duplicate, Export (JSON), Delete.
- **Primary button:** "📸 Snapshot current tabs as layout" — captures open tabs → opens Edit form prefilled.
- **Import:** drop zone / paste JSON → if referenced doc types are missing: modal "This layout uses 2 custom types (test-round, perf). Add them?" [Add] [Skip].

**Segment B — Change types**
- List: `bug`, `story`, `spike` (defaults) + custom. Row: name, default-layout binding, brief template (collapsed preview).
- Edit form: **Name** · **slug preview** (`bug-login-timeout` pattern) · **brief-001 template** (small markdown editor with placeholders like `{{name}}`, `{{symptom}}`) · **Default layout** (select) · color/icon.

**Segment C — Doc types**
- Table: name · slug · mode (superseding ▾ / delta) · keep-N · size cap · color/icon · built-in lock (for brief/findings/plan/code/review — editable template, not deletable).
- **"+ Add type"** row → inline form (also reachable from the Write popover).
- Examples pre-seeded in mocks: `test-round` (superseding, keep 3), `perf` (delta).

**Raw JSON toggle** (top-right): switches any segment to a code view of the underlying config file — power-user affordance, include in mocks as a subtle secondary action.

**Mock list:** layouts grid (3 layouts); change-type editor; doc-types table with inline add-row open.

### 4.5 S5 — Settings panel

**Settings groups (single scroll, section anchors):**
1. **Appearance & terminals:** **theme toggle Dark (default) / Light — both token sets required for V1**; mono font family/size, line height, cursor style; terminal glass follows app theme unless overridden (background, foreground, 16-color palette note); "harmonize CLI themes" hint text.
2. **Buttons:** default Write behavior (Fill & send / Stage — default fill), Shift+click inversion toggle, keyboard shortcut display (e.g. `⌘R` read, `⌘W` write — placeholders, team's call).
3. **Briefs:** auto-commit folder on confirmed write (on) · prune keep-N default · unread-dot behavior (track per user vs per tab — pick one for V1, default per user).
4. **Services/Adapters:** per service row — binary path, version check + **Test** button (green/red chip), launch arg template (advanced, code field), auth mode readout (e.g. `claude: subscription login ✓ (via /status)`), enable/disable toggle. Missing binary → amber chip "not found — tabs will fail to launch".
5. **Notifications:** desktop notification on approval-needed (off), on tab-finished (off), sound (off).
6. **About:** version, config file paths, export/import all settings.

**Mock list:** Terminals section with font picker open; Services section with one service failing (amber).

---

## 5. Main area

### 5.1 S6 — Terminal tab

**Tab strip (top of main area):**

- **Tab item (~180–220px):** service glyph · label `researcher · opencode · ds-v3` (role label first, dimmed service·model) · **state chip** (right): 🟢 idle dot / 🟠 busy spinner / 🔵 **needs approval** (pulsing, primary color) / ⚠ **brief updated** (accent, shows on the Read menu too) / ⚡ error (adapter fell back to terminal) · close ✕ on hover.
- Active tab: elevated/underlined; inactive: muted. Overflow: scrollable strip; drag to reorder; right-click: Duplicate tab, Close others, Edit launch settings (reopens S10 in edit mode).
- **+ tab button** at strip end → opens S10.

**Per-tab toolbar (below strip — the control surface):**

| Control | Behavior & visual |
|---------|-------------------|
| **Read ▾** | Secondary button, book/list icon. ⚠ brief-updated state adds an accent ring + count. Opens S11 popover. Never sends on its own. |
| **Write ▾** | Primary-ish button, pencil/download-into icon. Opens S12 popover. Send-on-click (Shift = stage). Disabled with tooltip on **workspace tabs** ("Not attached to a change"). |
| Staged text | Does **not** live in the toolbar (decided) — it lives in the **composer overlay** below. When the overlay is minimized, the toolbar shows a collapsed chip (`✎ 2 staged`). |
| Misc (right) | Fit/clear terminal icon · session id tooltip · token chip (V2). |

**Composer overlay (staged text — decided placement):** a floating, bottom-anchored card over the terminal viewport, present only while staged text exists: inline preview `✎ Read from briefs/bug-login-timeout/: brief-001.md, plan-002.md` · click to edit in place · **⏎ Send** · **✕ clear** · **─ minimize** (collapses to the toolbar chip). Elevated surface + shadow, side margins matching the viewport; it should not permanently hide the TUI's own input row (float just above it where detectable; brief overlap is acceptable — the user is about to send anyway). This is the transparency contract: what will be sent is always visible before it goes. *Toolbar-mounted placement retained as a tagged fallback — §14.*

**Terminal viewport:** xterm.js grid, themed per Settings. States: boot/launch (dim `opencode … launching`), running, exited (overlay: "Process exited (code 0)" + Relaunch + Resume-session buttons), adapter-fallback chip (`⚡ falling back to terminal mode` — V2 annotation, static in mocks).

**Mock list:** (a) three tabs, one busy, one with ⚠ ring; (b) staged composer overlay visible over the terminal, plus its minimized-chip variant; (c) workspace tab with disabled Write; (d) process-exited overlay.

### 5.2 S7 — Doc tab

**Purpose:** read/edit a brief document without leaving the main area.

- **Header:** doc icon · `plan-002` + type chip · dimmed path `briefs/bug-login-timeout/` · **"current of 2 versions"** with prev/next arrows (view old versions inline) · actions: Edit (toggles raw markdown editor), **Diff vs previous** (V2, red/green), **Stage in tab ▾** (dropdown of attached tabs → prefills that tab's composer with a read instruction — mirror of the Read popover), Copy path, ⋯ (open in Files, delete-latest with confirm).
- **Body:** rendered markdown (headings, code, `path:line` refs styled as links into Files panel), comfortable measure (~72ch), same font system as docs elsewhere.
- **Edit mode:** textarea/CodeMirror, Save (git auto-commit runs behind the scenes — note in footer: `saved + committed`), Cancel.
- **Dirty interlock:** if a terminal write-confirmation is pending, show subtle "agent writing…" pulse on the header.

**Mock list:** rendered plan doc with version arrows; edit mode; diff view (V2 sample).

### 5.3 S8 — Tiled view (V2)

- **Desktop only** — mobile stays in focus mode, one terminal at a time (§15).
- Toggle in status bar (or double-click tab): main area splits per active layout's `tile` fields.
- Each **tile:** mini tab header (label + state dot only) + terminal. Drag borders to resize; drag tab between tiles. Focus mode returns on double-click.
- Per-tile toolbar collapses to icon-only (Read/Write remain reachable).
- **Mock list:** triage layout as tiles (researcher | planner / coder), resize handles visible.

---

## 6. Dialogs & popovers

*Open behavior (decided): all popovers open on **click** and close on outside-click/Esc — never hover-open.*

### 6.1 S9 — New Change dialog (primary entry flow)

**Fields (single column, ~520px wide):**

1. **Type** — card radio row: `bug` / `story` / `spike` (+ custom), each with color dot; selecting one updates the template preview and **default-layout** field.
2. **Name** — free text; live slug + folder preview below: `briefs/bug-login-timeout/` (monospace).
3. **Worktree** — toggle (default on) + branch preview `wt-bug-login-timeout`; helper: "Each change gets its own checkout so tabs never collide."
4. **Layout** — select, prefilled from the change type's default; card preview of tabs that will launch (chips + mini tile diagram). Option: "No tabs (add later)".
5. **First tab seed** (collapsible advanced): checkbox "stage `Read brief-001` in each new tab's composer" (default off — reads never auto-send).

**Footer:** [Cancel] **[Create change & launch tabs]** → success toast: `Change created · 3 tabs launching`.

**Mock list:** bug-type selected with triage layout preview; validation state (empty name).

### 6.2 S10 — Add CLI dialog

**Two-step or master-detail:** left = service picker (OpenCode / Codex / Claude Code cards with glyph + auth chip), right = dynamic fields:

| Field | Widget | Notes |
|-------|--------|-------|
| Model | Combobox | Populated where discovery exists (OpenCode `opencode models`, Codex profiles, Claude aliases); always allows free text. |
| Reasoning effort | Segmented/minimal select | OpenCode: variant; Codex: `none…xhigh`; Claude: effort levels. **Hidden if service lacks it.** Show inline coercion note ("gpt-5.4-mini → high max"). |
| Agent / profile | Combobox + free text | Claude `--agent`, OpenCode `--agent`, Codex `--profile`. |
| Permission mode | Select with per-service options + shield icon | Claude: default/acceptEdits/plan/auto/bypass · OpenCode: `--auto` toggle · Codex: approval × sandbox pair. **Warning styling on bypass/yolo options.** |
| Working dir | Text + browse | Defaults to current change worktree. |
| Role label | Text (chip preview) | e.g. `researcher` — cosmetic only (helper text says so). |
| Seed prompt | Textarea | "Stage initial prompt (you still press Enter)" — e.g. `Read briefs/{{change}}/brief-001.md first.` |
| View | Segmented: Terminal (default) / App skin (V2+, may be disabled) | |

**Command preview strip (bottom, always visible):** monospace final argv, e.g. `codex --profile careful -c model_reasoning_effort="high" --cd /home/you/code/…` — updates live. This is a hard requirement (transparency principle).
**Footer:** [Test launch] [Add tab].

**Mock list:** Codex selected with full fields + command preview; Claude selected (different field set — shows dynamic behavior); error state (binary not found).

### 6.3 S11 — Read popover (stage-only)

- Checkbox list of **existing doc types in the current change**, each row: type icon · name · **latest version pill** (`plan (002)`) · unread indicator. Clicking a pill expands versions as sub-checkboxes (☐ 001 ☑ 002) — multi-select across types *and* versions.
- Footer of list: `+ Custom path…` (text row).
- **Live preview box:** the exact staged message that will appear in the composer: `Read from briefs/bug-login-timeout/: brief-001.md, plan-002.md. (latest versions only.)`
- Primary footer action: **[Stage in composer]** (no Send button exists here — principle 2). Hint: "Shift+Enter to stage and focus".

### 6.4 S12 — Write popover (fill & send)

- Single-select list of **all registered types** (next version shown right-aligned: `findings → 001`, `plan → 003`), current change's path prefix shown in header. Custom types colored; built-ins locked icon on template only.
- Below: **template preview** (read-only, monospace, collapsible) of the exact message: *"Create briefs/bug-login-timeout/findings-002.md as a complete self-contained document… If the file exists, stop and don't overwrite."*
- Bottom: `+ New type…` inline row (name + slug → adds to registry per S4).
- Footer: **[Send now]** (primary) · hint `Shift-click to stage only`.

### 6.5 S13 — Approval dialog (V2)

- Triggered by global ⚠ badge / tab 🔵 chip. Centered modal **or** docked card over the owning tile (team's call; docked reads better in tiled mode): service glyph + tab label, **tool name** (`Bash`), content preview (command, or file path, truncated + expandable), buttons: **[Approve once] [Deny] [Always allow…]** (always-allow opens scope choice), plus "Focus terminal" link. Answer routes to the CLI's permission API/hook; on resolve, dialog dismisses and chips update.
- **MVP behavior note (for dev, not mock):** badge click just focuses the terminal — mock the V2 dialog anyway.

### 6.6 S14 — Directory-switch confirmation

- Title: *Change working directory?* · current → new path (monospace arrows) · **consequences checklist (auto-ticked):** "Relaunch 3 tabs in new directory" · "Resume sessions where supported (claude/codex/opencode)" · "Brief attachment unchanged". · Worktree conflicts warning row if new dir is another change's worktree.
- Footer: [Cancel] [Switch & relaunch tabs].

### 6.7 Cross-cutting popovers

- **Change selector (top bar):** search, rows (type chip · name · dots · activity), "Workspace (no change)", footer "+ New change".
- **Global badge popover:** grouped by reason (Approvals / Brief updates / Finished), each row jump-to-tab.

---

## 7. S15 — Change board (V3)

Full-screen main-area view (decided: **full-screen for now**; an embeddable side panel is a tagged future option — §14; replaces terminals via top-bar view switch, terminals keep running):
- **Five columns** = derived status ①…⑤ (`brief → findings → plan → code → review`). Column header: dot + count.
- **Cards:** type chip, name, activity time, tab avatars (service glyphs), unread count. Drag between columns **only changes nothing structurally** — it's observational; manual status override allowed but shown as a small hand icon (honesty over automation).
- Click card → opens that change (selector + briefs panel). Footer: archived changes tray.

---

## 8. S16 — Badge & notification system (cross-cutting)

**Priority (highest first):** 🔵 needs approval → ⚠ brief updated (per tab) → 🟢● finished/idle → informational.

| Level | Where | Visual |
|-------|-------|--------|
| Global | Top-bar cluster | Count pill; amber for approvals, accent for updates. |
| Rail | Briefs icon | Unviewed-docs count (user-level). |
| Tab | Tab chip | State icon per §5.1; pulsing only for approvals (never idle-flashing). |
| Doc | Briefs tree row | Unread dot; "current" pill on latest version. |
| Desktop (opt-in) | OS notification | "Codex·login-timeout needs approval" — off by default. |

Badge clears rules (for prototype hotspots): approval → on resolve; brief-updated → on Read staged *from that tab*; rail unread → on doc opened in Doc tab; finished → on next input.

---

## 9. Status derivation legend (show in mock footer notes)

| # | Dot | Means (derived — never manually maintained) |
|---|-----|-----------------------------------------------|
| ① | brief | change has `brief-001` |
| ② | findings | has `findings-*` |
| ③ | plan | has `plan-*` |
| ④ | code | has `code-*` |
| ⑤ | review | has `review-*` |

Filled = exists, hollow = not yet. **Dots decided for v1; numeric ①–⑤ labels are a tagged future option (§14) — don't mock numbers yet.** Custom types (e.g. `test-round`) can optionally map to an extra ring on the dots — V2, don't mock yet.

---

## 10. Sample content for mocks (use consistently)

**Change:** `bug-login-timeout` (type bug, worktree `wt-bug-login-timeout`, branch same, status ③)
**Folder:**
```
briefs/bug-login-timeout/
  brief-001.md        (current)   findings-001.md   plan-001.md (history)
  plan-002.md         (current, unread)             code-001.md   review-001.md
```

**Tabs:** `researcher · opencode · ds-v3` (busy) · `second-brain · opencode · mimo` (idle) · `planner · claude · sonnet` (⚠ brief updated) · `coder · codex · luna` (needs approval) — matches the four-tab target setup.
**Layouts:** `triage` (3 tiles), `review` (1 read-only tab: codex `--sandbox read-only`), `compare` (2 coder tabs, different models).
**Projects (file tree):** `/home/you/code/demo-app` with realistic subfolders (`src/`, `docs/`, `package.json`, `AGENTS.md`).
**Other active changes:** `story-payment-retry` (②), `spike-queue-lib` (①). **Archived:** `bug-null-avatar` (⑤).
**Doc types:** built-ins + `test-round` (keep 3), `perf` (delta).
**Change types:** bug (default layout *triage*), story (default *feature*), spike.

**Brief doc sample (for S7 render mocks):**
```markdown
# Plan — login timeout (plan-002)

**Base:** wt-bug-login-timeout @ 3f9a1c2 · supersedes plan-001

## Cause
Refresh race in src/auth/session.ts:142 — token swap overlaps an in-flight
request; retry uses the stale token. See findings-001.md.

## Steps
1. Add mutex around refresh (src/auth/session.ts:88)
2. Replay queue for in-flight requests (…:176)
3. Regression test: tests/auth/refresh-race.test.ts

## Risks
- Cookie-based flow untouched — verify SSO path manually.
```

---

## 11. Edge-state checklist (each needs at least one mock hotspot)

- [ ] First run: no changes, no layouts, no tabs (S17 — friendly CTA: "Create your first change")
- [ ] Workspace tab (no brief) — Read/Write disabled with tooltip
- [ ] Tab busy / needs-approval / adapter-failed (⚡ fallback chip) / process-exited overlay
- [ ] Write confirmed (brief file appears, ✓ toast `findings-001 committed`) vs **not saved** (agent claimed done, file unchanged → soft ⚠ "brief not updated" on tab)
- [ ] Layout apply with missing binary → partial launch, amber chip on failed tab, others fine
- [ ] Layout import referencing missing custom types → offer-to-add modal
- [ ] Write race guard: file appeared meanwhile → agent stops; show info row `findings-002 was created by another tab`
- [ ] Very long labels (model names, paths) — truncation rules
- [ ] Version pill with 10+ versions (list must not explode — collapse after 5 with "…")
- [ ] 8+ open tabs (strip overflow), 2+ changes open (selector badges)
- [ ] Staged overlay open while the TUI's own composer is multi-line/growing (Claude, OpenCode) — minimized-to-chip state

---

## 12. Mock priorities

**Wave 1 (blocking development):** S0 shell · **S18 mobile shell** · S2 Briefs · S6 terminal tab + toolbar · S9 New Change · S10 Add CLI · S11/S12 popovers · S1 Files · S4 Setups · S17 empties.
**Wave 2:** S7 Doc tab polish, S3 session browser, S13 approval, S8 tiled, S16 precise badges, mobile sheets for S9/S10 + soft-keyboard overlay state.
**Wave 3:** S15 board, S7 diff view, verification surfaces.

---

## 13. Explicit non-goals (don't design these)

- ❌ Auto-routing / "assign task to agent" controls — the app never decides anything.
- ❌ Chat-bubble transcript skin over terminals (kept as optional stretch: a future "app skin" view via agent protocols — not in this round).
- ❌ Memory/knowledge-graph panels, skill/marketplace UIs, multi-user/auth screens.
- ❌ Manual status fields as the source of truth (status is derived; board drag is observational).
- ❌ Native mobile apps — "mobile compatible" means the responsive web shell in §15: same product, no app-store build.

---

## 14. Decisions log (v0.1 questions — resolved 2026-09-22)

| # | Question | Decision |
|---|----------|----------|
| 1 | Theming | **Dark + light, dark default.** Both token sets required for V1 (S0 mock variant (e); Settings → Appearance toggle). |
| 2 | Popover open behavior | **Click-open** — never hover-open. |
| 3 | Staged text placement | **Overlay on the terminal composer** (S6), with minimize-to-chip. *Tagged in plan:* toolbar-mounted strip as fallback if the overlay proves intrusive. |
| 4 | Board placement | **Full-screen view** for now. *Tagged in plan:* embeddable side-panel variant. |
| 5 | Product name | **Cayrnx** — final working name (replaces *Baton*; "cairn" respelling, registry-verified free on npm/PyPI/crates.io 2026-09-22). Use in mocks. |
| 6 | Status indicators | **Dots** for v1. *Tagged in plan:* numeric ①–⑤ labels for legibility/accessibility. |
| 7 | Mobile | **Required (assumed V1).** Rail → icons across the top; sections open as overlays over the terminal and close back to it (S18/§15). Focus-mode terminals only; dialogs as sheets. |

### Tagged for later (recorded, not mocked now)

- Toolbar-mounted staged strip (alternative placement to the composer overlay).
- Board as a side panel instead of full-screen.
- Numeric ①–⑤ status labels alongside/instead of dots.
- (Carried from earlier rounds) per-tab "app skin" chat view; board-inside-Briefs-panel experiment; diff-since-last-read doc tabs.

---

## 15. S18 — Mobile layout (required for V1)

**Trigger:** viewport ≤ ~768px portrait (team's call) → mobile shell; above → desktop shell. One app, two shells — panel *content* is identical, only the chrome changes.

**Transformations (the core of the requirement):**

| Desktop | Mobile |
|---------|--------|
| Left icon rail (vertical) | **Icon bar across the top**, horizontally scrollable: 📁 📋 🕘 🛠 ⚙ |
| Left panel (docked) | Tapping an icon opens that section **as an overlay covering the terminal area** (full width, from just under the top bar to the status bar), with **✕ close + swipe-down** → terminal is fully visible again exactly as before. The terminal **keeps running underneath** — opening a section never pauses or detaches it. |
| Top bar | Condensed: compact change selector · **+ New change** · badge cluster; Layout / Add CLI move into a **⋮ overflow menu**. |
| Tab strip | Horizontal scroll of compact tabs: service glyph + state dot + truncated role label where it fits. |
| Per-tab toolbar | Read ▾ / Write ▾ as **icon-only buttons** (tap-and-hold for label); minimized staged chip (`✎ 2`). |
| Staged composer overlay | Same bottom-anchored card — must anchor **above the soft keyboard** (visual-viewport handling; implementation note, annotate in mock). |
| Status bar | Condensed, horizontally scrollable chips: cwd · branch · status dots · git count. |
| Dialogs (S9/S10/S14…) | **Bottom sheets** (full-width, draggable) instead of centered modals. |
| Popovers (S11/S12) | Already tap-open by decision (§14.2) — render as bottom sheets; live preview box retained. |
| Tiled view (S8) | **Not available on mobile** — focus mode only, one terminal at a time. |
| Board (S15, V3) | Full-screen columns → horizontal swipe between columns. |

**Touch requirements:** targets ≥44px; every hover-only affordance (tab close ✕, kebab menus, version-pill tooltips) gets a visible tap equivalent; terminal tap-to-focus with native selection menu.

**Mock list (S18):** (a) top icon bar with Briefs section open **as overlay over a running terminal**; (b) overlay dismissed — full terminal view with staged overlay above the keyboard; (c) compact tab strip + icon toolbar, Read popover as bottom sheet; (d) New Change dialog as mobile sheet; (e) overflow menu + condensed status bar.
