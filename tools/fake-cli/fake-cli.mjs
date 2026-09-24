#!/usr/bin/env node
// Scriptable stand-in for claude / codex / opencode (plan §6). It behaves like a small TUI:
// enables bracketed paste, echoes typing, shows a spinner with "esc to interrupt" while working,
// writes the brief file a Write instruction asks for, and can simulate the prototype's demo
// states. Behaviour per submit comes from the JSON control file in $FAKE_CLI_CONTROL:
//   { "mode": "write" | "notsaved" | "exit" | "approval" | "badflags", "delayMs": 900 }
// Every raw input chunk is appended to $FAKE_CLI_LOG (JSON lines) so tests can assert that the
// bytes reaching the PTY equal the staged preview.
//
// V2 plumbing it also exercises:
// - claude: `--settings {"hooks":…}` → runs the hook commands (SessionStart, UserPromptSubmit,
//   PreToolUse, Stop, PermissionRequest) with JSON on stdin, like Claude Code does.
// - codex: `-c notify=[…]` → runs the notify program with a JSON argument after each turn.
// - transcripts in each CLI's store layout, but only under $FAKE_CLI_HOME (never the real home).

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const argv = process.argv.slice(2);
let persona = 'claude';
const pi = argv.indexOf('--persona');
if (pi >= 0) {
  persona = argv[pi + 1];
  argv.splice(pi, 2);
}
const LOG = process.env.FAKE_CLI_LOG;
const CONTROL = process.env.FAKE_CLI_CONTROL;
const FHOME = process.env.FAKE_CLI_HOME;

