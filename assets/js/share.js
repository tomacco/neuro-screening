/* share.js — UTF-8-safe base64url encode/decode for URL state, with optional
   DEFLATE for the compact "all results" link. No dependencies. */
(function (global) {
  'use strict';

  function toBase64Url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    var bin = atob(str);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // --- Optional DEFLATE via the browser's built-in streams (async) ---
  function hasDeflate() { return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function'; }
  async function pipe(bytes, Ctor, fmt) {
    var stream = new Blob([bytes]).stream().pipeThrough(new Ctor(fmt));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  var NeuroShare = {
    // Small synchronous codec — used by the per-test share links.
    encode: function (obj) {
      return toBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
    },
    decode: function (str) {
      try {
        return JSON.parse(new TextDecoder().decode(fromBase64Url(str)));
      } catch (e) {
        return null;
      }
    },

    // Compact codec for the combined "all results" link.
    // Output is prefixed with a 1-char scheme tag: 'C' = deflate-raw, 'R' = raw.
    encodeAsync: async function (obj) {
      var bytes = new TextEncoder().encode(JSON.stringify(obj));
      if (hasDeflate()) {
        try { return 'C' + toBase64Url(await pipe(bytes, CompressionStream, 'deflate-raw')); } catch (e) {}
      }
      return 'R' + toBase64Url(bytes);
    },
    decodeAsync: async function (str) {
      if (!str) return null;
      try {
        var tag = str.charAt(0), bytes = fromBase64Url(str.slice(1));
        if (tag === 'C') bytes = await pipe(bytes, DecompressionStream, 'deflate-raw');
        else if (tag !== 'R') return null; // unknown scheme
        return JSON.parse(new TextDecoder().decode(bytes));
      } catch (e) {
        return null;
      }
    }
  };

  global.NeuroShare = NeuroShare;
})(window);
