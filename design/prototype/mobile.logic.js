
class Component extends DCLogic {
  constructor(...args) {
    super(...args);
    this.timers = [];
    this.state = this.init();
  }
  componentWillUnmount() { this.timers.forEach((t) => clearTimeout(t)); }
  componentDidUpdate(pp) { const a = pp && pp.theme, b = this.props && this.props.theme; if (b && a !== b) this.setState({ theme: b }); }
  later(ms, fn) { this.timers.push(setTimeout(fn, ms)); }
  toast(t) { const id = Math.random(); this.setState({ toast: t, toastId: id }); this.later(2400, () => { if (this.state.toastId === id) this.setState({ toast: null }); }); }
  init() {
    return {
      theme: (this.props && this.props.theme) === 'light' ? 'light' : 'dark',
      section: 'briefs', sheet: null, kb: false, active: 't3', min: false, writeFill: true,
      staged: 'Read from briefs/bug-login-timeout/: plan-002.md. (latest versions only.)',
      stagedTab: 't3', readSel: {}, writeSel: 'findings', expanded: { login: true }, current: 'login',
      nc: { type: 'bug', name: '', worktree: true, layout: 'triage', err: false },
      unread: { 'plan-002': true },
      docs: [['brief', 1], ['findings', 1], ['plan', 1], ['plan', 2]],
      extraChanges: [], fileOpen: { src: true, 'src/auth': true },
      tabs: [
        { id: 't1', role: 'researcher', service: 'opencode', model: 'ds-v3', state: 'busy', lines: [['dim', 'opencode 1.4.2 · ds-v3'], ['user', '> Check whether SSO shares the refresh logic.'], ['acc', '● Grep "refresh(" src/'], ['dim', '  session.ts:142 · sso.ts:57'], ['', 'SSO writes through the same token store —'], ['', 'the mutex covers it.'], ['busy', '⠹ Thinking…']] },
        { id: 't2', role: 'second-brain', service: 'opencode', model: 'mimo', state: 'idle', lines: [['dim', 'opencode 1.4.2 · mimo'], ['acc', '● Write briefs/…/plan-002.md'], ['green', '  ✓ plan-002.md created']] },
        { id: 't3', role: 'planner', service: 'claude', model: 'sonnet', state: 'updated', lines: [['dim', 'Claude Code 2.3.1 · sonnet · plan'], ['', ''], ['user', '> Read from briefs/bug-login-timeout/: brief-001.md, findings-001.md. Draft a plan.'], ['', ''], ['acc', '⏺ Read(…/brief-001.md)'], ['acc', '⏺ Read(…/findings-001.md)'], ['acc', '⏺ Write(…/plan-001.md)'], ['dim', '  ⎿ Wrote 14 lines'], ['', ''], ['', 'Plan written: debounce + test.']] },
        { id: 't4', role: 'coder', service: 'codex', model: 'luna', state: 'approval', lines: [['dim', 'codex 0.52.0 · luna · high'], ['purple', '• Edited src/auth/session.ts (+38 −6)'], ['', ''], ['blue box', '▲ Allow command?\n  pnpm vitest run tests/auth/…']] },
      ],
      docTab: null, toast: null,
    };
  }
  pad(n) { return String(n).padStart(3, '0'); }
  byType() { const m = {}; this.state.docs.forEach(([t, n]) => { (m[t] = m[t] || []).push(n); }); return m; }
  push(id, lines, patch) { this.setState((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? Object.assign({}, t, { lines: t.lines.filter((l) => l[0] !== 'busy').concat(lines) }, patch || {}) : t)) })); }
  send(id, text) {
    if (!text || !text.trim()) return;
    this.setState({ staged: '', kb: false, min: false });
    this.push(id, [['', ''], ['user', '> ' + text], ['busy', '⠋ Working…']], { state: 'busy' });
    this.later(1200, () => this.push(id, [['', 'Read the docs. Ready for the next step.'], ['', '']], { state: 'idle' }));
  }
  renderVals() {
    const s = this.state, P = (n) => this.pad(n);
    const I = {
      files: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
      briefs: 'M9 3.5h6v3H9zM7 5H5.5A1.5 1.5 0 0 0 4 6.5v13A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 18.5 5H17M8 11h8M8 15h5',
      history: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v4h4M12 7.5V12l3 2',
      setups: 'M4 4.5h7v6H4zM13 4.5h7v3h-7zM13 9.5h7v10h-7zM4 12.5h7v7H4z',
      settings: 'M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4',
      down: 'M6 9l6 6 6-6', plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', minus: 'M5 12h14',
      read: 'M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13',
      write: 'M12 3v10M8 9.5l4 4 4-4M5 16v2.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V16',
      pencil: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4', enter: 'M19 5v6a3 3 0 0 1-3 3H6M10 10l-4 4 4 4',
      file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5', term: 'M4 5h16v14H4zM8 10l3 2-3 2M13 15h3',
      tiles: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', archive: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
      branch: 'M6 4v10M6 14a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM18 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 9c0 5-7 3.5-12 7',
      check: 'M5 12.5l4.5 4.5L19 7', kebab: 'M12 5h.01M12 12h.01M12 19h.01', bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
      clear: 'M4 7h16M4 12h10M4 17h6M15 15l5 5M20 15l-5 5',
      sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
      moon: 'M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z',
    };
    const glyph = { opencode: 'OC', codex: 'CX', claude: 'CC' };
    const set = (p) => () => this.setState(p);
    const m = this.byType();
    const F = ['brief', 'findings', 'plan', 'code', 'review'];
    const dots = F.map((t) => ({ cls: m[t] ? 'on' : '' }));
    const statusWord = F.filter((t) => m[t]).slice(-1)[0] || 'brief';
    const at = s.tabs.find((t) => t.id === s.active) || s.tabs[0];
    const docOpen = s.docTab;
    const hasStaged = !!s.staged && s.stagedTab === at.id && !docOpen;

    const secDefs = [['files', 'Files', I.files], ['briefs', 'Briefs', I.briefs], ['history', 'History', I.history], ['setups', 'Setups', I.setups], ['settings', 'Settings', I.settings]];
    const icons = secDefs.map(([id, label, icon]) => ({ label, icon, cls: s.section === id ? 'on' : '', hasBadge: id === 'briefs' && Object.keys(s.unread).length > 0, badge: Object.keys(s.unread).length, pick: () => this.setState({ section: s.section === id ? null : id, sheet: null, kb: false }) }));

    const docRows = Object.keys(m).sort((a, b) => F.indexOf(a) - F.indexOf(b)).map((t) => { const n = m[t][m[t].length - 1]; const k = t + '-' + P(n); return { t, tcls: F.indexOf(t) >= 0 ? t : 'custom', ver: k, unread: !!s.unread[k], cls: s.unread[k] ? 'unread' : '', hasHist: m[t].length > 1, hist: m[t].length - 1, histLabel: '+' + (m[t].length - 1) + ' older',
      open: () => { const u = Object.assign({}, s.unread); delete u[k]; this.setState({ unread: u, docTab: { t, n }, section: null }); } }; });
    const baseCards = [
      { id: 'login', type: 'bug', name: 'login-timeout', activity: 'now', dots },
      { id: 'payment', type: 'story', name: 'payment-retry', activity: '1h', dots: [{ cls: 'on' }, { cls: 'on' }, { cls: '' }, { cls: '' }, { cls: '' }] },
      { id: 'queue', type: 'spike', name: 'queue-lib', activity: '1d', dots: [{ cls: 'on' }, { cls: '' }, { cls: '' }, { cls: '' }, { cls: '' }] },
    ];
    const cards = s.extraChanges.concat(baseCards).map((c) => ({ type: c.type, name: c.name, activity: c.activity, dots: c.dots, open: !!s.expanded[c.id], docs: c.id === 'login' ? docRows : [{ t: 'brief', tcls: 'brief', ver: 'brief-001', unread: false, cls: '', hasHist: false, hist: 0, histLabel: '', open: () => this.toast('Opens brief-001 as a doc tab') }],
      toggle: () => this.setState((st) => ({ expanded: Object.assign({}, st.expanded, { [c.id]: !st.expanded[c.id] }) })),
      selCls: s.current === c.id ? 'on' : '', select: () => { this.setState({ current: c.id, sheet: null }); if (c.id !== 'login') this.toast('Switched to ' + c.type + '-' + c.name + ' (mock keeps login tabs)'); } }));

    const fl = ['src/', 'src/api/', 'src/api/client.ts', 'src/auth/', 'src/auth/session.ts', 'src/auth/sso.ts', 'tests/', 'tests/auth/refresh-race.test.ts', 'briefs/', 'AGENTS.md', 'package.json', 'README.md'];
    const git = { 'src/auth/session.ts': 'M', 'tests/auth/refresh-race.test.ts': 'U' };
    const files = fl.filter((p) => { const parts = p.replace(/\/$/, '').split('/'); return parts.slice(0, -1).every((_, i) => s.fileOpen[parts.slice(0, i + 1).join('/')]); }).map((p) => {
      const isDir = p.endsWith('/'); const c = p.replace(/\/$/, ''); const parts = c.split('/');
      return { name: parts[parts.length - 1], pad: 8 + (parts.length - 1) * 18, icon: isDir ? I.files : I.file, cls: isDir ? 'dim' : (c.endsWith('.ts') ? 'ty-findings' : 'ty-brief'), hasGit: !!git[c], git: git[c] || '',
        click: () => { if (isDir) this.setState((st) => ({ fileOpen: Object.assign({}, st.fileOpen, { [c]: !st.fileOpen[c] }) })); else this.toast('Selected ' + c); } };
    });

    const layouts = [['triage', 3, 'researcher / planner / coder'], ['feature', 2, 'planner / coder'], ['review', 1, 'reviewer (codex read-only)']].map(([name, count, summary]) => ({ name, count, countLabel: count + (count === 1 ? ' tab' : ' tabs'), summary, apply: () => { this.setState({ section: null }); this.toast('Layout ' + name + ' applied · ' + count + ' tabs launching'); } }));

    const tabs = s.tabs.map((t) => ({ glyph: glyph[t.service], gcls: 'g-' + t.service, isTerm: true, isDoc: false, tcls: '', role: t.role, state: t.state, full: t.role + ' · ' + t.service + ' · ' + t.model, cls: t.id === at.id && !docOpen ? 'on' : '',
      pick: () => { if (t.state === 'approval') this.setState({ active: t.id, docTab: null, sheet: 'appr', section: null }); else this.setState({ active: t.id, docTab: null, section: null }); } }));
    if (docOpen) tabs.push({ glyph: '', gcls: '', isTerm: false, isDoc: true, tcls: docOpen.t, role: docOpen.t + '-' + P(docOpen.n), state: 'doc', full: '', cls: 'on', pick: () => {} });

    const readRows = Object.keys(m).sort((a, b) => F.indexOf(a) - F.indexOf(b)).map((t) => { const n = m[t][m[t].length - 1]; const k = t + '-' + P(n); return { t, tcls: t, ver: P(n), unread: !!s.unread[k], on: !!s.readSel[k], cls: s.readSel[k] ? 'on' : '', chk: s.readSel[k] ? 'on' : '', toggle: () => this.setState((st) => ({ readSel: Object.assign({}, st.readSel, { [k]: !st.readSel[k] }) })) }; });
    const sel = Object.keys(s.readSel).filter((k) => s.readSel[k]).map((k) => k + '.md');
    const readPreview = sel.length ? 'Read from briefs/bug-login-timeout/: ' + sel.join(', ') + '. (latest versions only.)' : 'Tick one or more docs…';
    const wTypes = ['brief', 'findings', 'plan', 'code', 'review', 'test-round'];
    const writeRows = wTypes.map((t) => { const n = m[t] ? m[t][m[t].length - 1] + 1 : 1; return { slug: t, tcls: F.indexOf(t) >= 0 ? t : 'custom', next: P(n), on: s.writeSel === t, cls: s.writeSel === t ? 'on' : '', radio: s.writeSel === t ? 'on' : '', pick: set({ writeSel: t }) }; });
    const wn = m[s.writeSel] ? m[s.writeSel][m[s.writeSel].length - 1] + 1 : 1;
    const writePreview = 'Create briefs/bug-login-timeout/' + s.writeSel + '-' + P(wn) + '.md as a complete, self-contained document' + (wn > 1 ? ' (supersedes ' + s.writeSel + '-' + P(wn - 1) + ')' : '') + '. Keep it short; cite path:line. If the file exists, stop and don\'t overwrite.';

    const attnTabs = s.tabs.filter((t) => t.state === 'approval' || t.state === 'updated');
    const attn = attnTabs.map((t) => ({ state: t.state, glyph: glyph[t.service], gcls: 'g-' + t.service, label: t.role + ' · ' + t.model, reason: t.state === 'approval' ? 'wants to run a command' : 'brief updated since last read', pick: () => this.setState({ active: t.id, sheet: t.state === 'approval' ? 'appr' : null, docTab: null, section: null }) }));

    const nc = s.nc; const ncN = nc.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const setNc = (p) => this.setState((st) => ({ nc: Object.assign({}, st.nc, p) }));
    const lsum = { triage: 'researcher · opencode · ds-v3 / planner · claude · sonnet / coder · codex · luna', feature: 'planner · claude · sonnet / coder · codex · luna', review: 'reviewer · codex · luna (read-only)', none: 'No tabs — add later.' };

    let doc = { name: '', ver: '', tcls: '', blocks: [] };
    if (docOpen) {
      const raw = { 'plan-002': '# Plan — login timeout (plan-002)\n**Base:** wt-bug-login-timeout @ 3f9a1c2 · supersedes plan-001\n## Cause\nRefresh race in src/auth/session.ts:142 — token swap overlaps an in-flight request; retry uses the stale token.\n## Steps\n1. Add mutex around refresh (src/auth/session.ts:88)\n2. Replay queue for in-flight requests (…:176)\n3. Regression test: tests/auth/refresh-race.test.ts\n## Risks\n- Cookie-based flow untouched — verify SSO path manually.',
        'brief-001': '# Brief — login timeout (brief-001)\n**Type:** bug · **Branch:** wt-bug-login-timeout\n## Symptom\nLogged out after ~15 min idle even with remember-me.\n## Repro\n1. Log in with remember-me\n2. Idle 15 min, open two views\n3. Second request 401s → redirect',
        'findings-001': '# Findings — login timeout (findings-001)\n**Base:** @ 3f9a1c2 · researcher (opencode · ds-v3)\n## Likely cause\nTwo 401s both call refresh() at src/auth/session.ts:142.\n## Evidence\n- src/api/client.ts:61 retries with the old token\n- No lock around refresh',
        'plan-001': '# Plan — login timeout (plan-001)\n## Steps\n1. Debounce refresh by 500 ms\n2. Regression test' };
      const key = docOpen.t + '-' + P(docOpen.n);
      const src = raw[key] || '# ' + key + '\n**Written by the agent** in this mock.\n## Summary\n- See src/auth/session.ts:88';
      doc = { name: key, tcls: F.indexOf(docOpen.t) >= 0 ? docOpen.t : 'custom', ver: (m[docOpen.t] && m[docOpen.t].length > 1 ? 'current of ' + m[docOpen.t].length : 'current'),
        blocks: src.split('\n').filter((l) => l.trim()).map((l) => { let kind = 'p', text = l, num = ''; if (l.startsWith('# ')) { kind = 'h1'; text = l.slice(2); } else if (l.startsWith('## ')) { kind = 'h2'; text = l.slice(3); } else if (/^\d+\. /.test(l)) { kind = 'ol'; num = l.split('.')[0]; text = l.replace(/^\d+\. /, ''); } else if (l.startsWith('- ')) { kind = 'li'; text = l.slice(2); } else if (l.startsWith('**')) { kind = 'meta'; text = l.replace(/\*\*/g, ''); } return { kind, text, num, isOl: kind === 'ol', isLi: kind === 'li' }; }),
        stage: () => { this.setState({ staged: 'Read from briefs/bug-login-timeout/: ' + key + '.md.', stagedTab: 't3', active: 't3', docTab: null, min: false }); this.toast('Staged in planner — tap Send when ready'); },
        close: set({ docTab: null }) };
    }
    const keys = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].map((r) => ({ k: r.split('').map((c) => ({ c })) }));
    const titles = { files: 'Files', briefs: 'Briefs', history: 'History', setups: 'Setups', settings: 'Settings' };
    const sheetTitles = { read: 'Read into composer', write: 'Write to brief', new: 'New change', overflow: 'More', badge: 'Needs you', change: 'Changes', appr: 'Approval needed' };

    return {
      I, themeCls: s.theme, themeIcon: s.theme === 'dark' ? I.sun : I.moon, themeLabel: s.theme === 'dark' ? 'Light theme' : 'Dark theme',
      cur: { type: 'bug', name: 'login-timeout', dots, status: statusWord },
      icons, sectionHint: s.section ? '' : 'tap a section', tabs,
      atIsTerm: !docOpen, atIsDoc: !!docOpen, atFull: at.role + ' · ' + at.model, lines: at.lines.map((l) => ({ cls: l[0], text: l[1] })),
      showPrompt: ['idle', 'updated'].indexOf(at.state) >= 0, readRing: at.state === 'updated' ? 'ring' : '',
      showComposer: hasStaged && !s.min, termPadCls: hasStaged && !s.min ? (s.kb ? 'withkb' : 'withcomp') : '', showChip: hasStaged && s.min, composerBottom: s.kb ? 272 : 12, staged: s.staged || '', kb: s.kb && hasStaged && !s.min,
      showStatus: !(s.kb && hasStaged && !s.min), keys,
      editStaged: (e) => this.setState({ staged: e.target.value }), kbOn: set({ kb: true }), kbOff: set({ kb: false }),
      send: () => this.send(at.id, s.staged), minimize: set({ min: true, kb: false }), restore: set({ min: false }), clearStaged: set({ staged: '', kb: false }),
      clearTerm: () => this.setState((st) => ({ tabs: st.tabs.map((t) => (t.id === at.id ? Object.assign({}, t, { lines: [['dim', '— cleared —']] }) : t)) })),
      openRead: set({ sheet: 'read', section: null, kb: false }), openWrite: set({ sheet: 'write', section: null, kb: false }),
      openNew: set({ sheet: 'new', section: null, kb: false }), openBadge: set({ sheet: 'badge', kb: false }), openOverflow: set({ sheet: 'overflow', kb: false }), openChangeSheet: set({ sheet: 'change', kb: false }),
      hasSection: !!s.section, sectionTitle: titles[s.section] || '', closeSection: set({ section: null }),
      secBriefs: s.section === 'briefs', secFiles: s.section === 'files', secHistory: s.section === 'history', secSetups: s.section === 'setups', secSettings: s.section === 'settings',
      cards, files, layouts, reopenMock: () => this.toast('Reopened bug-null-avatar'),
      darkCls: s.theme === 'dark' ? 'on' : '', lightCls: s.theme === 'light' ? 'on' : '', setDark: set({ theme: 'dark' }), setLight: set({ theme: 'light' }),
      writeFill: s.writeFill, wFillCls: s.writeFill ? 'on' : '', toggleFill: () => this.setState({ writeFill: !s.writeFill }),
      hasSheet: !!s.sheet, sheetTitle: sheetTitles[s.sheet] || '', closeSheet: set({ sheet: null }),
      shRead: s.sheet === 'read', shWrite: s.sheet === 'write', shNew: s.sheet === 'new', shOverflow: s.sheet === 'overflow', shBadge: s.sheet === 'badge', shChange: s.sheet === 'change', shAppr: s.sheet === 'appr',
      readRows, readPreview, readNone: !sel.length,
      stageRead: () => { this.setState((st) => ({ staged: readPreview, stagedTab: at.id, sheet: null, readSel: {}, min: false, tabs: st.tabs.map((t) => (t.id === at.id && t.state === 'updated' ? Object.assign({}, t, { state: 'idle' }) : t)) })); },
      writeRows, writePreview,
      stageWrite: () => this.setState({ staged: writePreview, stagedTab: at.id, sheet: null, min: false }),
      sendWrite: () => {
        const f = s.writeSel + '-' + P(wn);
        this.setState({ sheet: null });
        this.push(at.id, [['', ''], ['user', '> ' + writePreview], ['busy', '⠋ Writing ' + f + '.md…']], { state: 'busy' });
        this.later(1500, () => {
          this.push(at.id, [['green', '  ✓ ' + f + '.md created'], ['', '']], { state: 'idle' });
          this.setState((st) => ({ docs: st.docs.concat([[s.writeSel, wn]]), unread: Object.assign({}, st.unread, { [f]: true }), tabs: st.tabs.map((t) => (t.id !== at.id && t.state === 'idle' ? Object.assign({}, t, { state: 'updated' }) : t)) }));
          this.toast('✓ ' + f + ' committed');
        });
      },
      ncTypes: [['bug', 'var(--red)', 'triage'], ['story', 'var(--blue)', 'feature'], ['spike', 'var(--purple)', 'none']].map(([id, color, lay]) => ({ id, color, on: nc.type === id, cls: nc.type === id ? 'on' : '', pick: () => setNc({ type: id, layout: lay }) })),
      ncName: nc.name, setNcName: (e) => setNc({ name: e.target.value, err: false }), ncErr: nc.err, ncSlug: nc.type + '-' + (ncN || 'name'),
      ncWt: nc.worktree, ncWtCls: nc.worktree ? 'on' : '', toggleWt: () => setNc({ worktree: !nc.worktree }),
      ncLayouts: ['triage', 'feature', 'review', 'none'].map((l) => ({ name: l, cls: nc.layout === l ? 'on' : '', pick: () => setNc({ layout: l }) })), ncLayoutSummary: lsum[nc.layout],
      createChange: () => { if (!ncN) { setNc({ err: true }); return; } this.setState((st) => ({ sheet: null, extraChanges: [{ id: 'x' + st.extraChanges.length, type: nc.type, name: ncN, activity: 'now', dots: [{ cls: 'on' }, { cls: '' }, { cls: '' }, { cls: '' }, { cls: '' }] }].concat(st.extraChanges), nc: { type: 'bug', name: '', worktree: true, layout: 'triage', err: false }, section: 'briefs' })); this.toast('Change created · tabs launching'); },
      applyTriage: () => { this.setState({ sheet: null }); this.toast('Layout triage applied · 3 tabs launching'); },
      addCli: () => { this.setState({ sheet: null }); this.toast('Add CLI opens as a full-height sheet (same fields as desktop)'); },
      toggleTheme: () => this.setState({ theme: s.theme === 'dark' ? 'light' : 'dark', sheet: null }),
      archiveMock: () => { this.setState({ sheet: null }); this.toast('Archived — tabs keep running'); },
      attn, attnCount: attnTabs.length, hasAttn: attnTabs.length > 0, noAttn: !attnTabs.length,
      approve: () => { this.setState({ sheet: null }); this.push('t4', [['purple', '• Ran pnpm vitest …'], ['busy', '⠋ Running…']], { state: 'busy' }); this.later(1400, () => this.push('t4', [['green', '  ✓ 3 passed'], ['', '']], { state: 'idle' })); this.toast('Approved once'); },
      deny: () => { this.setState({ sheet: null }); this.push('t4', [['red', '✗ Denied by user']], { state: 'idle' }); },
      doc, hasToast: !!s.toast, toast: s.toast || '',
    };
  }
}