const out = (s) => process.stdout.write(s);
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const col = { claude: '\x1b[33m', codex: '\x1b[35m', opencode: '\x1b[36m' }[persona] || '';
const acc = (s) => `${col}${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const blue = (s) => `\x1b[34m${s}\x1b[0m`;

function log(kind, data) {
  if (!LOG) return;
  try {
    fs.appendFileSync(LOG, JSON.stringify({ t: Date.now(), persona, pid: process.pid, kind, data }) + '\n');
  } catch {
    /* ignore */
  }
}

function control() {
  try {
    return JSON.parse(fs.readFileSync(CONTROL, 'utf8'));
  } catch {
    return {};
  }
}

const names = { claude: 'Claude Code', codex: 'codex', opencode: 'opencode' };
const flag = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : null;
};

if (argv[0] === '--version' || argv[0] === '-v' || argv[0] === '-V') {
  console.log(`${names[persona]} 0.0.0-fake`);
  process.exit(0);
}
if (argv.join(' ').match(/^(auth (status|list)|login status)$/)) {
  console.log('fake login ✓ (no credentials needed)');
  process.exit(0);
}
if (persona === 'opencode' && argv[0] === 'api' && argv[1] === 'model.list') {
  // Like OpenCode v2's background service: the catalog loads lazily, so the first call is empty.
  const flagFile = FHOME ? path.join(FHOME, 'opencode-models-warm') : null;
  const warm = flagFile ? fs.existsSync(flagFile) : true;
  if (flagFile && !warm) fs.writeFileSync(flagFile, '1');
  const data = warm
    ? [
        { id: 'claude-sonnet-5', providerID: 'opencode', name: 'Claude Sonnet 5', status: 'active', variants: { low: {}, high: {}, max: {} } },
        { id: 'gpt-fake', providerID: 'opencode-go', name: 'GPT Fake', status: 'active', variants: [] },
        { id: 'retired', providerID: 'opencode', name: 'Retired', status: 'deprecated', variants: [] },
      ]
    : [];
  console.log(JSON.stringify({ location: { directory: process.cwd() }, data }));
  process.exit(0);
}
if (argv.join(' ').match(/^(auth login|login)$/)) {
  console.log('Fake login flow — nothing to do. Press Enter to finish.');
  process.stdin.once('data', () => process.exit(0));
  process.stdin.resume();
} else if (control().mode === 'badhooks' && (/"hooks"/.test(argv[argv.indexOf('--settings') + 1] || '') || argv.some((a) => a.startsWith('notify=')))) {
  console.error('Settings validation failed: hooks: unknown event');
  process.exit(1);
} else if (control().mode === 'badflags' && argv.length > 1) {
  // Simulate a CLI version that no longer knows a flag Cayrnx passes (→ ⚡ fallback).
  console.error(`error: unexpected argument '${argv.find((a) => a.startsWith('-')) || argv[0]}' found`);
  process.exit(2);
} else {
  runTui();
}

/* ---------------- hooks ---------------- */

function claudeHooks() {
  const raw = flag('--settings');
  if (!raw) return null;
  try {
    return JSON.parse(raw).hooks || null;
  } catch {
    return null;
  }
}

/** Run a Claude-style hook command with the payload on stdin; resolves with its stdout. */
function runHook(hooks, event, payload) {
  const cmd = hooks?.[event]?.[0]?.hooks?.[0]?.command;
  if (!cmd) return Promise.resolve('');
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-c', cmd], { stdio: ['pipe', 'pipe', 'ignore'] });
    let o = '';
    child.stdout.on('data', (d) => (o += d));
    child.on('exit', () => resolve(o));
    child.on('error', () => resolve(''));
    child.stdin.end(JSON.stringify({ hook_event_name: event, cwd: process.cwd(), ...payload }));
  });
}

function codexNotify(payload) {
  const i = argv.findIndex((a, j) => argv[j - 1] === '-c' && a.startsWith('notify='));
  if (i < 0) return;
  try {
    const prog = JSON.parse(argv[i].slice('notify='.length));
    spawn(prog[0], [...prog.slice(1), JSON.stringify(payload)], { stdio: 'ignore' }).on('error', () => undefined);
  } catch {
    /* bad notify value */
  }
}

/* ---------------- transcripts (only under $FAKE_CLI_HOME) ---------------- */

function transcriptWriter(sessionId, cur) {
  if (!FHOME) return { user() {}, assistant() {} };
  const now = new Date();
  if (persona === 'claude') {
    const dir = path.join(FHOME, '.claude', 'projects', process.cwd().replace(/[^A-Za-z0-9]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${sessionId}.jsonl`);
    const add = (o) => fs.appendFileSync(file, JSON.stringify({ sessionId, cwd: process.cwd(), timestamp: new Date().toISOString(), ...o }) + '\n');
    return {
      user: (text) => add({ type: 'user', message: { role: 'user', content: text } }),
      assistant: (text, tokens) => add({ type: 'assistant', message: { role: 'assistant', model: cur.model || 'claude-sonnet-fake', content: [{ type: 'text', text }], usage: { input_tokens: tokens, output_tokens: Math.round(tokens / 4), cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }, effort: cur.effort || 'medium' }),
    };
  }
  if (persona === 'codex') {
    const dir = path.join(FHOME, '.codex', 'sessions', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'));
    fs.mkdirSync(dir, { recursive: true });
    let file = fs.readdirSync(dir).map((f) => path.join(dir, f)).find((f) => f.endsWith(`${sessionId}.jsonl`));
    let total = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 };
    if (!file) {
      file = path.join(dir, `rollout-${now.toISOString().replace(/[:.]/g, '-')}-${sessionId}.jsonl`);
      fs.writeFileSync(file, JSON.stringify({ timestamp: now.toISOString(), type: 'session_meta', payload: { id: sessionId, cwd: process.cwd(), timestamp: now.toISOString() } }) + '\n');
    } else {
      for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
        try {
          const j = JSON.parse(l);
          if (j.payload?.type === 'token_count') total = { ...total, ...j.payload.info.total_token_usage };
        } catch {
          /* skip */
        }
      }
    }
    const add = (o) => fs.appendFileSync(file, JSON.stringify(o) + '\n');
    return {
      // Like Codex: every turn records the model/effort it runs with.
      user: (text) => {
        add({ timestamp: new Date().toISOString(), type: 'turn_context', payload: { model: cur.model || 'gpt-fake', effort: cur.effort || 'medium' } });
        add({ type: 'event_msg', payload: { type: 'user_message', message: text } });
      },
      assistant: (_text, tokens) => {
        // Like Codex: running totals; input includes cached input, output includes reasoning.
        const cached = Math.round(tokens / 2);
        const out = Math.round(tokens / 4);
        const reasoning = Math.round(out / 2);
        total = {
          input_tokens: total.input_tokens + tokens,
          cached_input_tokens: total.cached_input_tokens + cached,
          output_tokens: total.output_tokens + out,
          reasoning_output_tokens: total.reasoning_output_tokens + reasoning,
          total_tokens: total.total_tokens + tokens + out,
        };
        add({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: total } } });
      },
    };
  }
  // Like OpenCode v2: one SQLite store; the session row appears with the first prompt, and each
  // assistant message carries its model, tokens and cost.
  const dir = path.join(FHOME, '.local', 'share', 'opencode');
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'opencode.db'), { timeout: 5000 });
  db.exec(`CREATE TABLE IF NOT EXISTS session_v2 (id text PRIMARY KEY, project_id text NOT NULL, parent_id text, slug text NOT NULL, directory text NOT NULL, title text, version text NOT NULL, model text, cost real DEFAULT 0 NOT NULL, tokens_input integer DEFAULT 0 NOT NULL, tokens_output integer DEFAULT 0 NOT NULL, tokens_reasoning integer DEFAULT 0 NOT NULL, tokens_cache_read integer DEFAULT 0 NOT NULL, tokens_cache_write integer DEFAULT 0 NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL);
    CREATE TABLE IF NOT EXISTS session_message (id text PRIMARY KEY, session_id text NOT NULL, type text NOT NULL, seq integer NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL);`);
  const modelOf = () => {
    const [providerID, ...rest] = (cur.model || 'opencode/fake-default').split('/');
    return { id: rest.join('/') || providerID, providerID: rest.length ? providerID : 'opencode' };
  };
  let seq = 0;
  const msg = (type, data) => db.prepare('INSERT INTO session_message VALUES (?, ?, ?, ?, ?, ?, ?)').run(`msg_${crypto.randomBytes(6).toString('hex')}`, sessionId, type, ++seq, Date.now(), Date.now(), JSON.stringify(data));
  const exists = () => !!db.prepare('SELECT id FROM session_v2 WHERE id = ?').get(sessionId);
  return {
    user: (text) => {
      if (!exists()) db.prepare('INSERT INTO session_v2 (id, project_id, slug, directory, title, version, model, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(sessionId, 'fake-project', 'fake', process.cwd(), text.slice(0, 60), '2.0.14', JSON.stringify(modelOf()), Date.now(), Date.now());
      msg('user', { text });
    },
    assistant: (_t, tokens) => {
      const t = { input: Math.round(tokens / 3), output: Math.round(tokens / 4), reasoning: Math.round(tokens / 8), cache: { read: tokens * 4, write: 0 } };
      const cost = tokens / 1e6;
      msg('assistant', { agent: 'build', model: { ...modelOf(), variant: cur.effort || 'default' }, finish: 'stop', cost, tokens: t });
      db.prepare('UPDATE session_v2 SET time_updated = ?, cost = cost + ?, tokens_input = tokens_input + ?, tokens_output = tokens_output + ?, tokens_reasoning = tokens_reasoning + ?, tokens_cache_read = tokens_cache_read + ? WHERE id = ?').run(Date.now(), cost, t.input, t.output, t.reasoning, t.cache.read, sessionId);
    },
  };
}

