/* Flame background engine — adapted from "Flame Fire Cursor" demo
 * Layers (see styles.css):
 *   .flame-bg      fixed ember artwork behind content (parallax)
 *   #flame-canvas  fixed canvas ABOVE content (additive flame glow, pointer-events: none)
 *   #flame-hd      fixed canvas for heat-shimmer glow
 * Native cursor stays; flame core is an aura around it. Click = flame burst.
 */
(function () {
  "use strict";

  var bgEl = document.getElementById("flame-bg");
  var C = document.getElementById("flame-canvas");
  var HD = document.getElementById("flame-hd");
  if (!C || !HD || !bgEl) return;
  /* respect reduced-motion: static ember background only, no particles */
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  /* ===== Canvas & DPR ===== */
  var ctx = C.getContext("2d");
  var hctx = HD.getContext("2d");
  var W, H, dpr;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    C.width = W * dpr;
    C.height = H * dpr;
    C.style.width = W + "px";
    C.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    HD.width = W * dpr;
    HD.height = H * dpr;
    HD.style.width = W + "px";
    HD.style.height = H + "px";
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener("resize", resize);
  resize();

  /* ===== Math helpers ===== */
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var randi = function (a, b) { return (a + Math.random() * (b - a)) | 0; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var TAU = Math.PI * 2;

  /* ============ FLAME BREATHING COLOR SYSTEM ============ */
  /* Black → deep ember → fiery orange → golden amber → white-hot */
  var LUT_R = new Uint8Array(256), LUT_G = new Uint8Array(256), LUT_B = new Uint8Array(256);
  (function () {
    var stops = [
      [0, [0, 0, 0]],
      [24, [38, 4, 0]],
      [58, [120, 22, 0]],
      [98, [205, 62, 0]],
      [138, [255, 112, 8]],
      [178, [255, 172, 38]],
      [215, [255, 216, 92]],
      [255, [255, 250, 222]]
    ];
    for (var i = 0; i < 256; i++) {
      for (var s = 0; s < stops.length - 1; s++) {
        var t0 = stops[s][0], c0 = stops[s][1], t1 = stops[s + 1][0], c1 = stops[s + 1][1];
        if (i >= t0 && i <= t1) {
          var f = (i - t0) / (t1 - t0);
          LUT_R[i] = (c0[0] + (c1[0] - c0[0]) * f) | 0;
          LUT_G[i] = (c0[1] + (c1[1] - c0[1]) * f) | 0;
          LUT_B[i] = (c0[2] + (c1[2] - c0[2]) * f) | 0;
          break;
        }
      }
    }
  })();

  /* Deeper copper-ember accent LUT — for ~25% of particles */
  var CLUT_R = new Uint8Array(256), CLUT_G = new Uint8Array(256), CLUT_B = new Uint8Array(256);
  (function () {
    var stops = [
      [0, [0, 0, 0]],
      [42, [32, 2, 0]],
      [95, [105, 12, 0]],
      [150, [185, 40, 0]],
      [200, [235, 88, 8]],
      [255, [255, 150, 45]]
    ];
    for (var i = 0; i < 256; i++) {
      for (var s = 0; s < stops.length - 1; s++) {
        var t0 = stops[s][0], c0 = stops[s][1], t1 = stops[s + 1][0], c1 = stops[s + 1][1];
        if (i >= t0 && i <= t1) {
          var f = (i - t0) / (t1 - t0);
          CLUT_R[i] = (c0[0] + (c1[0] - c0[0]) * f) | 0;
          CLUT_G[i] = (c0[1] + (c1[1] - c0[1]) * f) | 0;
          CLUT_B[i] = (c0[2] + (c1[2] - c0[2]) * f) | 0;
          break;
        }
      }
    }
  })();

  function flameColor(t, a) {
    var i = clamp(t * 255, 0, 255) | 0;
    return "rgba(" + LUT_R[i] + "," + LUT_G[i] + "," + LUT_B[i] + "," + a + ")";
  }
  function copperColor(t, a) {
    var i = clamp(t * 255, 0, 255) | 0;
    return "rgba(" + CLUT_R[i] + "," + CLUT_G[i] + "," + CLUT_B[i] + "," + a + ")";
  }

  /* ===== Pointer state ===== */
  var P = { x: W / 2, y: H / 2, tx: W / 2, ty: H / 2, px: W / 2, py: H / 2, vx: 0, vy: 0, speed: 0, lastMove: 0 };
  function setTarget(x, y) {
    P.tx = x; P.ty = y; P.lastMove = performance.now();
  }
  addEventListener("mousemove", function (e) { setTarget(e.clientX, e.clientY); });
  addEventListener("touchmove", function (e) {
    if (e.touches.length) setTarget(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  addEventListener("mousedown", function (e) {
    if (e.button !== 0) return;
    document.body.classList.add("aura-active");
    burst(e.clientX, e.clientY);
  });
  addEventListener("mouseup", function () { document.body.classList.remove("aura-active"); });
  addEventListener("mouseleave", function () { document.body.classList.remove("aura-active"); });
  addEventListener("touchstart", function (e) {
    document.body.classList.add("aura-active");
    if (e.touches.length) {
      setTarget(e.touches[0].clientX, e.touches[0].clientY);
      burst(P.tx, P.ty);
    }
  }, { passive: true });
  addEventListener("touchend", function () { document.body.classList.remove("aura-active"); });

  /* ===== PARTICLE POOLS ===== */

  /* Embers */
  var EMAX = 600, embers = [], eHead = 0;
  for (var ei = 0; ei < EMAX; ei++) embers.push({ alive: false });
  function spawnEmber(x, y, vx, vy, life, sz, hot, deep) {
    var e = embers[eHead % EMAX]; eHead++;
    e.alive = true; e.x = x; e.y = y; e.vx = vx; e.vy = vy;
    e.age = 0; e.life = life; e.sz = sz; e.hot = hot;
    e.sway = rand(0.4, 1.4); e.phase = rand(0, TAU); e.grav = rand(35, 85); e.deep = deep || false;
  }

  /* Smoke wisps */
  var SMAX = 300, smoke = [], sHead = 0;
  for (var si = 0; si < SMAX; si++) smoke.push({ alive: false });
  function spawnSmoke(x, y, vx, vy, r, life, dark) {
    var s = smoke[sHead % SMAX]; sHead++;
    s.alive = true; s.x = x; s.y = y; s.vx = vx; s.vy = vy;
    s.age = 0; s.life = life; s.r = r; s.dark = dark || false;
  }

  /* Flame puffs (flickering tongues of fire) */
  var FMAX = 360, flames = [], fHead = 0;
  for (var fi = 0; fi < FMAX; fi++) flames.push({ alive: false });
  function spawnFlame(x, y, vx, vy, r, life, hot, deep) {
    var f = flames[fHead % FMAX]; fHead++;
    f.alive = true; f.x = x; f.y = y; f.vx = vx; f.vy = vy;
    f.age = 0; f.life = life; f.r = r; f.hot = hot; f.deep = deep || false;
  }

  /* Sparks */
  var SPKMAX = 420, sparks = [], spkHead = 0;
  for (var ki = 0; ki < SPKMAX; ki++) sparks.push({ alive: false, px: 0, py: 0 });
  function spawnSpark(x, y, vx, vy, life, bright, deep) {
    var s = sparks[spkHead % SPKMAX]; spkHead++;
    s.alive = true; s.x = x; s.y = y; s.px = x; s.py = y;
    s.vx = vx; s.vy = vy; s.age = 0; s.life = life; s.bright = bright; s.deep = deep || false;
  }

  /* Flame blades (sword-slash streaks) */
  var BMAX = 150, blades = [], bHead = 0;
  for (var bi = 0; bi < BMAX; bi++) blades.push({ alive: false });
  function spawnBlade(x, y, angle, speed, len, width, life, hot, deep, spin) {
    var b = blades[bHead % BMAX]; bHead++;
    b.alive = true; b.x = x; b.y = y;
    b.vx = Math.cos(angle) * speed; b.vy = Math.sin(angle) * speed;
    b.angle = angle; b.len = len; b.width = width;
    b.age = 0; b.life = life; b.hot = hot; b.deep = deep || false; b.spin = spin || 0;
  }

  /* Spinning fire rings (circular flame-slash signature) */
  var RMAX = 8, fireRings = [];
  function spawnFireRing(x, y, maxR, life, segs, rotSpeed, deep) {
    fireRings.push({ x: x, y: y, age: 0, life: life, maxR: maxR, segs: segs, rotSpeed: rotSpeed, baseAngle: rand(0, TAU), deep: deep || false });
    if (fireRings.length > RMAX) fireRings.shift();
  }

  /* Shockwaves & flashes */
  var waves = [];
  var flashes = [];

  /* Heat shimmer cells */
  var HDMAX = 220, hdCells = [], hdHead = 0;
  for (var hi = 0; hi < HDMAX; hi++) hdCells.push({ alive: false });
  function spawnHD(x, y, str, life) {
    var h = hdCells[hdHead % HDMAX]; hdHead++;
    h.alive = true; h.x = x; h.y = y; h.str = str; h.age = 0; h.life = life;
  }

  /* Trail points */
  var TMAX = 65, trail = [];
  function addTrail(x, y, t) {
    if (trail.length >= TMAX) trail.shift();
    trail.push({ x: x, y: y, t: t });
  }

  /* ===== DRAW PRIMITIVES ===== */

  /* Flame blade — tapered curved sword-slash, hilt at origin, tip along +x */
  function drawBlade(cx, cy, len, width, angle, hot, deep, alpha) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, -width * 0.5);
    ctx.quadraticCurveTo(len * 0.45, -width * 0.65, len * 0.92, -width * 0.06);
    ctx.quadraticCurveTo(len * 1.04, 0, len * 0.92, width * 0.06);
    ctx.quadraticCurveTo(len * 0.45, width * 0.65, 0, width * 0.5);
    ctx.closePath();
    var col = deep ? copperColor : flameColor;
    var g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, col(0.18, alpha * 0.7));
    g.addColorStop(0.45, col(0.55, alpha * 0.92));
    g.addColorStop(0.78, col(0.82, alpha));
    g.addColorStop(1, col(0.98, alpha));
    ctx.fillStyle = g;
    ctx.fill();
    /* bright leading edge */
    ctx.lineWidth = Math.max(0.5, width * 0.1);
    ctx.strokeStyle = flameColor(1.0, alpha * 0.6);
    ctx.beginPath();
    ctx.moveTo(len * 0.4, -width * 0.5 * 0.55);
    ctx.lineTo(len * 0.96, 0);
    ctx.stroke();
    ctx.restore();
  }

  /* Flame Breathing Burst — Ultimate: Flame Tiger (circular flame slash) */
  function burst(x, y) {
    waves.push({ x: x, y: y, r: 0, maxR: rand(170, 260), age: 0, life: 620 });
    waves.push({ x: x, y: y, r: 0, maxR: rand(100, 150), age: 0, life: 460, delay: 70 });
    flashes.push({ x: x, y: y, r: 0, maxR: rand(260, 400), age: 0, life: 520 });

    /* spinning fire rings — the rotating circular flame slash */
    spawnFireRing(x, y, rand(220, 300), rand(900, 1250), 12, rand(3.2, 4.4), false);

    /* burst flame blades */
    for (var i = 0; i < 26; i++) {
      var a = rand(0, TAU), spd = rand(120, 420), isDeep = Math.random() < 0.25;
      spawnBlade(x, y, a, spd, rand(34, 62), rand(7, 13), rand(380, 720), rand(0.75, 1.0), isDeep, rand(1.5, 3.5) * (i % 2 === 0 ? 1 : -1));
      spawnFlame(x, y, Math.cos(a) * spd * 0.45, Math.sin(a) * spd * 0.45, rand(22, 48), rand(340, 680), rand(0.6, 1.0), isDeep);
      if (i % 2 === 0)
        spawnSmoke(x + rand(-8, 8), y + rand(-8, 8), Math.cos(a) * spd * 0.18, Math.sin(a) * spd * 0.18 - rand(25, 55), rand(20, 38), rand(550, 850), true);
    }

    /* heavy sparks */
    for (var j = 0; j < 150; j++) {
      var a2 = rand(0, TAU), spd2 = rand(90, 540);
      spawnSpark(x, y, Math.cos(a2) * spd2, Math.sin(a2) * spd2, rand(300, 950), rand(0.7, 1.0), Math.random() < 0.3);
    }

    /* embers */
    for (var k = 0; k < 100; k++) {
      var a3 = rand(0, TAU) - Math.PI / 2, spd3 = rand(35, 220);
      spawnEmber(x, y, Math.cos(a3) * spd3, Math.sin(a3) * spd3 - rand(40, 110), rand(500, 1300), rand(1.5, 3.6), rand(0.5, 1.0), Math.random() < 0.25);
    }

    /* heat-wave distortion pulse */
    spawnHD(x, y, rand(13, 19), rand(750, 1150));
    for (var h = 0; h < 4; h++)
      spawnHD(x + rand(-20, 20), y + rand(-20, 20), rand(8, 13), rand(500, 850));
  }

  /* ===== MAIN LOOP ===== */
  var last = performance.now();
  var ambE = 0, ambF = 0, ambHD = 0, ambB = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(now - last, 33);
    last = now;
    var dtS = dt * 0.001;

    /* Pointer tracking */
    P.px = P.x; P.py = P.y;
    var ease = 1 - Math.pow(0.001, dtS * 5);
    P.x = lerp(P.x, P.tx, ease);
    P.y = lerp(P.y, P.ty, ease);
    P.vx = (P.x - P.px) / Math.max(dtS, 0.001);
    P.vy = (P.y - P.py) / Math.max(dtS, 0.001);
    P.speed = Math.hypot(P.vx, P.vy);

    /* Parallax bg */
    var bx = (P.tx / W - 0.5) * -32;
    var by = (P.ty / H - 0.5) * -32;
    bgEl.style.transform = "translate(" + bx + "px," + by + "px) scale(1.08)";

    /* Trail */
    addTrail(P.x, P.y, now);
    while (trail.length && now - trail[0].t > 320) trail.shift();

    var idle = now - P.lastMove;
    var moving = idle < 120;
    var speedFactor = clamp(P.speed / 300, 0, 1);

    /* Ambient ember emission */
    ambE -= dt;
    if (ambE <= 0) {
      ambE = moving ? rand(8, 20) : rand(25, 50);
      var n = moving ? randi(2, 5) : 1;
      for (var i = 0; i < n; i++) {
        var a = -Math.PI / 2 + rand(-0.8, 0.8);
        var spd = rand(20, 80) * (1 + speedFactor * 2);
        spawnEmber(P.x + rand(-5, 5), P.y + rand(-5, 5), Math.cos(a) * spd, Math.sin(a) * spd - rand(20, 50), rand(600, 1400), rand(1.2, 3.0), rand(0.3, 0.8), Math.random() < 0.18);
      }
    }

    /* Ambient flowing flame puffs */
    ambF -= dt;
    if (ambF <= 0) {
      ambF = moving ? rand(12, 28) : rand(35, 70);
      var n2 = moving ? randi(2, 6) : randi(1, 3);
      for (var j = 0; j < n2; j++) {
        var a2 = -Math.PI / 2 + rand(-1.0, 1.0);
        var spd2 = rand(15, 70) * (1 + speedFactor * 1.5);
        spawnFlame(P.x + rand(-6, 6), P.y + rand(-6, 6), Math.cos(a2) * spd2 * 0.5, Math.sin(a2) * spd2 - rand(10, 40), rand(10, 28) * (1 + speedFactor * 0.8), rand(180, 400), rand(0.4, 1.0), Math.random() < 0.15);
      }
      if (Math.random() < (moving ? 0.4 : 0.1))
        spawnSmoke(P.x + rand(-8, 8), P.y - 10, rand(-15, 15), rand(-40, -15), rand(14, 26), rand(400, 700), false);
    }

    /* Ambient sword-slash flame streaks on fast movement */
    ambB -= dt;
    if (ambB <= 0) {
      ambB = moving ? rand(70, 150) : rand(260, 520);
      if (moving && P.speed > 90) {
        var a3 = Math.atan2(P.vy, P.vx) + rand(-0.25, 0.25);
        spawnBlade(P.x, P.y, a3, rand(20, 60) + speedFactor * 30, rand(16, 30) * (0.6 + speedFactor), rand(4, 7), rand(260, 520), rand(0.6, 0.95), Math.random() < 0.2, rand(-1, 1));
      }
    }

    ambHD -= dt;
    if (ambHD <= 0) {
      ambHD = rand(80, 150);
      spawnHD(P.x + rand(-15, 15), P.y + rand(-15, 15), rand(3, 6), rand(200, 400));
    }

    /* Movement-triggered emission */
    if (moving && P.speed > 20) {
      var n4 = clamp((P.speed / 100) | 0, 1, 6);
      for (var m = 0; m < n4; m++) {
        var t = Math.random();
        var sx = lerp(P.px, P.x, t), sy = lerp(P.py, P.y, t);
        var a4 = -Math.PI / 2 + rand(-1.1, 1.1);
        var spd4 = rand(30, 110) + speedFactor * 60;
        spawnFlame(sx + rand(-4, 4), sy + rand(-4, 4), P.vx * 0.1 + Math.cos(a4) * spd4 * 0.4, -Math.abs(Math.sin(a4) * spd4) - rand(20, 55), rand(8, 22), rand(150, 350), rand(0.6, 1.0));
        if (Math.random() < 0.5)
          spawnEmber(sx, sy, P.vx * 0.08 + rand(-40, 40), -rand(40, 130), rand(500, 1100), rand(1, 2.5), rand(0.5, 1.0));
        if (P.speed > 150 && Math.random() < 0.22)
          spawnSpark(sx, sy, P.vx * 0.2 + rand(-80, 80), P.vy * 0.2 + rand(-80, 80), rand(200, 500), 0.8);
        if (P.speed > 200 && Math.random() < 0.16) {
          var ba = Math.atan2(P.vy, P.vx) + rand(-0.3, 0.3);
          spawnBlade(sx, sy, ba, rand(60, 150), rand(20, 36), rand(5, 8), rand(220, 460), rand(0.7, 1.0), Math.random() < 0.2, rand(-1.5, 1.5));
        }
      }
    }

    /* ===== DRAW ===== */
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    /* Flashes — fiery white-gold bloom */
    for (var x = flashes.length - 1; x >= 0; x--) {
      var fl = flashes[x];
      fl.age += dt;
      if (fl.age >= fl.life) { flashes.splice(x, 1); continue; }
      var tp = fl.age / fl.life;
      var r = lerp(0, fl.maxR, Math.pow(tp, 0.3));
      var a = (1 - tp) * (1 - tp) * 0.35;
      var g = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, r);
      g.addColorStop(0, "rgba(255,250,225," + a + ")");
      g.addColorStop(0.22, "rgba(255,170,40," + (a * 0.82) + ")");
      g.addColorStop(0.55, "rgba(220,70,0," + (a * 0.48) + ")");
      g.addColorStop(0.8, "rgba(80,15,0," + (a * 0.22) + ")");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, r, 0, TAU);
      ctx.fill();
    }

    /* Shockwaves — amber rings */
    for (var y = waves.length - 1; y >= 0; y--) {
      var w = waves[y];
      if (w.delay && w.delay > 0) { w.delay -= dt; continue; }
      w.age += dt;
      if (w.age >= w.life) { waves.splice(y, 1); continue; }
      var tp2 = w.age / w.life;
      var r2 = lerp(0, w.maxR, Math.pow(tp2, 0.5));
      var a5 = (1 - tp2) * (1 - tp2) * 0.75;
      var lw = lerp(7, 0.4, tp2);
      ctx.beginPath();
      ctx.arc(w.x, w.y, r2, 0, TAU);
      ctx.lineWidth = lw;
      ctx.strokeStyle = "rgba(255,150,30," + a5 + ")";
      ctx.stroke();
      ctx.lineWidth = lw * 3;
      ctx.strokeStyle = "rgba(180,50,0," + (a5 * 0.32) + ")";
      ctx.stroke();
      if (tp2 < 0.42) {
        var r3 = lerp(0, w.maxR * 0.42, tp2 / 0.42);
        ctx.beginPath();
        ctx.arc(w.x, w.y, r3, 0, TAU);
        ctx.lineWidth = lw * 0.55;
        ctx.strokeStyle = "rgba(255,240,200," + (a5 * 0.6) + ")";
        ctx.stroke();
      }
    }

    /* Spinning fire rings */
    for (var ring = fireRings.length - 1; ring >= 0; ring--) {
      var r = fireRings[ring];
      r.age += dt;
      if (r.age >= r.life) { fireRings.splice(ring, 1); continue; }
      var tp3 = r.age / r.life;
      var radius = lerp(0, r.maxR, Math.pow(tp3, 0.42));
      var ringAlpha = Math.sin(tp3 * Math.PI) * 0.85;
      r.baseAngle += r.rotSpeed * dtS;
      var col = r.deep ? copperColor : flameColor;

      /* thin connecting ring */
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, TAU);
      ctx.lineWidth = lerp(2.4, 0.4, tp3);
      ctx.strokeStyle = col(0.6, ringAlpha * 0.35);
      ctx.stroke();

      /* flame blades evenly spaced around the ring, rotating */
      for (var s = 0; s < r.segs; s++) {
        var segAngle = r.baseAngle + (s / r.segs) * TAU;
        var bx2 = r.x + Math.cos(segAngle) * radius;
        var by2 = r.y + Math.sin(segAngle) * radius;
        var tangent = segAngle + (Math.PI / 2) * (r.rotSpeed > 0 ? 1 : -1);
        var segLen = lerp(8, 36, Math.sin(tp3 * Math.PI)) * (0.7 + 0.3 * Math.sin(s * 1.7 + tp3 * 6));
        drawBlade(bx2, by2, segLen, segLen * 0.4, tangent, r.deep ? 0.6 : 0.85, r.deep, ringAlpha);
      }
    }

    /* Smoke (drawn under flame) */
    ctx.globalCompositeOperation = "source-over";
    for (var sm = 0; sm < SMAX; sm++) {
      var smk = smoke[sm];
      if (!smk.alive) continue;
      smk.age += dt;
      if (smk.age >= smk.life) { smk.alive = false; continue; }
      smk.x += smk.vx * dtS;
      smk.y += smk.vy * dtS;
      smk.vy -= dtS * 8;
      smk.vx += rand(-4, 4) * dtS;
      var tp4 = smk.age / smk.life;
      var rr = smk.r * (1 + tp4 * 1.2);
      var a6 = smk.dark ? (1 - tp4) * 0.18 * Math.sin(tp4 * Math.PI) : (1 - tp4) * 0.1 * Math.sin(tp4 * Math.PI);
      var col2 = smk.dark ? "rgba(14,4,2," + a6 + ")" : "rgba(70,25,5," + a6 + ")";
      var g2 = ctx.createRadialGradient(smk.x, smk.y, 0, smk.x, smk.y, Math.max(1, rr));
      g2.addColorStop(0, col2);
      g2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(smk.x, smk.y, Math.max(1, rr), 0, TAU);
      ctx.fill();
    }

    /* Flame puffs */
    ctx.globalCompositeOperation = "lighter";
    for (var fy = 0; fy < FMAX; fy++) {
      var f = flames[fy];
      if (!f.alive) continue;
      f.age += dt;
      if (f.age >= f.life) { f.alive = false; continue; }
      f.x += f.vx * dtS;
      f.y += f.vy * dtS;
      f.vy -= dtS * 55;
      f.vx *= Math.pow(0.95, dtS * 60);
      f.vx += Math.sin(now * 0.007 + f.age * 0.01) * dtS * 40;
      var tp5 = f.age / f.life;
      var hotness = f.hot * (1 - tp5);
      var r4 = f.r * (1 + tp5 * 0.3);
      var a7 = Math.sin(tp5 * Math.PI) * 0.7 * f.hot;
      var g3 = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(1, r4));
      var col3 = f.deep ? copperColor : flameColor;
      g3.addColorStop(0, col3(hotness, a7));
      g3.addColorStop(0.45, col3(hotness * 0.6, a7 * 0.7));
      g3.addColorStop(0.8, col3(hotness * 0.3, a7 * 0.3));
      g3.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, Math.max(1, r4), 0, TAU);
      ctx.fill();
    }

    /* Flame blades (ambient + burst radiating) */
    for (var bl = 0; bl < BMAX; bl++) {
      var b = blades[bl];
      if (!b.alive) continue;
      b.age += dt;
      if (b.age >= b.life) { b.alive = false; continue; }
      b.x += b.vx * dtS;
      b.y += b.vy * dtS;
      b.vy -= dtS * 18;
      b.vx *= Math.pow(0.96, dtS * 60);
      b.angle += b.spin * dtS;
      var tp6 = b.age / b.life;
      var hot2 = b.hot * (1 - tp6);
      var len = b.len * (1 - tp6 * 0.25);
      var a8 = Math.sin(tp6 * Math.PI) * 0.85 * b.hot;
      if (a8 < 0.02) continue;
      drawBlade(b.x, b.y, len, b.width * (1 - tp6 * 0.3), b.angle, hot2, b.deep, a8);
    }

    /* Trail — flowing flame ribbon */
    if (trail.length >= 3) {
      for (var tr = 1; tr < trail.length; tr++) {
        var age = (now - trail[tr].t) / 320;
        var alpha = clamp(1 - age, 0, 1);
        if (alpha < 0.01) continue;
        var w2 = lerp(2, 10, 1 - age);
        ctx.beginPath();
        ctx.moveTo(trail[tr - 1].x, trail[tr - 1].y);
        ctx.lineTo(trail[tr].x, trail[tr].y);
        ctx.lineWidth = w2 * 4;
        ctx.strokeStyle = "rgba(120,30,0," + (alpha * 0.15) + ")";
        ctx.stroke();
        ctx.lineWidth = w2 * 2.5;
        ctx.strokeStyle = "rgba(225,70,0," + (alpha * 0.32) + ")";
        ctx.stroke();
        ctx.lineWidth = w2 * 1.4;
        ctx.strokeStyle = "rgba(255,140,20," + (alpha * 0.55) + ")";
        ctx.stroke();
        ctx.lineWidth = w2 * 0.8;
        ctx.strokeStyle = "rgba(255,200,80," + (alpha * 0.72) + ")";
        ctx.stroke();
        ctx.lineWidth = Math.max(1, w2 * 0.42);
        ctx.strokeStyle = "rgba(255,250,220," + (alpha * 0.9) + ")";
        ctx.stroke();
      }
    }

    /* Sparks */
    for (var sp = 0; sp < SPKMAX; sp++) {
      var s2 = sparks[sp];
      if (!s2.alive) continue;
      s2.age += dt;
      if (s2.age >= s2.life) { s2.alive = false; continue; }
      s2.px = s2.x; s2.py = s2.y;
      s2.x += s2.vx * dtS;
      s2.y += s2.vy * dtS;
      s2.vy += 180 * dtS;
      s2.vx *= Math.pow(0.88, dtS * 60);
      var tp7 = s2.age / s2.life;
      var a9 = clamp((1 - tp7) * (1 - tp7) * s2.bright * 1.2, 0, 1);
      var hot3 = 1 - tp7 * 0.6;
      var tlen = Math.hypot(s2.x - s2.px, s2.y - s2.py);
      var slen = clamp(tlen, 2, 18);
      var ang = Math.atan2(s2.y - s2.py, s2.x - s2.px);

      ctx.setTransform(dpr, 0, 0, dpr, s2.x, s2.y);
      ctx.rotate(ang + Math.PI);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(slen, 0);
      var gc = ctx.createLinearGradient(0, 0, slen, 0);
      var col4 = s2.deep ? copperColor : flameColor;
      gc.addColorStop(0, col4(hot3, a9));
      gc.addColorStop(1, col4(hot3 * 0.4, 0));
      ctx.strokeStyle = gc;
      ctx.lineWidth = clamp(2 - tp7 * 1.5, 0.5, 2);
      ctx.stroke();
      ctx.strokeStyle = col4(hot3, a9 * 0.25);
      ctx.lineWidth = clamp(2 - tp7 * 1.5, 0.5, 2) * 2;
      ctx.stroke();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* Embers */
    for (var em = 0; em < EMAX; em++) {
      var e = embers[em];
      if (!e.alive) continue;
      e.age += dt;
      if (e.age >= e.life) { e.alive = false; continue; }
      e.x += e.vx * dtS + Math.sin(now * 0.004 + e.phase) * e.sway * dtS;
      e.y += e.vy * dtS;
      e.vy += e.grav * dtS;
      e.vx *= Math.pow(0.97, dtS * 60);
      var tp8 = e.age / e.life;
      var hot4 = e.hot * (1 - tp8 * 0.7);
      var a10 = (1 - tp8) * (1 - tp8) * 0.95;
      var r5 = e.sz * (1 - tp8 * 0.3);
      var col5 = e.deep ? copperColor : flameColor;

      ctx.fillStyle = col5(hot4, a10);
      ctx.beginPath();
      ctx.arc(e.x, e.y, Math.max(0.5, r5), 0, TAU);
      ctx.fill();

      ctx.fillStyle = col5(clamp(hot4, 0, 1), a10 * 0.3);
      ctx.beginPath();
      ctx.arc(e.x, e.y, Math.max(0.5, r5 * 2.2), 0, TAU);
      ctx.fill();
    }

    /* Cursor tip — Flame Breathing living flame core */
    {
      var flicker = 0.88 + 0.08 * Math.sin(now * 0.013) + 0.06 * Math.sin(now * 0.031 + 1.3) + 0.04 * Math.sin(now * 0.05 + 2.7);
      var jx = Math.sin(now * 0.022) * 1.2;
      var jy = Math.sin(now * 0.019 + 1.5) * 1.2;
      var cx = P.x + jx, cy = P.y + jy - 2 * flicker;

      /* far outer amber aura */
      var og = ctx.createRadialGradient(cx, cy, 0, cx, cy, 62 * flicker);
      og.addColorStop(0, "rgba(255,120,20,0.22)");
      og.addColorStop(0.45, "rgba(180,50,0,0.09)");
      og.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = og;
      ctx.beginPath();
      ctx.arc(cx, cy, 62 * flicker, 0, TAU);
      ctx.fill();

      /* corona ring — golden haze at mid radius */
      var cg2 = ctx.createRadialGradient(cx, cy, 18 * flicker, cx, cy, 44 * flicker);
      cg2.addColorStop(0, "rgba(0,0,0,0)");
      cg2.addColorStop(0.5, "rgba(255,160,30,0.11)");
      cg2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = cg2;
      ctx.beginPath();
      ctx.arc(cx, cy, 44 * flicker, 0, TAU);
      ctx.fill();

      /* rising flame tongue shape */
      ctx.save();
      ctx.translate(cx, cy);
      var wobble = Math.sin(now * 0.012) * 0.12;
      ctx.rotate(wobble);
      ctx.beginPath();
      ctx.moveTo(0, 10 * flicker);
      ctx.quadraticCurveTo(9 * flicker, 2 * flicker, 4 * flicker, -12 * flicker);
      ctx.quadraticCurveTo(1 * flicker, -20 * flicker, 0, -30 * flicker);
      ctx.quadraticCurveTo(-1 * flicker, -20 * flicker, -4 * flicker, -12 * flicker);
      ctx.quadraticCurveTo(-9 * flicker, 2 * flicker, 0, 10 * flicker);
      ctx.closePath();
      var tongueG = ctx.createLinearGradient(0, 10 * flicker, 0, -30 * flicker);
      tongueG.addColorStop(0, "rgba(200,40,0,0.85)");
      tongueG.addColorStop(0.4, "rgba(255,120,10,0.9)");
      tongueG.addColorStop(0.72, "rgba(255,200,60,0.92)");
      tongueG.addColorStop(1, "rgba(255,250,225,0.96)");
      ctx.fillStyle = tongueG;
      ctx.fill();
      ctx.restore();

      /* mid flame bloom */
      var mg = ctx.createRadialGradient(cx, cy - 2, 0, cx, cy, 26 * flicker);
      mg.addColorStop(0, "rgba(255,210,90,0.7)");
      mg.addColorStop(0.32, "rgba(255,120,15,0.62)");
      mg.addColorStop(0.68, "rgba(200,40,0,0.3)");
      mg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(cx, cy - 2, 26 * flicker, 0, TAU);
      ctx.fill();

      /* inner white-hot core */
      var hg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 8 * flicker);
      hg.addColorStop(0, "rgba(255,253,240,1)");
      hg.addColorStop(0.32, "rgba(255,200,90,0.95)");
      hg.addColorStop(0.68, "rgba(255,110,10,0.55)");
      hg.addColorStop(1, "rgba(120,10,0,0)");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(cx, cy, 8 * flicker, 0, TAU);
      ctx.fill();

      /* orbiting micro flame-blade fragments */
      var orbitA = now * 0.0026;
      for (var ok = 0; ok < 2; ok++) {
        var oa = orbitA + (ok / 2) * TAU;
        var or2 = (15 + ok * 4) * flicker;
        var ox = cx + Math.cos(oa) * or2;
        var oy = cy + Math.sin(oa) * or2;
        ctx.save();
        ctx.globalAlpha = 0.55 - ok * 0.15;
        drawBlade(ox, oy, 7 * flicker, 2.6 * flicker, oa + Math.PI / 2, 0.85, ok === 1, 0.8);
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      /* tiny bright center point */
      ctx.fillStyle = "rgba(255,255,245," + (flicker * 0.97) + ")";
      ctx.beginPath();
      ctx.arc(cx, cy, 2.1 * flicker, 0, TAU);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";

    /* Heat shimmer layer on HD canvas */
    hctx.clearRect(0, 0, W, H);
    for (var hd = 0; hd < HDMAX; hd++) {
      var hdCell = hdCells[hd];
      if (!hdCell.alive) continue;
      hdCell.age += dt;
      if (hdCell.age >= hdCell.life) { hdCell.alive = false; continue; }
      var tp9 = hdCell.age / hdCell.life;
      var r6 = hdCell.str * 20 * (1 - tp9 * 0.4);
      var a11 = (1 - tp9) * 0.11;
      var g4 = hctx.createRadialGradient(hdCell.x, hdCell.y, 0, hdCell.x, hdCell.y, r6);
      g4.addColorStop(0, "rgba(255,140,30," + a11 + ")");
      g4.addColorStop(0.5, "rgba(170,40,0," + (a11 * 0.4) + ")");
      g4.addColorStop(1, "rgba(0,0,0,0)");
      hctx.fillStyle = g4;
      hctx.beginPath();
      hctx.arc(hdCell.x, hdCell.y, r6, 0, TAU);
      hctx.fill();
    }
  }

  requestAnimationFrame(frame);
})();
