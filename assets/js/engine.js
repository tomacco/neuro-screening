/* engine.js — shared registry + generic test runner.
   Classic script (no ES modules) so it works over file:// and GitHub Pages alike. */
(function (global) {
  'use strict';

  /* ----------------------------- Registry ----------------------------- */
  var REG = {};
  var ORDER = [];
  var NeuroTests = {
    register: function (t) { if (!REG[t.id]) ORDER.push(t.id); REG[t.id] = t; },
    get: function (id) { return REG[id]; },
    all: function () { return ORDER.map(function (id) { return REG[id]; }); }
  };
  global.NeuroTests = NeuroTests;

  /* ------------------------------ Utilities --------------------------- */
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function qs(name) { return new URLSearchParams(location.search).get(name); }
  function todayISO() {
    var d = new Date(); // local date for the "fecha" default only
    var m = ('0' + (d.getMonth() + 1)).slice(-2), day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function genId() { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) { t = el('div', { id: 'toast', class: 'toast' }); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1900);
  }

  // Rough completion-time estimate from item count (~12 s/item, floor 3 min).
  function estMinutes(n) { return Math.max(3, Math.round(n * 0.2)); }
  global.NeuroUtil = { estMinutes: estMinutes };

  /* ---------------------- Region → default variant -------------------- */
  // Auto-pick España vs LatAm from the browser language. "Original" (verbatim)
  // is never auto-selected; it's reachable only via the hidden version picker.
  function defaultVariant() {
    var langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < langs.length; i++) {
      var l = (langs[i] || '').toLowerCase();
      if (l === 'es-es') return 'es';
      if (l.indexOf('ca') === 0 || l.indexOf('gl') === 0 || l.indexOf('eu') === 0) return 'es'; // Spain regional langs
      if (l.indexOf('es-') === 0) return 'latam'; // es-419, es-MX, es-AR, … (es-ES handled above)
    }
    return 'es'; // ambiguous / non-Spanish → España
  }
  global.NeuroI18n = { defaultVariant: defaultVariant };

  /* --------------------------- Variant helper -------------------------- */
  var VARIANTS = [
    { key: 'verbatim', label: 'Original' },
    { key: 'latam', label: 'LatAm' },
    { key: 'es', label: 'España' }
  ];
  function variantLabel(key) {
    for (var i = 0; i < VARIANTS.length; i++) if (VARIANTS[i].key === key) return VARIANTS[i].label;
    return key;
  }
  function resolve(field, v) {
    if (field == null) return '';
    if (typeof field === 'string') return field;
    return field[v] || field.verbatim || field.latam || field.es || '';
  }

  /* ----------------------- Multi-user profiles ------------------------ */
  // Storage:
  //   neuro:users          → { current: <id>, list: [ {id, alias, edad, fecha} ] }
  //   neuro:u:<id>:<testid> → { v, a }   (answers, per user per test)
  var USERS_KEY = 'neuro:users';
  function loadUsers() { try { return JSON.parse(localStorage.getItem(USERS_KEY)) || null; } catch (e) { return null; } }
  function saveUsers(u) { try { localStorage.setItem(USERS_KEY, JSON.stringify(u)); } catch (e) {} }

  // One-time migration from the old single-profile layout.
  function ensureMigrated() {
    if (loadUsers()) return;
    var legacy = {};
    try { legacy = JSON.parse(localStorage.getItem('neuro:profile')) || {}; } catch (e) {}
    var id = genId();
    var user = { id: id, alias: legacy.alias || '', edad: legacy.edad || '', fecha: legacy.fecha || todayISO() };
    // Move legacy per-test answers (neuro:<testid>) under this user.
    var move = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('neuro:') === 0 && k !== USERS_KEY && k !== 'neuro:profile' && k.indexOf('neuro:u:') !== 0) move.push(k);
    }
    move.forEach(function (k) {
      var testid = k.slice('neuro:'.length);
      var val = localStorage.getItem(k);
      try { localStorage.setItem('neuro:u:' + id + ':' + testid, val); localStorage.removeItem(k); } catch (e) {}
    });
    try { localStorage.removeItem('neuro:profile'); } catch (e) {}
    saveUsers({ current: id, list: [user] });
  }

  var NeuroUsers = {
    fields: [
      { key: 'alias', label: 'Alias o iniciales', type: 'text', ph: 'p. ej. A. G.' },
      { key: 'edad', label: 'Edad', type: 'number', ph: 'años' },
      { key: 'fecha', label: 'Fecha', type: 'date' }
    ],
    all: function () { var u = loadUsers(); return u ? u.list : []; },
    currentId: function () { var u = loadUsers(); return u ? u.current : null; },
    current: function () {
      var u = loadUsers(); if (!u) return {};
      var c = u.list.filter(function (x) { return x.id === u.current; })[0];
      return c || u.list[0] || {};
    },
    setCurrent: function (id) { var u = loadUsers(); if (!u) return; u.current = id; saveUsers(u); },
    add: function (profile) {
      var u = loadUsers() || { current: null, list: [] };
      var nu = Object.assign({ alias: '', edad: '', fecha: todayISO() }, profile || {});
      nu.id = genId();
      u.list.push(nu); u.current = nu.id; saveUsers(u);
      return nu.id;
    },
    update: function (id, patch) {
      var u = loadUsers(); if (!u) return;
      u.list.forEach(function (x) { if (x.id === id) Object.assign(x, patch); });
      saveUsers(u);
    },
    remove: function (id) {
      var u = loadUsers(); if (!u) return;
      u.list = u.list.filter(function (x) { return x.id !== id; });
      var pref = 'neuro:u:' + id + ':', del = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(pref) === 0) del.push(k); }
      del.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
      if (u.current === id) u.current = u.list.length ? u.list[0].id : null;
      saveUsers(u);
      if (!u.list.length) NeuroUsers.add({}); // never leave zero users
    },
    // Raw stored answer-state for a given user+test (no engine instance needed).
    testState: function (uid, testId) {
      try {
        var s = JSON.parse(localStorage.getItem('neuro:u:' + uid + ':' + testId));
        if (s && s.a) return { v: s.v || defaultVariant(), a: numericKeys(s.a) };
      } catch (e) {}
      return { v: defaultVariant(), a: {} };
    }
  };
  global.NeuroUsers = NeuroUsers;

  function normalize(s) {
    s = s || {};
    return { v: s.v || defaultVariant(), a: numericKeys(s.a || {}) };
  }
  function numericKeys(a) {
    var out = {};
    Object.keys(a || {}).forEach(function (k) { var val = a[k]; if (val !== '' && val != null) out[k] = +val; });
    return out;
  }

  /* ------------------------------- Engine ----------------------------- */
  function Runner(test, root) {
    this.test = test;
    this.root = root;
    this.storeKey = 'neuro:u:' + NeuroUsers.currentId() + ':' + test.id;
    this.state = { v: defaultVariant(), a: {} };
    this._meta = null;        // populated only when viewing a shared link
    this.metaShared = false;
    this.showInterp = false;
    this.showVersionPicker = false;
    this._vClicks = 0;
  }

  Runner.prototype.load = function () {
    // 1) shared link (?d=) wins; 2) else localStorage
    var enc = qs('d');
    if (enc && global.NeuroShare) {
      var s = global.NeuroShare.decode(enc);
      if (s) { this.state = normalize(s); this._meta = s.m || s.meta || {}; this.metaShared = true; this.fromShared = true; return; }
    }
    try {
      var raw = localStorage.getItem(this.storeKey);
      if (raw) this.state = normalize(JSON.parse(raw));
    } catch (e) {}
  };

  // Effective profile: the shared snapshot for a shared link, else the current user.
  Runner.prototype.getMeta = function () {
    return this.metaShared ? (this._meta || {}) : NeuroUsers.current();
  };

  Runner.prototype.save = function () {
    if (this.fromShared) return; // don't clobber local store from a shared view unless edited
    try { localStorage.setItem(this.storeKey, JSON.stringify(this.state)); } catch (e) {}
  };

  Runner.prototype.answeredCount = function () { return Object.keys(this.state.a).length; };

  Runner.prototype.render = function () {
    var self = this, t = this.test, v = this.state.v;
    this.root.innerHTML = '';

    /* Header + chips (estimated time, live progress) */
    var est = estMinutes(t.items.length);
    var clock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    var deco = el('span', { class: 'blot-deco no-print', 'aria-hidden': 'true' });
    if (global.NeuroBlot) deco.innerHTML = global.NeuroBlot.svg(this.blotVariant || 0);
    this.root.appendChild(el('div', { class: 'test-head' }, [
      deco,
      el('div', { class: 'kicker', text: (t.code || t.id).toUpperCase() }),
      el('h1', { text: resolve(t.title, v) }),
      el('p', { class: 'sub', text: t.subtitle || '' }),
      el('div', { class: 'chips no-print' }, [
        el('span', { class: 'chip', html: clock + '<span>≈ ' + est + ' min</span>' }),
        el('span', { class: 'chip chip-prog', id: 'chip-prog' })
      ])
    ]));

    /* Version control: a plain badge by default; the full picker (incl. Original)
       is revealed only after 5 clicks on the badge. */
    this.root.appendChild(this.renderVersionControl());

    /* Profile bar — read-only here; entered on the landing page (prints in the PDF) */
    var meta = this.getMeta();
    function pf(k, label) {
      return el('div', { class: 'pf' }, [
        el('span', { class: 'pf-k', text: label }),
        el('span', { class: 'pf-v', text: (meta[k] != null && meta[k] !== '') ? String(meta[k]) : '—' })
      ]);
    }
    this.root.appendChild(el('div', { class: 'profile-bar' }, [
      pf('alias', 'Alias'),
      pf('edad', 'Edad'),
      el('div', { class: 'pf' }, [
        el('span', { class: 'pf-k', text: 'Fecha' }),
        el('span', { class: 'pf-v', text: meta.fecha || todayISO() })
      ]),
      this.metaShared ? el('span', { class: 'pf-note no-print', text: 'datos del enlace compartido' }) : null
    ]));

    /* Instructions */
    var instr = resolve(t.instructions, v);
    if (instr) this.root.appendChild(el('div', { class: 'instructions', html: instr }));

    /* Progress */
    var prog = el('div', { class: 'progress-wrap no-print' }, [
      el('div', { class: 'progress' }, [el('i', { id: 'progbar' })]),
      el('div', { class: 'progress-label', id: 'proglabel' })
    ]);
    this.root.appendChild(prog);

    /* Items */
    var scaleClass = (t.scale.layout === 'h') ? 'scale-h' : '';
    var form = el('div', { class: scaleClass });
    var lastSection = null;
    t.items.forEach(function (it) {
      if (it.section && it.section !== lastSection) {
        lastSection = it.section;
        var sec = (t.sections || []).filter(function (s) { return s.key === it.section; })[0];
        form.appendChild(el('div', { class: 'section-title', text: sec ? resolve(sec.title, v) : it.section }));
      }
      form.appendChild(self.renderItem(it));
    });
    this.root.appendChild(form);

    /* Actions */
    this.root.appendChild(el('div', { class: 'actions no-print' }, [
      el('button', { class: 'btn primary', text: 'Exportar a PDF', onclick: function () { window.print(); } }),
      el('button', { class: 'btn', text: 'Compartir enlace', onclick: function () { self.share(); } }),
      t.score ? el('button', { class: 'btn accent', id: 'btn-interp', text: 'Ver interpretación',
        onclick: function () { self.toggleInterp(); } }) : null,
      el('button', { class: 'btn ghost', text: 'Reiniciar', onclick: function () { self.reset(); } })
    ]));

    /* Results (scores always; interpretation toggled) */
    this.root.appendChild(el('div', { class: 'results', id: 'results' }));

    this.refreshProgress();
    this.refreshResults();
  };

  Runner.prototype.renderVersionControl = function () {
    var self = this, v = this.state.v;
    if (!this.showVersionPicker) {
      var badge = el('div', { class: 'version-badge no-print', title: 'Versión del idioma',
        onclick: function () { if (++self._vClicks >= 5) { self.showVersionPicker = true; self.render(); } } }, [
        document.createTextNode('Versión: '), el('b', { text: variantLabel(v) })
      ]);
      return el('div', { class: 'controls no-print' }, [badge]);
    }
    var seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Versión del idioma' },
      VARIANTS.map(function (vr) {
        return el('button', {
          type: 'button', 'aria-pressed': String(v === vr.key), text: vr.label,
          onclick: function () { self.state.v = vr.key; self.save(); self.render(); }
        });
      }));
    var langNote = el('span', { class: 'no-print', style: 'font-size:13px;color:var(--ink-soft)',
      text: v === 'verbatim' ? 'Texto original tal como se publicó.' :
            v === 'es' ? 'Español de España.' : 'Español neutro (Latinoamérica).' });
    return el('div', { class: 'controls no-print' }, [
      el('div', { class: 'group' }, [el('label', { text: 'Versión' }), seg]),
      langNote
    ]);
  };

  Runner.prototype.renderItem = function (it) {
    var self = this, t = this.test, v = this.state.v;
    var answered = this.state.a[it.n] != null;
    var wrap = el('div', { class: 'item' + (answered ? '' : ' unanswered'), id: 'item-' + it.n });
    wrap.appendChild(el('div', { class: 'q' }, [
      el('span', { class: 'n', text: it.n + '.' }),
      el('span', { class: 't', html: resolve(it.text, v) })
    ]));
    var opts = el('div', { class: 'options' });
    t.scale.options.forEach(function (o) {
      var checked = self.state.a[it.n] === o.value;
      var id = 'i' + it.n + '_' + o.value;
      var lab = el('label', { class: 'opt' + (checked ? ' checked' : ''), for: id }, [
        el('input', {
          type: 'radio', name: 'item-' + it.n, id: id, value: o.value, checked: checked ? 'checked' : null,
          onchange: function () { self.setAnswer(it.n, o.value); }
        }),
        el('span', { class: 'lbl', text: resolve(o.label, v) }),
        (t.scale.showValues ? el('span', { class: 'val', text: o.value }) : null)
      ]);
      opts.appendChild(lab);
    });
    wrap.appendChild(opts);
    return wrap;
  };

  Runner.prototype.setAnswer = function (n, val) {
    this.state.a[n] = val;
    var item = document.getElementById('item-' + n);
    if (item) {
      item.classList.remove('unanswered');
      Array.prototype.forEach.call(item.querySelectorAll('.opt'), function (o) {
        var inp = o.querySelector('input');
        o.classList.toggle('checked', inp.checked);
      });
    }
    this.touch();
  };

  Runner.prototype.touch = function () {
    this.fromShared = false; // editing a shared view makes it the new local draft
    this.save();
    this.refreshProgress();
    this.refreshResults();
  };

  Runner.prototype.refreshProgress = function () {
    var total = this.test.items.length, done = this.answeredCount();
    var bar = document.getElementById('progbar'), lab = document.getElementById('proglabel');
    if (bar) bar.style.width = (total ? (done / total * 100) : 0) + '%';
    if (lab) lab.textContent = done + ' de ' + total + ' respondidas' + (done === total ? ' — completo' : '');
    var chip = document.getElementById('chip-prog');
    if (chip) {
      var complete = done === total;
      chip.classList.toggle('done', complete);
      chip.textContent = complete ? ('Completo · ' + total + '/' + total) : (done + '/' + total + ' · faltan ' + (total - done));
    }
  };

  Runner.prototype.refreshResults = function () {
    var t = this.test, host = document.getElementById('results');
    if (!host || !t.score) { if (host) host.innerHTML = ''; return; }
    host.innerHTML = '';
    var res;
    try { res = t.score(this.state.a, { variant: this.state.v, meta: this.getMeta() }); }
    catch (e) { res = null; }
    if (!res) return;

    if (res.scores && res.scores.length) {
      host.appendChild(scoreBox(res));
    }

    /* Interpretation — hidden until toggle, never printed */
    if (this.showInterp && res.interpretation) {
      var ip = el('div', { class: 'interpretation no-print' }, [el('h3', { text: 'Interpretación' })]);
      (res.interpretation.bands || []).forEach(function (b) {
        ip.appendChild(el('div', { style: 'margin:8px 0' }, [
          el('div', null, [el('span', { class: 'band', text: (b.name ? b.name + ': ' : '') }), el('span', { class: 'band', text: b.band })]),
          b.text ? el('div', { style: 'font-size:14.5px;color:var(--ink-soft)', text: b.text }) : null
        ]));
      });
      ip.appendChild(el('div', { class: 'note', html: res.interpretation.note ||
        'Esto no es un diagnóstico. Solo un profesional cualificado puede interpretar estos resultados.' }));
      host.appendChild(ip);
    }
  };

  // Numeric score card — shared by the live runner and the print-all builder.
  function scoreBox(res) {
    var box = el('div', { class: 'scorebox' }, [el('h2', { text: 'Puntuación' })]);
    (res.scores || []).forEach(function (s) {
      box.appendChild(el('div', { class: 'score-row' }, [
        el('span', { class: 'name', text: s.name }),
        el('span', { class: 'num' }, [
          document.createTextNode(String(s.value)),
          s.max != null ? el('small', { text: ' / ' + s.max }) : null
        ])
      ]));
    });
    if (res.incompleteNote) box.appendChild(el('div', { class: 'progress-label', text: res.incompleteNote }));
    return box;
  }

  Runner.prototype.toggleInterp = function () {
    this.showInterp = !this.showInterp;
    var b = document.getElementById('btn-interp');
    if (b) b.textContent = this.showInterp ? 'Ocultar interpretación' : 'Ver interpretación';
    this.refreshResults();
    if (this.showInterp) { var r = document.getElementById('results'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'end' }); }
  };

  Runner.prototype.share = function () {
    var meta = this.getMeta();
    sealAndCopy({ v: 1, meta: meta, tests: [bundleTest(this.test, this.state, meta)] });
  };

  Runner.prototype.reset = function () {
    if (!confirm('¿Borrar todas las respuestas de este test para este usuario?')) return;
    this.state = { v: this.state.v, a: {} };
    this.fromShared = false;
    try { localStorage.removeItem(this.storeKey); } catch (e) {}
    this.render();
    toast('Test reiniciado');
  };

  /* ---------------- Static render (print-all on landing) -------------- */
  // Builds the same document structure the print CSS targets, with only the
  // chosen option per item — no interactivity.
  function renderStaticTest(t, state, meta) {
    var v = state.v || defaultVariant();
    var wrap = el('div', { class: 'print-test' });
    wrap.appendChild(el('div', { class: 'test-head' }, [
      el('div', { class: 'kicker', text: (t.code || t.id).toUpperCase() }),
      el('h1', { text: resolve(t.title, v) }),
      el('p', { class: 'sub', text: t.subtitle || '' })
    ]));
    function pf(label, val) {
      return el('div', { class: 'pf' }, [
        el('span', { class: 'pf-k', text: label }),
        el('span', { class: 'pf-v', text: (val != null && val !== '') ? String(val) : '—' })
      ]);
    }
    wrap.appendChild(el('div', { class: 'profile-bar' }, [
      pf('Alias', meta.alias), pf('Edad', meta.edad), pf('Fecha', meta.fecha || todayISO())
    ]));
    var instr = resolve(t.instructions, v);
    if (instr) wrap.appendChild(el('div', { class: 'instructions', html: instr }));

    var lastSection = null;
    t.items.forEach(function (it) {
      if (it.section && it.section !== lastSection) {
        lastSection = it.section;
        var sec = (t.sections || []).filter(function (s) { return s.key === it.section; })[0];
        wrap.appendChild(el('div', { class: 'section-title', text: sec ? resolve(sec.title, v) : it.section }));
      }
      var ans = state.a[it.n];
      var opt = t.scale.options.filter(function (o) { return o.value === ans; })[0];
      var optionsEl = el('div', { class: 'options' }, opt ? [
        el('label', { class: 'opt checked' }, [
          el('span', { class: 'lbl', text: resolve(opt.label, v) }),
          (t.scale.showValues ? el('span', { class: 'val', text: opt.value }) : null)
        ])
      ] : []);
      wrap.appendChild(el('div', { class: 'item' + (opt ? '' : ' unanswered') }, [
        el('div', { class: 'q' }, [el('span', { class: 'n', text: it.n + '.' }), el('span', { class: 't', html: resolve(it.text, v) })]),
        optionsEl
      ]));
    });

    if (t.score) {
      var res; try { res = t.score(state.a, { variant: v, meta: meta }); } catch (e) { res = null; }
      if (res && res.scores && res.scores.length) wrap.appendChild(scoreBox(res));
    }
    return wrap;
  }

  /* ------------- Combined "all results" share codec ------------------- */
  // Payload shape (version-tagged so we can evolve it safely):
  //   [ FMT, [alias, edad, fecha], [ [testId, variantIdx, "digits"], … ] ]
  // FMT is the first element — the parser switches on it. Adding/removing
  // tests needs NO bump (entries are keyed by testId; unknown ids are skipped).
  // Bump COMBINED_FMT only if the ENCODING itself changes.
  // "digits": one char per item (in items order); a value char '0'–'9', or
  // '.' for unanswered — '.' (not '0') because some scales use value 0 (ASRS).
  var COMBINED_FMT = 1;
  var VIDX = { verbatim: 0, latam: 1, es: 2 };
  var VARR = ['verbatim', 'latam', 'es'];

  function buildAllModel() {
    var meta = NeuroUsers.current(), uid = NeuroUsers.currentId();
    var entries = [];
    NeuroTests.all().forEach(function (t) {
      var st = NeuroUsers.testState(uid, t.id);
      if (!Object.keys(st.a).length) return; // skip tests with no answers
      var digits = '';
      t.items.forEach(function (it) {
        var v = st.a[it.n];
        digits += (v != null) ? String(v) : '.';
      });
      var vi = VIDX[st.v]; if (vi == null) vi = 1;
      entries.push([t.id, vi, digits]);
    });
    return [COMBINED_FMT, [meta.alias || '', meta.edad || '', meta.fecha || ''], entries];
  }

  // Parse a decoded combined model into { meta, tests:[{test,state}] }.
  // Returns { error } when the format version is unrecognised.
  function parseAllModel(model) {
    if (!Array.isArray(model) || typeof model[0] !== 'number') return { error: 'malformed' };
    if (model[0] !== COMBINED_FMT) return { error: 'version', version: model[0] };
    var m = model[1] || [];
    var meta = { alias: m[0] || '', edad: m[1] || '', fecha: m[2] || '' };
    var tests = [];
    (model[2] || []).forEach(function (entry) {
      var t = NeuroTests.get(entry[0]); if (!t) return; // unknown/removed test → skip
      var digits = String(entry[2] || ''), a = {};
      t.items.forEach(function (it, i) {
        var c = digits.charAt(i);
        if (c !== '' && c !== '.') a[it.n] = +c;
      });
      tests.push({ test: t, state: { v: VARR[entry[1]] || defaultVariant(), a: a } });
    });
    return { meta: meta, tests: tests };
  }

  /* --------- Self-contained share bundle (fully-rendered, no modules) -------- */
  // A shared link must render on resultados.html WITHOUT the (gated) test modules
  // and WITHOUT an access key. So the bundle carries the already-resolved strings
  // for the chosen variant only — question text, the picked option, scores.
  //   bundle = { v, meta, tests:[ { code, title, sub, instr, showValues,
  //                                 sections:[{key,title}], items:[{n,sec,t,a,av}],
  //                                 scores:[{name,value,max}] } ] }
  function bundleTest(t, state, meta) {
    var v = state.v || defaultVariant();
    var items = t.items.map(function (it) {
      var opt = t.scale.options.filter(function (o) { return o.value === state.a[it.n]; })[0];
      return { n: it.n, sec: it.section || null, t: resolve(it.text, v), a: opt ? resolve(opt.label, v) : null, av: opt ? opt.value : null };
    });
    var scores = null;
    if (t.score) {
      try {
        var r = t.score(state.a, { variant: v, meta: meta });
        if (r && r.scores) scores = r.scores.map(function (s) { return { name: s.name, value: s.value, max: (s.max != null ? s.max : null) }; });
      } catch (e) {}
    }
    return {
      code: (t.code || t.id).toUpperCase(), title: resolve(t.title, v), sub: t.subtitle || '',
      instr: resolve(t.instructions, v), showValues: !!t.scale.showValues,
      sections: (t.sections || []).map(function (s) { return { key: s.key, title: resolve(s.title, v) }; }),
      items: items, scores: scores
    };
  }

  // Render one bundle test into the same print-friendly DOM renderStaticTest emits.
  function renderBundleTest(bt, meta) {
    var wrap = el('div', { class: 'print-test' });
    wrap.appendChild(el('div', { class: 'test-head' }, [
      el('div', { class: 'kicker', text: bt.code }),
      el('h1', { text: bt.title }),
      el('p', { class: 'sub', text: bt.sub || '' })
    ]));
    function pf(label, val) {
      return el('div', { class: 'pf' }, [
        el('span', { class: 'pf-k', text: label }),
        el('span', { class: 'pf-v', text: (val != null && val !== '') ? String(val) : '—' })
      ]);
    }
    wrap.appendChild(el('div', { class: 'profile-bar' }, [
      pf('Alias', meta.alias), pf('Edad', meta.edad), pf('Fecha', meta.fecha || '')
    ]));
    if (bt.instr) wrap.appendChild(el('div', { class: 'instructions', html: bt.instr }));
    var secMap = {}; (bt.sections || []).forEach(function (s) { secMap[s.key] = s.title; });
    var last = null;
    bt.items.forEach(function (it) {
      if (it.sec && it.sec !== last) { last = it.sec; wrap.appendChild(el('div', { class: 'section-title', text: secMap[it.sec] || it.sec })); }
      var opts = el('div', { class: 'options' }, it.a != null ? [
        el('label', { class: 'opt checked' }, [
          el('span', { class: 'lbl', text: it.a }),
          (bt.showValues ? el('span', { class: 'val', text: it.av }) : null)
        ])
      ] : []);
      wrap.appendChild(el('div', { class: 'item' + (it.a != null ? '' : ' unanswered') }, [
        el('div', { class: 'q' }, [el('span', { class: 'n', text: it.n + '.' }), el('span', { class: 't', html: it.t })]),
        opts
      ]));
    });
    if (bt.scores && bt.scores.length) wrap.appendChild(scoreBox({ scores: bt.scores }));
    return wrap;
  }

  // Seal a bundle and copy the resultados.html link (ciphertext in ?s=, key in #k=).
  function sealAndCopy(bundle) {
    global.NeuroCrypto.sealBundle(bundle).then(function (res) {
      var dir = location.pathname.replace(/[^/]*$/, '');
      var url = location.origin + dir + 'resultados.html?s=' + res.s + '#k=' + res.k;
      var done = function () { toast('Enlace de resultados copiado (' + url.length + ' caracteres)'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { prompt('Copia el enlace:', url); });
      } else { prompt('Copia el enlace:', url); }
    });
  }

  /* ----------------------------- Bootstrap ---------------------------- */
  global.NeuroEngine = {
    start: function (rootId) {
      var root = document.getElementById(rootId || 'app');
      var id = qs('t');
      var test = id && NeuroTests.get(id);
      if (!test) {
        root.innerHTML = '<div class="disclaimer">No se encontró el test solicitado. ' +
          '<a href="index.html">Volver al inicio</a>.</div>';
        return;
      }
      document.title = resolve(test.title, 'latam') + ' — Neuro-Screening';
      if (test.color) document.documentElement.style.setProperty('--ink-accent', test.color);
      var r = new Runner(test, root);
      var idx = NeuroTests.all().map(function (x) { return x.id; }).indexOf(test.id);
      r.blotVariant = idx < 0 ? 0 : idx;
      r.load();
      r.render();
      global.__runner = r;
    },

    // Combined PDF of every completed test for the current user.
    // Incomplete tests are skipped; the user is warned which ones.
    printAllCompleted: function () {
      var meta = NeuroUsers.current(), uid = NeuroUsers.currentId();
      var completed = [], incomplete = [];
      NeuroTests.all().forEach(function (t) {
        var state = NeuroUsers.testState(uid, t.id);
        var done = Object.keys(state.a).length, total = t.items.length;
        if (total > 0 && done === total) completed.push({ t: t, state: state });
        else incomplete.push({ t: t, done: done, total: total });
      });
      if (!completed.length) {
        alert('No hay tests completados para «' + (meta.alias || 'este usuario') + '».');
        return;
      }
      if (incomplete.length) {
        var names = incomplete.map(function (x) {
          return '•  ' + resolve(x.t.title, defaultVariant()) + '  (' + x.done + '/' + x.total + ')';
        }).join('\n');
        if (!confirm('Estos tests no están completos y NO se incluirán:\n\n' + names +
          '\n\n¿Exportar los ' + completed.length + ' test(s) completado(s)?')) return;
      }
      var host = document.getElementById('print-all');
      if (!host) { host = el('div', { id: 'print-all' }); document.body.appendChild(host); }
      host.innerHTML = '';
      completed.forEach(function (c) { host.appendChild(renderStaticTest(c.t, c.state, meta)); });

      var cleanup = function () { document.body.classList.remove('printing-all'); window.removeEventListener('afterprint', cleanup); };
      window.addEventListener('afterprint', cleanup);
      document.body.classList.add('printing-all');
      window.print();
      setTimeout(cleanup, 1500); // fallback for browsers without afterprint
    },

    // Build a single compressed URL holding every answered test for the current
    // user, pointing at the read-only viewer (resultados.html).
    shareAllLink: function () {
      var meta = NeuroUsers.current(), uid = NeuroUsers.currentId();
      var tests = [];
      NeuroTests.all().forEach(function (t) {
        var st = NeuroUsers.testState(uid, t.id);
        if (Object.keys(st.a).length) tests.push(bundleTest(t, st, meta));
      });
      if (!tests.length) { alert('No hay respuestas que compartir para este usuario.'); return; }
      sealAndCopy({ v: 1, meta: meta, tests: tests });
    },

    // Render a self-contained share bundle into a read-only results page.
    // Needs neither the test modules nor an access key. Never touches localStorage.
    renderSharedBundle: function (bundle, rootId) {
      var root = document.getElementById(rootId);
      if (!bundle || !bundle.tests || !bundle.tests.length) {
        root.innerHTML = '<div class="disclaimer">No se pudieron leer los resultados de este enlace.</div>';
        return false;
      }
      root.innerHTML = '';
      var meta = bundle.meta || {};
      var doc = el('div', { class: 'results-doc' });
      bundle.tests.forEach(function (bt) { doc.appendChild(renderBundleTest(bt, meta)); });
      root.appendChild(doc);
      return { meta: meta, count: bundle.tests.length };
    },

    // Render a decoded combined model into a read-only results page.
    // Never touches localStorage. Returns true on success.
    renderShared: function (model, rootId) {
      var root = document.getElementById(rootId);
      var parsed = parseAllModel(model);
      if (parsed.error === 'version') {
        root.innerHTML = '<div class="disclaimer">Este enlace se creó con una versión más reciente de la aplicación (formato v' +
          parsed.version + '). Actualiza la página o pide un enlace nuevo.</div>';
        return false;
      }
      if (parsed.error || !parsed.tests.length) {
        root.innerHTML = '<div class="disclaimer">No se pudieron leer los resultados de este enlace.</div>';
        return false;
      }
      root.innerHTML = '';
      var doc = el('div', { class: 'results-doc' });
      parsed.tests.forEach(function (c) { doc.appendChild(renderStaticTest(c.test, c.state, parsed.meta)); });
      root.appendChild(doc);
      return { meta: parsed.meta, count: parsed.tests.length };
    }
  };

  ensureMigrated();
})(window);