/* ---------------- the TUI ---------------- */

function runTui() {
  log('argv', argv);
  const hooks = persona === 'claude' ? claudeHooks() : null;
  const resumeId = flag('--resume') || (persona === 'opencode' ? flag('-s') : null) || (argv[0] === 'resume' && argv[1] && !argv[1].startsWith('-') ? argv[1] : null);
  const sessionId = flag('--session-id') || resumeId || (persona === 'opencode' ? `ses_${crypto.randomBytes(6).toString('hex')}` : crypto.randomUUID());
  const model = flag('--model') || flag('-m') || (process.env.OPENCODE_CONFIG_CONTENT ? JSON.parse(process.env.OPENCODE_CONFIG_CONTENT).model : null) || 'default';
  const codexEffort = argv.map((a) => a.match(/^model_reasoning_effort="?([^"]*)"?$/)?.[1]).find(Boolean);
  // What the session runs with; `/model <name> [effort]` and `/effort <level>` change it mid-session.
  const cur = { model: model === 'default' ? null : model, effort: flag('--effort') || codexEffort || null };
  const tx = transcriptWriter(sessionId, cur);
  out('\x1b[?2004h'); // bracketed paste on
  out(dim(`${names[persona]} 0.0.0-fake · model ${model}${hooks ? ' · hooks on' : ''}`) + '\r\n');
  out(dim(`cwd: ${process.cwd()}`) + '\r\n');
  out(dim(`argv: ${argv.join(' ').slice(0, 300)}`) + '\r\n\r\n');
  if (hooks) void runHook(hooks, 'SessionStart', { session_id: sessionId, source: resumeId ? 'resume' : 'startup' });
  let buf = '';
  let inPaste = false;
  let busy = false;
  let pendingApproval = null;
  const prompt = () => out('\x1b[2m> \x1b[0m');
  prompt();

  const spin = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  function work(label, ms, done) {
    busy = true;
    let i = 0;
    const iv = setInterval(() => out(`\r\x1b[2K${acc(spin[i++ % spin.length] + ' ' + label + '…')}  ${dim('(esc to interrupt)')}`), 80);
    setTimeout(() => {
      clearInterval(iv);
      out('\r\x1b[2K');
      busy = false;
      done();
      out('\r\n');
      tx.assistant('done', 1200);
      if (hooks) void runHook(hooks, 'Stop', { session_id: sessionId });
      codexNotify({ type: 'agent-turn-complete', 'thread-id': sessionId, 'last-assistant-message': 'done' });
      prompt();
    }, ms);
  }

  // The TUI's own permission prompt, per persona (what the approval keys in the adapters answer).
  const APPROVAL = {
    claude: { lines: ['Bash command', '  pnpm vitest run', 'Do you want to proceed?', '❯ 1. Yes', "  2. Yes, and don't ask again for pnpm vitest commands", '  3. No, and tell Claude what to do differently (esc)'], once: '1', always: '2', deny: ['3', '\x1b'] },
    codex: { lines: ['▲ Allow command?  pnpm vitest run', '  [y] yes   [a] always   [n] no'], once: 'y', always: 'a', deny: ['n', '\x1b'] },
    opencode: { lines: ['△ Permission required: bash pnpm vitest run', '  enter Allow once · a Allow always · esc Reject'], once: '\r', always: 'a', deny: ['\x1b'] },
  }[persona];

  function showTuiApproval() {
    for (const l of APPROVAL.lines) out(blue(l) + '\r\n');
    pendingApproval = true;
  }

  function submit(text) {
    log('submit', text);
    const sw = text.trim().match(/^\/(model|effort)\s+(\S+)(?:\s+(\S+))?$/);
    if (sw) {
      if (sw[1] === 'model') {
        cur.model = sw[2];
        if (sw[3]) cur.effort = sw[3];
      } else cur.effort = sw[2];
      out('\r\n' + dim(`Set model to ${cur.model || 'default'}${cur.effort ? ` · ${cur.effort} effort` : ''}`) + '\r\n');
      prompt();
      return;
    }
    tx.user(text);
    out('\r\n');
    const ctl = control();
    const delay = ctl.delayMs ?? 900;
    // Like an agent: any brief doc the message names that doesn't exist yet is the one to write
    // (the Write wording is a user-editable template).
    const m = [...text.matchAll(/(briefs\/[^ ]+?\/([a-z0-9-]+-\d{3}\.md))/g)].find((x) => !fs.existsSync(path.resolve(process.cwd(), x[1])));
    if (hooks) void runHook(hooks, 'UserPromptSubmit', { session_id: sessionId, prompt: text });
    if (ctl.mode === 'exit') {
      out(dim('bye') + '\r\n');
      process.exit(Number(ctl.code || 0));
    }
    if (ctl.mode === 'approval' && !m) {
      if (hooks) {
        busy = true;
        out(acc('● Bash(pnpm vitest run)') + dim('  — asking via PermissionRequest hook') + '\r\n');
        void runHook(hooks, 'PermissionRequest', { session_id: sessionId, tool_name: 'Bash', tool_input: { command: 'pnpm vitest run', description: 'Run tests' } }).then((o) => {
          busy = false;
          let d = null;
          try {
            d = JSON.parse(o).hookSpecificOutput?.decision;
          } catch {
            /* no decision */
          }
          log('hook-decision', d);
          if (!d) return showTuiApproval();
          if (d.behavior === 'allow') {
            out(green(`✓ Approved via hook${d.updatedPermissions ? ' (always: ' + JSON.stringify(d.updatedPermissions[0].rules[0]) + ')' : ''}`) + '\r\n');
            work('Running tests', delay, () => out(green('  ✓ 3 tests passed')));
          } else {
            out(red('✗ Denied via hook') + '\r\n');
            prompt();
          }
        });
        return;
      }
      showTuiApproval();
      return;
    }
    if (m) {
      const rel = m[1];
      const file = path.resolve(process.cwd(), rel);
      work(`Writing ${m[2]}`, delay, () => {
        if (ctl.mode === 'notsaved') {
          out(`Done — I've written ${m[2]} with the summary.`);
          return;
        }
        if (fs.existsSync(file)) {
          out(acc(`● Write  ${rel}`) + '\r\n' + red('  ✗ File already exists — stopping, not overwriting.'));
          return;
        }
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const type = m[2].replace(/-\d{3}\.md$/, '');
        fs.writeFileSync(file, `# ${type[0].toUpperCase() + type.slice(1)} (${m[2].replace(/\.md$/, '')})\n\n**Base:** written by the fake ${persona} CLI\n\n## Summary\n- Written in answer to: ${text.slice(0, 80)}…\n- See src/auth/session.ts:88\n`);
        out(acc(`● Write  ${rel}`) + '\r\n' + green(`  ✓ ${m[2]} created`));
      });
      return;
    }
    const files = text.match(/[a-z0-9-]+-\d{3}\.md/g) || [];
    work('Thinking', delay, () => {
      for (const f of files) out(acc(`● Read   ${f}`) + '\r\n');
      out(files.length ? `Read ${files.length} doc${files.length > 1 ? 's' : ''}. Working from the latest versions — say when to write.` : 'Done.');
    });
  }

  process.stdin.setRawMode?.(true);
  process.stdin.setEncoding('utf8');
  let ctrlC = 0;
  // Like OpenCode's "system" theme: ask the terminal for its background and palette.
  if (persona === 'opencode' && /"system"/.test(process.env.OPENCODE_CLI_CONFIG_CONTENT || '')) out('\x1b]11;?\x07\x1b]4;1;?\x07');
  process.stdin.on('data', (chunk) => {
    log('input', chunk);
    // Colour replies (OSC 4/10/11) and colour-scheme notifications (DEC 997) aren't typing.
    const osc = chunk.match(/\x1b\](?:4|1[0-2]);[^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[\?997;[12]n/g);
    if (osc) {
      for (const o of osc) log(o.startsWith('\x1b[') ? 'color-scheme' : 'osc-reply', o);
      chunk = chunk.replace(/\x1b\](?:4|1[0-2]);[^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[\?997;[12]n/g, '');
      if (!chunk) return;
    }
    if (pendingApproval) {
      const k = chunk;
      const hit = k === APPROVAL.once ? 'once' : k === APPROVAL.always ? 'always' : APPROVAL.deny.includes(k) ? 'deny' : null;
      if (hit) {
        pendingApproval = null;
        log('approval-key', hit);
        out((hit === 'deny' ? red('✗ Denied') : green(hit === 'always' ? '✓ Approved (always)' : '✓ Approved')) + '\r\n');
        if (hit === 'deny') prompt();
        else work('Running tests', 500, () => out(green('  ✓ 3 tests passed')));
      }
      return;
    }
    let s = chunk;
    while (s.length) {
      if (inPaste) {
        const end = s.indexOf('\x1b[201~');
        const part = end >= 0 ? s.slice(0, end) : s;
        buf += part;
        out(part.replace(/\n/g, '\r\n'));
        s = end >= 0 ? s.slice(end + 6) : '';
        if (end >= 0) inPaste = false;
        continue;
      }
      const start = s.indexOf('\x1b[200~');
      const head = start >= 0 ? s.slice(0, start) : s;
      for (const ch of head) {
        if (ch === '\x03') {
          if (++ctrlC >= 2) {
            out('\r\n');
            process.exit(130);
          }
          out('\r\n' + dim('(press Ctrl-C again to exit)') + '\r\n');
          buf = '';
          prompt();
          continue;
        }
        ctrlC = 0;
        if (ch === '\r') {
          const text = buf;
          buf = '';
          if (busy) continue;
          if (text.trim() === '/exit') {
            out('\r\n');
            process.exit(0);
          }
          if (text.trim()) submit(text);
          else {
            out('\r\n');
            prompt();
          }
        } else if (ch === '\x7f') {
          if (buf.length) {
            buf = buf.slice(0, -1);
            out('\b \b');
          }
        } else if (ch >= ' ' || ch === '\t') {
          buf += ch;
          out(ch);
        }
      }
      if (start >= 0) {
        inPaste = true;
        s = s.slice(start + 6);
      } else s = '';
    }
  });
  process.on('SIGHUP', () => process.exit(129));
}
