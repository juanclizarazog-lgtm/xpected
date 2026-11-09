/*
 * Xpected · escenas 3D (Three.js, carga diferida con import()).
 *  - hero:   balón holográfico con núcleo de Fresnel, anillos orbitales cuyo arco ES la probabilidad 1X2
 *            del partido destacado (se actualiza con cada mensaje en vivo), polvo estelar y fragmentos.
 *            Interactivo: paralaje con el mouse, arrastrar para girar con inercia, clic para un impulso.
 *  - matrix: holo-matriz 3D de marcadores (6×6 barras = probabilidad de cada resultado) con órbita,
 *            rotación automática y tooltip al pasar el mouse.
 * Si WebGL o la red fallan, las páginas usan su versión 2D. Movimiento reducido = fotograma estático.
 */
(function () {
  'use strict';
  const XP = window.XP;
  const three = (XP.three = {});
  let libP = null;

  function load() {
    if (!libP) {
      libP = Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')])
        .then(([T, OC]) => ({ T, OrbitControls: OC.OrbitControls }));
      libP.catch(() => { libP = null; });
    }
    return libP;
  }
  three.load = load;
  three.available = function () {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  };
  const css = (name, fb) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;

  function glowTexture(T, color) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, color); grd.addColorStop(0.25, color + 'aa'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }
  function hexOf(T, v) { return '#' + new T.Color(v).getHexString(); }

  // ═══════════════════════════════ HERO ═══════════════════════════════
  three.hero = async function (host, opts) {
    if (!three.available()) return null;
    let lib;
    try { lib = await load(); } catch (e) { console.warn('[3D] Three.js no disponible:', e.message); return null; }
    if (!host.isConnected) return null;
    const T = lib.T;
    const reduced = () => XP.reducedMotion();
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = 'gl-canvas';
    host.appendChild(renderer.domElement);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(40, 1, 0.1, 120);
    camera.position.set(0, 0, 9);
    const world = new T.Group(); scene.add(world);
    const ball = new T.Group(); world.add(ball);

    let C = {};
    const readColors = () => { C = { a: new T.Color(css('--accent', '#C8FF2E')), b: new T.Color(css('--accent-2', '#7C5CFF')), c: new T.Color(css('--accent-3', '#22D3EE')), h: new T.Color(css('--home', '#5CA8FF')), d: new T.Color(css('--draw', '#8D96A5')), w: new T.Color(css('--away', '#FF8A3D')) }; };
    readColors();

    // núcleo con Fresnel + ondulación (reacciona al audio)
    const coreMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { c1: { value: C.a.clone() }, c2: { value: C.b.clone() }, uTime: { value: 0 }, uPulse: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform float uTime; uniform float uPulse;\n' +
        'void main(){ vec3 p = position; float w = sin(p.x*3.1+uTime*1.3)*sin(p.y*2.7+uTime*1.1)*sin(p.z*3.3+uTime*0.9);\n' +
        ' p += normal * w * (0.045 + uPulse*0.16); vec4 mv = modelViewMatrix*vec4(p,1.0);\n' +
        ' vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vP = p; gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform vec3 c1; uniform vec3 c2; uniform float uTime; uniform float uPulse;\n' +
        'void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.4); float bands = 0.5 + 0.5*sin(vP.y*9.0 - uTime*1.6);\n' +
        ' vec3 col = mix(c2*0.55, c1, f) * (0.45 + f*1.7 + uPulse*0.6) + c1*bands*0.05; gl_FragColor = vec4(col, 0.35 + f*0.65); }',
    });
    const core = new T.Mesh(new T.IcosahedronGeometry(1.22, 20), coreMat);
    ball.add(core);
    const shellGeo = new T.IcosahedronGeometry(1.55, 1);
    const edgeMat = new T.LineBasicMaterial({ color: C.a, transparent: true, opacity: 0.9, blending: T.AdditiveBlending });
    ball.add(new T.LineSegments(new T.EdgesGeometry(shellGeo), edgeMat));
    const nodeMat = new T.PointsMaterial({ color: C.a, size: 0.085, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
    ball.add(new T.Points(shellGeo, nodeMat));
    const pentMat = new T.MeshBasicMaterial({ color: C.c, wireframe: true, transparent: true, opacity: 0.22, blending: T.AdditiveBlending });
    ball.add(new T.Mesh(new T.DodecahedronGeometry(1.42, 0), pentMat));
    const haloMat = new T.SpriteMaterial({ map: glowTexture(T, hexOf(T, C.b)), transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false });
    const halo = new T.Sprite(haloMat); halo.scale.set(7, 7, 1); world.add(halo);

    // anillos orbitales = probabilidades 1X2
    const ringsG = new T.Group(); world.add(ringsG);
    const RD = [{ r: 2.3, tilt: [1.25, 0.18, 0], spin: 0.22, key: 'h' }, { r: 2.68, tilt: [1.5, -0.38, 0.42], spin: -0.16, key: 'd' }, { r: 3.06, tilt: [1.02, 0.52, -0.32], spin: 0.12, key: 'w' }];
    const rings = RD.map((d) => {
      const g = new T.Group(); g.rotation.set(d.tilt[0], d.tilt[1], d.tilt[2]);
      const track = new T.Mesh(new T.TorusGeometry(d.r, 0.005, 6, 220), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 }));
      const mat = new T.MeshBasicMaterial({ color: C[d.key], transparent: true, opacity: 0.95, blending: T.AdditiveBlending });
      const arc = new T.Mesh(new T.TorusGeometry(d.r, 0.032, 10, 160, Math.PI * 0.6), mat);
      const head = new T.Mesh(new T.SphereGeometry(0.075, 16, 16), mat);
      const headGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(T, hexOf(T, C[d.key])), transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
      headGlow.scale.set(0.7, 0.7, 1);
      head.add(headGlow);
      g.add(track, arc, head);
      ringsG.add(g);
      return { g, arc, head, headGlow, d, mat, cur: 0.3, target: 0.3, built: 0.3 };
    });
    function buildArc(r) {
      const p = Math.max(0.01, r.cur);
      r.arc.geometry.dispose();
      r.arc.geometry = new T.TorusGeometry(r.d.r, 0.032, 10, Math.max(16, Math.round(160 * p)), Math.PI * 2 * p);
      const a = Math.PI * 2 * p;
      r.head.position.set(Math.cos(a) * r.d.r, Math.sin(a) * r.d.r, 0);
      r.built = r.cur;
    }
    rings.forEach(buildArc);

    // polvo estelar
    const N = window.innerWidth < 700 ? 1100 : 2400;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const palette = [C.a, C.b, C.c, new T.Color(0xffffff)];
    for (let i = 0; i < N; i++) {
      const r = 5 + Math.pow(Math.random(), 0.7) * 16, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.6; pos[i * 3 + 2] = r * Math.cos(ph) - 4;
      const c = palette[i % 4]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const starGeo = new T.BufferGeometry();
    starGeo.setAttribute('position', new T.BufferAttribute(pos, 3));
    starGeo.setAttribute('color', new T.BufferAttribute(col, 3));
    const starMat = new T.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false });
    const stars = new T.Points(starGeo, starMat); scene.add(stars);

    // fragmentos de datos orbitando
    const shards = [];
    const shardMat = new T.MeshBasicMaterial({ color: C.c, wireframe: true, transparent: true, opacity: 0.7 });
    for (let i = 0; i < 22; i++) {
      const m = new T.Mesh(new T.OctahedronGeometry(0.06 + Math.random() * 0.12, 0), shardMat);
      const o = { m, r: 3.5 + Math.random() * 1.8, a: Math.random() * Math.PI * 2, y: (Math.random() - 0.5) * 2.6, s: (0.08 + Math.random() * 0.2) * (Math.random() < 0.5 ? -1 : 1) };
      shards.push(o); world.add(m);
    }

    // onda expansiva al hacer clic
    const waves = [];
    function shockwave() {
      const w = new T.Mesh(new T.RingGeometry(1.6, 1.68, 96), new T.MeshBasicMaterial({ color: C.a, transparent: true, opacity: 0.9, side: T.DoubleSide, blending: T.AdditiveBlending }));
      w.lookAt(camera.position);
      ball.parent.add(w); w.position.copy(ball.position);
      waves.push({ w, t: 0 });
    }

    // ── interacción ──
    const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
    const spin = { vx: 0.0035, vy: 0.006, drag: false, lx: 0, ly: 0 };
    const ray = new T.Raycaster(), ndc = new T.Vector2();
    let hover = 0, hoverT = 0, impulse = 0;
    const onMove = (e) => {
      ptr.tx = (e.clientX / window.innerWidth) * 2 - 1;
      ptr.ty = (e.clientY / window.innerHeight) * 2 - 1;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (spin.drag) {
        spin.vy += (e.clientX - spin.lx) * 0.00045; spin.vx += (e.clientY - spin.ly) * 0.00045;
        spin.lx = e.clientX; spin.ly = e.clientY;
      }
    };
    const onDown = (e) => {
      ray.setFromCamera(ndc, camera);
      if (ray.intersectObject(core).length) {
        spin.drag = true; spin.lx = e.clientX; spin.ly = e.clientY;
        host.classList.add('grabbing');
        impulse = 1; shockwave();
        if (XP.audio) XP.audio.ui('click');
        if (opts && opts.onBallClick) opts.onBallClick();
      }
    };
    const onUp = () => { spin.drag = false; host.classList.remove('grabbing'); };
    window.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);

    // ── tamaño y composición ──
    let W = 1, H = 1, layoutX = 0, layoutY = 0, layoutS = 1;
    function resize() {
      W = host.clientWidth || 1; H = host.clientHeight || 1;
      renderer.setSize(W, H, false);
      camera.aspect = W / H; camera.updateProjectionMatrix();
      const wide = W / H > 1.15;
      layoutX = wide ? Math.min(4.1, 1.7 + (W / H - 1) * 2.4) : 0;
      layoutY = wide ? 0.1 : 1.5;
      layoutS = wide ? 0.95 : 0.62;
      if (!loopOn) render(0);
    }
    const ro = new ResizeObserver(resize); ro.observe(host);

    // ── bucle ──
    let raf = 0, loopOn = false, visible = true, paused = false, t0 = performance.now();
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; sync(); });
    io.observe(host);
    function sync() {
      const should = visible && !paused && !reduced() && document.visibilityState === 'visible';
      if (should && !loopOn) { loopOn = true; t0 = performance.now(); raf = requestAnimationFrame(frame); }
      if (!should && loopOn) { loopOn = false; cancelAnimationFrame(raf); render(0); }
    }
    document.addEventListener('visibilitychange', sync);

    function render(dt) {
      const time = performance.now() / 1000;
      const lvl = XP.audio ? XP.audio.level() : 0;
      const scrollP = Math.min(1, window.scrollY / Math.max(1, H));
      ptr.x += (ptr.tx - ptr.x) * 0.05; ptr.y += (ptr.ty - ptr.y) * 0.05;
      camera.position.x = ptr.x * 0.9; camera.position.y = -ptr.y * 0.6 + scrollP * 0.4;
      camera.lookAt(world.position.x * 0.35, world.position.y * 0.35, 0);
      world.position.x = layoutX; world.position.y = layoutY + scrollP * 1.8;
      const s = layoutS * (1 - scrollP * 0.25);
      world.scale.setScalar(s);
      if (!spin.drag) { spin.vx += (0.0035 - spin.vx) * 0.02; spin.vy += (0.006 - spin.vy) * 0.02; }
      ball.rotation.x += spin.vx * dt * 60; ball.rotation.y += spin.vy * dt * 60;
      ray.setFromCamera(ndc, camera);
      hoverT = ray.intersectObject(core).length ? 1 : 0;
      hover += (hoverT - hover) * 0.1;
      host.classList.toggle('over-ball', hoverT > 0);
      impulse *= 0.94;
      coreMat.uniforms.uTime.value = time;
      coreMat.uniforms.uPulse.value = Math.min(1.4, lvl * 1.6 + hover * 0.35 + impulse * 0.8);
      ball.scale.setScalar(1 + hover * 0.05 + impulse * 0.08 + lvl * 0.06);
      halo.material.opacity = 0.4 + lvl * 0.5 + hover * 0.15;
      halo.scale.setScalar(6.5 + lvl * 2 + impulse * 1.5);
      rings.forEach((r, i) => {
        r.g.rotation.z += r.d.spin * dt * (1 + impulse * 3);
        r.cur += (r.target - r.cur) * (dt ? 0.06 : 1);
        if (Math.abs(r.cur - r.built) > 0.002) buildArc(r);
        r.headGlow.material.opacity = 0.6 + Math.sin(time * 2 + i) * 0.25 + lvl * 0.3;
      });
      ringsG.rotation.y = ptr.x * 0.25; ringsG.rotation.x = ptr.y * 0.15;
      stars.rotation.y += 0.0004 * dt * 60; stars.rotation.x = ptr.y * 0.05;
      shards.forEach((o) => { o.a += o.s * dt; o.m.position.set(Math.cos(o.a) * o.r, o.y + Math.sin(o.a * 2) * 0.2, Math.sin(o.a) * o.r); o.m.rotation.x += 0.02; o.m.rotation.y += 0.03; });
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i]; w.t += dt;
        w.w.scale.setScalar(1 + w.t * 3.2); w.w.material.opacity = Math.max(0, 0.9 - w.t * 1.1);
        if (w.t > 0.9) { w.w.parent.remove(w.w); w.w.geometry.dispose(); w.w.material.dispose(); waves.splice(i, 1); }
      }
      renderer.render(scene, camera);
    }
    function frame(now) {
      if (!loopOn) return;
      const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
      render(dt);
      raf = requestAnimationFrame(frame);
    }

    resize(); sync();
    const offSettings = XP.bus.on('settings', () => { recolor(); sync(); });

    function recolor() {
      readColors();
      coreMat.uniforms.c1.value.copy(C.a); coreMat.uniforms.c2.value.copy(C.b);
      edgeMat.color.copy(C.a); nodeMat.color.copy(C.a); pentMat.color.copy(C.c); shardMat.color.copy(C.c);
      haloMat.map.dispose(); haloMat.map = glowTexture(T, hexOf(T, C.b)); haloMat.needsUpdate = true;
      rings.forEach((r) => { r.mat.color.copy(C[r.d.key]); r.headGlow.material.map.dispose(); r.headGlow.material.map = glowTexture(T, hexOf(T, C[r.d.key])); r.headGlow.material.needsUpdate = true; });
      if (!loopOn) render(0);
    }

    return {
      setProbs(ps) { rings.forEach((r, i) => { r.target = ps[i]; if (reduced()) { r.cur = ps[i]; buildArc(r); } }); if (!loopOn) render(0); },
      pulse() { impulse = 1; shockwave(); },
      setPaused(v) { paused = v; sync(); },
      recolor,
      dispose() {
        loopOn = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); offSettings();
        document.removeEventListener('visibilitychange', sync);
        window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
        scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
        renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
      },
    };
  };

  // ═══════════════════════════════ HOLO-MATRIZ ═══════════════════════════════
  three.matrix = async function (host, m) {
    if (!three.available()) return null;
    let lib;
    try { lib = await load(); } catch (e) { return null; }
    if (!host.isConnected) return null;
    const T = lib.T;
    const reduced = () => XP.reducedMotion();
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = 'gl-canvas';
    host.appendChild(renderer.domElement);
    const tip = document.createElement('div'); tip.className = 'holo-tip'; tip.hidden = true; host.appendChild(tip);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(6.3, 6.4, 7.6);
    const controls = new lib.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.9, 0);
    controls.enableZoom = false; controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minPolarAngle = 0.45; controls.maxPolarAngle = 1.35;
    controls.autoRotate = !reduced(); controls.autoRotateSpeed = 0.8;

    const A = new T.Color(css('--accent', '#C8FF2E')), B = new T.Color(css('--accent-2', '#7C5CFF')), Cc = new T.Color(css('--accent-3', '#22D3EE'));
    scene.add(new T.AmbientLight(0xffffff, 0.55));
    const dl = new T.DirectionalLight(0xffffff, 1.6); dl.position.set(5, 10, 6); scene.add(dl);
    const pl = new T.PointLight(A, 25, 18); pl.position.set(0, 4.5, 0); scene.add(pl);
    const pl2 = new T.PointLight(B, 18, 18); pl2.position.set(-5, 2, -4); scene.add(pl2);

    const turf = new T.Color('#2f8a5a'); const grid = new T.GridHelper(7.4, 6, turf, turf);
    grid.material.transparent = true; grid.material.opacity = 0.35; scene.add(grid);
    const plate = new T.Mesh(new T.PlaneGeometry(7.6, 7.6), new T.MeshBasicMaterial({ color: new T.Color('#0d2b1f'), transparent: true, opacity: 0.85 }));
    plate.rotation.x = -Math.PI / 2; plate.position.y = -0.01; scene.add(plate);

    const bars = [];
    const geo = new T.BoxGeometry(0.86, 1, 0.86); geo.translate(0, 0.5, 0);
    for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) {
      const mat = new T.MeshStandardMaterial({ color: Cc.clone(), emissive: Cc.clone(), emissiveIntensity: 0.25, metalness: 0.35, roughness: 0.3, transparent: true, opacity: 0.93 });
      const mesh = new T.Mesh(geo, mat);
      mesh.position.set((y - 2.5) * 1.23, 0, (x - 2.5) * 1.23);
      mesh.scale.y = 0.02;
      const edges = new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }));
      mesh.add(edges);
      mesh.userData = { x, y, cur: 0.02, target: 0.02, p: 0 };
      scene.add(mesh); bars.push(mesh);
    }

    const textColor = css('--text', '#F2F4F7');
    function label(text, size, color) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128;
      const g = c.getContext('2d'); g.font = '600 ' + (size || 64) + 'px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = color || textColor; g.fillText(text, 128, 64);
      const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
      const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.scale.set(1.2, 0.6, 1); return s;
    }
    const labels = [];
    const D = XP.data;
    function placeLabels() {
      labels.forEach((l) => { scene.remove(l); l.material.map.dispose(); l.material.dispose(); });
      labels.length = 0;
      const off = m.status === 'previa' ? [0, 0] : m.score;
      for (let i = 0; i < 6; i++) {
        const a = label(String(i + off[1]), 60); a.position.set((i - 2.5) * 1.23, 0.05, 4.3); labels.push(a);
        const b = label(String(i + off[0]), 60); b.position.set(-4.3, 0.05, (i - 2.5) * 1.23); labels.push(b);
      }
      const ha = label(D.teams[m.home].code + ' ↓', 52, css('--home', '#5CA8FF')); ha.position.set(-4.4, 0.05, -4.4); ha.scale.set(1.6, 0.8, 1); labels.push(ha);
      const aa = label(D.teams[m.away].code + ' →', 52, css('--away', '#FF8A3D')); aa.position.set(4.4, 0.05, 4.4); aa.scale.set(1.6, 0.8, 1); labels.push(aa);
      labels.forEach((l) => scene.add(l));
    }

    function update(mm) {
      m = mm;
      const M = m.matrix;
      let max = 0;
      for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) max = Math.max(max, M[x][y]);
      bars.forEach((b) => {
        const p = M[b.userData.x][b.userData.y];
        const t = p / max;
        b.userData.p = p;
        b.userData.target = 0.04 + t * 3.3;
        const c = Cc.clone().lerp(A, Math.pow(t, 0.8));
        b.material.color.copy(c); b.material.emissive.copy(c);
        b.material.emissiveIntensity = 0.15 + t * 0.55;
        if (reduced()) { b.userData.cur = b.userData.target; b.scale.y = b.userData.cur; }
      });
      placeLabels();
      if (!loopOn) render();
    }

    // tooltip
    const ray = new T.Raycaster(), ndc = new T.Vector2();
    let hovered = null;
    const onMove = (e) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(bars, false)[0];
      const obj = hit ? hit.object : null;
      if (obj !== hovered) {
        if (hovered) hovered.scale.x = hovered.scale.z = 1;
        hovered = obj;
        if (hovered) { hovered.scale.x = hovered.scale.z = 1.1; if (XP.audio) XP.audio.ui('tick'); }
      }
      if (hovered) {
        const off = m.status === 'previa' ? [0, 0] : m.score;
        tip.hidden = false;
        tip.textContent = (hovered.userData.x + off[0]) + '–' + (hovered.userData.y + off[1]) + ' · ' + XP.fmt.prob(hovered.userData.p);
        tip.style.transform = 'translate(' + (e.clientX - r.left + 14) + 'px,' + (e.clientY - r.top - 10) + 'px)';
      } else tip.hidden = true;
      if (!loopOn) render();
    };
    const onLeave = () => { tip.hidden = true; if (hovered) hovered.scale.x = hovered.scale.z = 1; hovered = null; };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', onLeave);
    // fuera del bucle (movimiento reducido o fuera de pantalla) se renderiza a demanda, una vez por cuadro
    let pending = false, rendering = false;
    controls.addEventListener('change', () => {
      if (loopOn || rendering || pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; render(); });
    });

    function resize() {
      const W = host.clientWidth || 1, H = host.clientHeight || 1;
      renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
      if (!loopOn) render();
    }
    const ro = new ResizeObserver(resize); ro.observe(host);

    let raf = 0, loopOn = false, visible = true;
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; sync(); });
    io.observe(host);
    function sync() {
      controls.autoRotate = !reduced();
      const should = visible && !reduced() && document.visibilityState === 'visible';
      if (should && !loopOn) { loopOn = true; raf = requestAnimationFrame(frame); }
      if (!should && loopOn) { loopOn = false; cancelAnimationFrame(raf); render(); }
    }
    document.addEventListener('visibilitychange', sync);
    function render() {
      rendering = true;
      bars.forEach((b) => { b.userData.cur += (b.userData.target - b.userData.cur) * 0.1; b.scale.y = Math.max(0.02, b.userData.cur); });
      const lvl = XP.audio ? XP.audio.level() : 0;
      pl.intensity = 25 + lvl * 40;
      controls.update();
      renderer.render(scene, camera);
      rendering = false;
    }
    function frame() { if (!loopOn) return; render(); raf = requestAnimationFrame(frame); }

    update(m); resize(); sync();
    const offSettings = XP.bus.on('settings', sync);
    return {
      update,
      dispose() {
        loopOn = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); offSettings(); controls.dispose();
        document.removeEventListener('visibilitychange', sync);
        scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
        renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); tip.remove();
      },
    };
  };
})();
