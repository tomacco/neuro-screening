/* crypto.js — WebCrypto helpers for the access gate + self-contained share links.
   No dependencies. Primitives (AES-256-GCM, PBKDF2-SHA256, deflate-raw) interop
   1:1 with Node's webcrypto, so the admin build script and the browser agree. */
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
  function rand(n) { var u = new Uint8Array(n); global.crypto.getRandomValues(u); return u; }

  function hasZip() { return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function'; }
  async function zpipe(bytes, Ctor, fmt) {
    var s = new Blob([bytes]).stream().pipeThrough(new Ctor(fmt));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function deflate(bytes) { return hasZip() ? zpipe(bytes, CompressionStream, 'deflate-raw') : bytes; }
  async function inflate(bytes) { return hasZip() ? zpipe(bytes, DecompressionStream, 'deflate-raw') : bytes; }

  async function deriveKey(passphrase, saltBytes, iters) {
    var base = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt: saltBytes, iterations: iters, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  function importAes(rawBytes) { return subtle.importKey('raw', rawBytes, 'AES-GCM', false, ['encrypt', 'decrypt']); }
  async function aesEnc(key, plainBytes) {
    var iv = rand(12);
    var ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plainBytes));
    var out = new Uint8Array(iv.length + ct.length);
    out.set(iv, 0); out.set(ct, iv.length);
    return out;
  }
  async function aesDec(key, ivct) {
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: ivct.slice(0, 12) }, key, ivct.slice(12)));
  }

  // Self-contained share bundle: JSON -> deflate -> AES-GCM(random key).
  // Returns { s: b64u(iv||ct), k: b64u(key) }. The key travels in the URL
  // fragment (never sent to the server); the ciphertext in the query string.
  async function sealBundle(obj) {
    var comp = await deflate(new TextEncoder().encode(JSON.stringify(obj)));
    var keyBytes = rand(32);
    var sealed = await aesEnc(await importAes(keyBytes), comp);
    return { s: b64uEnc(sealed), k: b64uEnc(keyBytes) };
  }
  async function openBundle(sStr, kStr) {
    var comp = await aesDec(await importAes(b64uDec(kStr)), b64uDec(sStr));
    return JSON.parse(new TextDecoder().decode(await inflate(comp)));
  }

  global.NeuroCrypto = {
    b64uEnc: b64uEnc, b64uDec: b64uDec, rand: rand, deflate: deflate, inflate: inflate,
    deriveKey: deriveKey, importAes: importAes, aesEnc: aesEnc, aesDec: aesDec,
    sealBundle: sealBundle, openBundle: openBundle
  };
})(window);
