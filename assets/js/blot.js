/* blot.js — symmetric "Rorschach" inkblot SVGs.
   Drawn as a right-half group mirrored across the vertical axis, so they are always symmetric.
   fill = currentColor, so CSS `color` sets the ink. A soft blur gives the wet-ink edge. */
(function (global) {
  'use strict';
  var uid = 0;

  // Each variant = list of right-half shapes + a centre spine (on the axis).
  var VARIANTS = [
    { // A — tall, lobed
      half: 'M0,0 <e 135 96 38 52><c 158 66 20><c 150 132 18><e 118 160 16 26><c 171 102 10>',
      shapes: [['e',135,96,38,52],['c',158,66,20],['c',150,132,18],['e',118,160,16,26],['c',171,102,10]],
      centre: [['e',100,104,22,64],['e',100,52,30,22]]
    },
    { // B — winged
      shapes: [['e',140,110,30,44],['c',166,92,22],['e',150,150,22,16],['c',120,70,18],['c',176,118,9]],
      centre: [['e',100,110,26,58],['e',100,58,26,20]]
    },
    { // C — clustered
      shapes: [['c',130,80,26],['c',151,120,20],['c',120,152,16],['e',162,96,12,22]],
      centre: [['e',100,112,20,64],['c',100,66,24]]
    }
  ];

  function shapeSvg(s) {
    if (s[0] === 'c') return '<circle cx="' + s[1] + '" cy="' + s[2] + '" r="' + s[3] + '"/>';
    return '<ellipse cx="' + s[1] + '" cy="' + s[2] + '" rx="' + s[3] + '" ry="' + s[4] + '"/>';
  }

  function svg(variant, opts) {
    opts = opts || {};
    var v = VARIANTS[((variant || 0) % VARIANTS.length + VARIANTS.length) % VARIANTS.length];
    var id = 'blot' + (uid++);
    var blur = opts.blur != null ? opts.blur : 1.4;
    var half = v.shapes.map(shapeSvg).join('');
    var centre = v.centre.map(shapeSvg).join('');
    return '<svg class="blot" viewBox="0 0 200 200" aria-hidden="true" focusable="false">' +
      '<defs><filter id="' + id + '" x="-20%" y="-20%" width="140%" height="140%">' +
      '<feGaussianBlur stdDeviation="' + blur + '"/></filter></defs>' +
      '<g fill="currentColor" filter="url(#' + id + ')">' +
        centre + half +
        '<g transform="translate(200,0) scale(-1,1)">' + half + '</g>' +
      '</g></svg>';
  }

  global.NeuroBlot = { svg: svg, count: VARIANTS.length };
})(window);
