/* crypto.js — WebCrypto helpers for the access gate.
   No dependencies. Primitives (AES-256-GCM, PBKDF2-SHA256) interop 1:1 with
   Node's webcrypto, so the admin build script and the browser agree byte-for-byte. */
(function (global) {
  'use strict';
  var subtle = global.crypto && global.crypto.subtle;

  function b64uEnc(bytes) {
    var b = '';
    for (var i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
    return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uDec(str) {
    str = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    var bin = atob(str), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  // Derive an AES-GCM key from a passphrase (unwraps the content key).
  async function deriveKey(passphrase, saltBytes, iters) {
    var base = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt: saltBytes, iterations: iters, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  function importAes(rawBytes) { return subtle.importKey('raw', rawBytes, 'AES-GCM', false, ['encrypt', 'decrypt']); }
  async function aesDec(key, ivct) {
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: ivct.slice(0, 12) }, key, ivct.slice(12)));
  }

  global.NeuroCrypto = {
    b64uEnc: b64uEnc, b64uDec: b64uDec, deriveKey: deriveKey, importAes: importAes, aesDec: aesDec
  };
})(window);
