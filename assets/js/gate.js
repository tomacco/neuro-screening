/* gate.js — per-user access gate for the whole app.
   Every test module ships encrypted (assets/enc/*.enc) under one content key (CEK).
   A valid passphrase unwraps the CEK (grants.json holds only CEK ciphertext, wrapped
   once per user), which then decrypts each module at runtime. Nothing committed to the
   public repo is secret: without a passphrase, grants.json and the .enc blobs are opaque.
   Threat model: keep the public out + defensible copyright posture — NOT bank-grade. */
(function (global) {
  'use strict';
  var C = global.NeuroCrypto;
  var CEK_KEY = 'neuro:cek';        // cached raw CEK (base64url) after first unlock
  var ENC_DIR = 'assets/enc/';
  var _grants = null;

  function fetchJSON(url) { return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }); }
  function fetchText(url) { return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.text(); }); }
  function grants() { return _grants ? Promise.resolve(_grants) : fetchJSON(ENC_DIR + 'grants.json').then(function (g) { _grants = g; return g; }); }

  // Try the passphrase against every wrap; the first that decrypts yields the CEK.
  async function unwrapCEK(passphrase) {
    var g = await grants();
    var key = await C.deriveKey(passphrase, C.b64uDec(g.kdf.saltB64), g.kdf.iters);
    for (var i = 0; i < g.wraps.length; i++) {
      try { return await C.aesDec(key, C.b64uDec(g.wraps[i].ctB64)); } catch (e) { /* wrong wrap */ }
    }
    return null;
  }

  async function loadModules(cekBytes) {
    var cek = await C.importAes(cekBytes);
    var man = await fetchJSON(ENC_DIR + 'manifest.json');
    for (var i = 0; i < man.files.length; i++) {
      var id = man.files[i];
      var b64 = (await fetchText(ENC_DIR + id + '.enc')).trim();
      var src = new TextDecoder().decode(await C.aesDec(cek, C.b64uDec(b64)));
      (0, eval)(src); // module IIFE self-registers via NeuroTests.register
    }
  }

  function lockUI(onSubmit) {
    document.documentElement.classList.add('neuro-locked');
    var ov = document.createElement('div');
    ov.className = 'gate-overlay'; ov.id = 'gate-overlay';
    ov.innerHTML =
      '<form class="gate-card" id="gate-form" autocomplete="off">' +
        '<div class="gate-mark" id="gate-mark" aria-hidden="true"></div>' +
        '<h1>Acceso privado</h1>' +
        '<p class="gate-sub">Herramienta de uso restringido. Introduce tu clave de acceso para continuar.</p>' +
        '<input type="password" id="gate-key" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Clave de acceso">' +
        '<button type="submit" class="btn primary" id="gate-go">Entrar</button>' +
        '<p class="gate-err" id="gate-err" hidden>Clave no válida.</p>' +
      '</form>';
    document.body.appendChild(ov);
    var mark = document.getElementById('gate-mark');
    if (mark && global.NeuroBlot) mark.innerHTML = global.NeuroBlot.svg(0, { blur: 0.8 });
    var form = document.getElementById('gate-form'), inp = document.getElementById('gate-key'),
        err = document.getElementById('gate-err'), go = document.getElementById('gate-go');
    setTimeout(function () { inp.focus(); }, 50);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true; go.disabled = true; go.textContent = 'Comprobando…';
      onSubmit(inp.value, function (ok) {
        if (!ok) { err.hidden = false; go.disabled = false; go.textContent = 'Entrar'; inp.select(); }
      });
    });
  }
  function unlockUI() {
    var ov = document.getElementById('gate-overlay'); if (ov) ov.remove();
    document.documentElement.classList.remove('neuro-locked');
  }

  var NeuroGate = {
    // Gate the page: ensure the encrypted modules are decrypted + registered,
    // then run onReady(). Prompts for a key only if none is cached.
    require: function (onReady) {
      if (!global.crypto || !global.crypto.subtle) {
        document.body.innerHTML = '<div class="disclaimer" style="margin:40px auto;max-width:640px">' +
          'Este navegador no admite el cifrado necesario. Ábrelo sobre <strong>HTTPS</strong> en un navegador moderno.</div>';
        return;
      }
      var boot = function (cekBytes) { return loadModules(cekBytes).then(function () { unlockUI(); onReady(); }); };
      var cached = null; try { cached = localStorage.getItem(CEK_KEY); } catch (e) {}
      if (cached) {
        boot(C.b64uDec(cached)).catch(function () { try { localStorage.removeItem(CEK_KEY); } catch (e) {} startLock(); });
        return;
      }
      startLock();
      function startLock() {
        lockUI(function (pass, cb) {
          unwrapCEK(pass).then(function (cek) {
            if (!cek) { cb(false); return; }
            try { localStorage.setItem(CEK_KEY, C.b64uEnc(cek)); } catch (e) {}
            boot(cek).then(function () { cb(true); }).catch(function (err) { console.error(err); cb(false); });
          }).catch(function () { cb(false); });
        });
      }
    },
    // Forget the cached key on this device and return to the lock screen.
    lock: function () { try { localStorage.removeItem(CEK_KEY); } catch (e) {} location.reload(); }
  };
  global.NeuroGate = NeuroGate;
})(window);
