/*
 * Xpected · escenario 3D persistente: "Estadio de noche".
 * Un solo lienzo WebGL detrás de toda la app, con lenguaje de transmisión deportiva y de apuestas:
 *  - Cancha con césped cortado en franjas y líneas que brillan con el color de la marca.
 *  - Tres COLUMNAS DE LUZ = probabilidad 1X2 del partido en foco (local · empate · visitante); su altura se
 *    transforma (morph) al cambiar de partido o al pasar el mouse por una tarjeta.
 *  - Balón real (patrón de 12 pentágonos y 20 hexágonos) que rueda hacia el favorito.
 *  - Tableros LED perimetrales con las cuotas en vivo desplazándose.
 *  - Torres de iluminación con haces de luz y público con flashes de celular en las tribunas.
 *  - Arrastra el balón y suéltalo para patear; si entra entre los palos: red que ondula y destello.
 *  - Gol real en vivo: la red del arco correspondiente ondula, los reflectores destellan y el público brilla.
 *  - Cambio de cuota: el tablero LED destella y la columna del resultado late.
 *  - Coreografía de cámara por página (plano de transmisión, cámara táctica, cámara baja, plano cenital).
 * Movimiento reducido: un fotograma fijo que solo se redibuja cuando cambian los datos.
 */
(function () {
  'use strict';
  const XP = window.XP;
  const D = () => XP.data;
  const css = (n, fb) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
  const stage = (XP.stage = { ready: false, mode: 'calm', focusId: null, hoverId: null, paused: false });
  const INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role="tab"],.match-card,.table-wrap,.chart,.holo,.dock,.modal,.cookie-bar,.ticker,.slip';

  // medidas estilizadas (1 unidad ≈ 5 m, balón y arcos exagerados para que sean protagonistas)
  const HL = 10.5, HW = 6.8, GOAL_W = 1.7, GOAL_H = 1.25, GOAL_D = 1.0, BALL_R = 0.55;

  let T, renderer, scene, camera, world, pitch, pitchMat, ball, ballMat, crowd, crowdMat, led, ledCtx, ledTex, ledCanvas;
  let pillars = [], towers = [], nets = [], aim, aimMat;
  let C = {};
  const cur = { o: 0, wx: 3, ry: -0.4, cx: 0, cy: 5, cz: 13, lx: 0, ly: 0.4, lz: 0, s: 1 };
  let tgt = Object.assign({}, cur, { o: 1 });
  const ptr = { nx: 0, ny: 0, sx: 0, sy: 0 };
  const b = { x: 0, z: 0.5, vx: 0, vz: 0, y: BALL_R, vy: 0, lastKick: -99, goal: null, drag: false, downAt: 0, moved: 0, sx: 0, sy: 0 };
  let flash = 0, roar = 0, hoverBall = 0, ledFlash = 0, lastLedSig = '';
  let raf = 0, looping = false, lastT = 0, frameN = 0, acc = 0, slowFrames = 0, dprCap = 1.5, clockT = 0;
  const ray = {};

  function readColors() {
    C = { a: new T.Color(css('--accent', '#C8FF2E')), b: new T.Color(css('--accent-2', '#7C5CFF')), c: new T.Color(css('--accent-3', '#22D3EE')), h: new T.Color(css('--home', '#5CA8FF')), d: new T.Color('#E8ECF2'), w: new T.Color(css('--away', '#FF8A3D')), bg: new T.Color(css('--bg', '#05060A')) };
  }
  const hex = (c) => '#' + new T.Color(c).getHexString();
  function teamColor(teamId, fallback) {
    const t = D().teams[teamId];
    if (!t || !t.color || /^#(fff|ffffff|000|000000)$/i.test(t.color)) return fallback.clone();
    const col = new T.Color(t.color); const hsl = {}; col.getHSL(hsl);
    if (hsl.l < 0.45) col.setHSL(hsl.h, Math.max(0.55, hsl.s), 0.56);
    return col;
  }

  // ── texturas procedurales ────────────────────────────────────────────────────
  function pitchTextures() {
    const W = 2048, H = Math.round(2048 * (HW / HL)), m = W / (HL * 2 * 5); // píxeles por metro
    const grass = document.createElement('canvas'); grass.width = W; grass.height = H;
    const g = grass.getContext('2d');
    for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? '#0d2b1f' : '#0a2419'; g.fillRect((i * W) / 14, 0, W / 14 + 1, H); }
    // ruido de césped
    const img = g.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 10; img.data[i] += n * 0.5; img.data[i + 1] += n; img.data[i + 2] += n * 0.5; }
    g.putImageData(img, 0, 0);
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    const lines = document.createElement('canvas'); lines.width = W; lines.height = H;
    const l = lines.getContext('2d');
    [g, l].forEach((c) => {
      c.strokeStyle = c === g ? 'rgba(235,245,240,0.82)' : '#ffffff'; c.lineWidth = 6; c.fillStyle = c.strokeStyle;
      const p = 14;
      c.strokeRect(p, p, W - 2 * p, H - 2 * p);
      c.beginPath(); c.moveTo(W / 2, p); c.lineTo(W / 2, H - p); c.stroke();
      c.beginPath(); c.arc(W / 2, H / 2, 9.15 * m, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(W / 2, H / 2, 8, 0, Math.PI * 2); c.fill();
      [0, 1].forEach((side) => {
        const x0 = side ? W - p : p, dir = side ? -1 : 1;
        const box = (d, w) => c.strokeRect(side ? x0 - d * m : x0, H / 2 - (w * m) / 2, d * m, w * m);
        box(16.5, 40.3); box(5.5, 18.3);
        c.beginPath(); c.arc(x0 + dir * 11 * m, H / 2, 6, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(x0 + dir * 11 * m, H / 2, 9.15 * m, side ? Math.PI - 0.93 : -0.93, side ? Math.PI + 0.93 : 0.93); c.stroke();
      });
    });
    const tg = new T.CanvasTexture(grass); tg.colorSpace = T.SRGBColorSpace; tg.anisotropy = 8;
    const tl = new T.CanvasTexture(lines); tl.colorSpace = T.SRGBColorSpace;
    return { tg, tl };
  }
  function labelTexture(top, bottom, color) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
    const g = cv.getContext('2d');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 18;
    g.fillStyle = '#ffffff'; g.font = '800 76px Unbounded, Inter, sans-serif'; g.fillText(top, 128, 62);
    g.shadowBlur = 0; g.fillStyle = color; g.font = '700 34px Inter, sans-serif'; g.fillText(bottom, 128, 128);
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; return t;
  }

  // ── construcción ─────────────────────────────────────────────────────────────
  function build(host) {
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = 'stage-canvas';
    renderer.domElement.style.opacity = '0';
    host.appendChild(renderer.domElement);
    readColors();
    scene = new T.Scene();
    scene.fog = new T.Fog(C.bg, 16, 42);
    camera = new T.PerspectiveCamera(38, 1, 0.1, 140);
    world = new T.Group(); scene.add(world);

    scene.add(new T.HemisphereLight(0xb8d4ff, 0x0b1a12, 0.55));
    const key = new T.DirectionalLight(0xffffff, 0.9); key.position.set(-6, 12, 8); scene.add(key);

    // cancha
    const { tg, tl } = pitchTextures();
    pitchMat = new T.MeshStandardMaterial({ map: tg, emissiveMap: tl, emissive: C.a.clone(), emissiveIntensity: 0.32, roughness: 0.95, metalness: 0 });
    pitch = new T.Mesh(new T.PlaneGeometry(HL * 2 + 0.5, HW * 2 + 0.4), pitchMat);
    pitch.rotation.x = -Math.PI / 2; world.add(pitch);
    const apron = new T.Mesh(new T.PlaneGeometry(HL * 2 + 9, HW * 2 + 8), new T.MeshStandardMaterial({ color: 0x061510, roughness: 1 }));
    apron.rotation.x = -Math.PI / 2; apron.position.y = -0.01; world.add(apron);

    // arcos con red que ondula
    [-1, 1].forEach((side) => world.add(goal(side)));

    // columnas de luz 1X2
    [{ x: -6.3, key: 'h' }, { x: 0, key: 'd' }, { x: 6.3, key: 'w' }].forEach((d) => pillars.push(pillar(d)));

    // balón (Voronoi de 12 pentágonos + 20 hexágonos en el shader)
    const ico = new T.IcosahedronGeometry(1, 0);
    const P = ico.attributes.position, verts = [], centers = [];
    for (let i = 0; i < P.count; i++) { const v = new T.Vector3().fromBufferAttribute(P, i).normalize(); if (!verts.some((u) => u.distanceTo(v) < 1e-3)) verts.push(v); }
    for (let i = 0; i < P.count; i += 3) centers.push(new T.Vector3().fromBufferAttribute(P, i).add(new T.Vector3().fromBufferAttribute(P, i + 1)).add(new T.Vector3().fromBufferAttribute(P, i + 2)).normalize());
    ballMat = new T.ShaderMaterial({
      uniforms: { uC: { value: verts.concat(centers) }, uLight: { value: new T.Vector3(0.4, 0.8, 0.5) }, uRim: { value: C.a.clone() }, uGlow: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vL; varying vec3 vV; void main(){ vL = normalize(position); vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uC[32]; uniform vec3 uLight; uniform vec3 uRim; uniform float uGlow; varying vec3 vN; varying vec3 vL; varying vec3 vV;\n' +
        'void main(){ float d1 = -2.0; float d2 = -2.0; int i1 = 0;\n' +
        ' for (int i = 0; i < 32; i++) { float d = dot(vL, uC[i]); if (d > d1) { d2 = d1; d1 = d; i1 = i; } else if (d > d2) { d2 = d; } }\n' +
        ' vec3 base = i1 < 12 ? vec3(0.05, 0.06, 0.08) : vec3(0.92, 0.94, 0.96);\n' +
        ' float seam = 1.0 - smoothstep(0.003, 0.011, d1 - d2); base = mix(base, vec3(0.18, 0.19, 0.22), seam * 0.85);\n' +
        ' vec3 L = normalize(uLight); float diff = max(dot(vN, L), 0.0) * 0.8 + 0.22;\n' +
        ' float spec = pow(max(dot(reflect(-L, vN), vV), 0.0), 28.0) * 0.45; float rim = pow(1.0 - max(dot(vN, vV), 0.0), 3.0);\n' +
        ' gl_FragColor = vec4(base * diff + spec + uRim * rim * (0.55 + uGlow), 1.0); }',
    });
    ball = new T.Mesh(new T.SphereGeometry(BALL_R, 64, 48), ballMat);
    world.add(ball);
    const shadow = new T.Mesh(new T.CircleGeometry(BALL_R * 1.1, 32), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012; world.add(shadow); ball.userData.shadow = shadow;
    aimMat = new T.LineDashedMaterial({ color: C.a, dashSize: 0.25, gapSize: 0.15, transparent: true, opacity: 0 });
    aim = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(1, 0, 0)]), aimMat); world.add(aim);

    // torres de iluminación con haces
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => towers.push(tower(sx, sz)));

    // tablero LED con cuotas
    ledCanvas = document.createElement('canvas'); ledCanvas.width = 4096; ledCanvas.height = 96;
    ledCtx = ledCanvas.getContext('2d');
    ledTex = new T.CanvasTexture(ledCanvas); ledTex.colorSpace = T.SRGBColorSpace; ledTex.wrapS = T.RepeatWrapping;
    ledTex.repeat.set(1.6, 1);
    const ledMat = new T.MeshBasicMaterial({ map: ledTex, transparent: true, opacity: 0.95 });
    led = new T.Mesh(new T.PlaneGeometry(HL * 2 + 2, 0.62), ledMat);
    led.position.set(0, 0.34, -HW - 1.0); world.add(led);
    const ledSide = led.clone(); ledSide.material = ledMat; ledSide.rotation.y = Math.PI / 2; ledSide.position.set(-HL - 1.4, 0.34, 0); ledSide.scale.x = 0.62; world.add(ledSide);
    drawLed(true);

    // público: flashes de celular en las tribunas
    const N = window.innerWidth < 700 ? 900 : 2200;
    const pos = new Float32Array(N * 3), ph = new Float32Array(N), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, tier = Math.random();
      const rx = HL + 2.6 + tier * 4.5, rz = HW + 2.4 + tier * 4.2;
      pos[i * 3] = Math.cos(a) * rx; pos[i * 3 + 1] = 0.4 + tier * 4 + Math.random() * 0.3; pos[i * 3 + 2] = Math.sin(a) * rz;
      ph[i] = Math.random() * 100;
      const warm = Math.random();
      const c = warm < 0.7 ? new T.Color(1, 0.95, 0.85) : warm < 0.85 ? C.a : C.h;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const cg = new T.BufferGeometry();
    cg.setAttribute('position', new T.BufferAttribute(pos, 3)); cg.setAttribute('aPh', new T.BufferAttribute(ph, 1)); cg.setAttribute('aCol', new T.BufferAttribute(col, 3));
    crowdMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uRoar: { value: 0 }, uScale: { value: 1 } },
      vertexShader: 'attribute float aPh; attribute vec3 aCol; varying vec3 vC; varying float vA; uniform float uTime; uniform float uRoar; uniform float uScale;\n' +
        'void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); float tw = 0.5 + 0.5*sin(uTime*(1.5+fract(aPh)*3.0) + aPh);\n' +
        ' float on = step(0.82 - uRoar*0.5, fract(aPh*7.13 + floor(uTime*0.6 + aPh)*0.37));\n' +
        ' vA = (0.15 + tw*0.35) * (0.35 + on*0.9 + uRoar); vC = aCol; gl_PointSize = uScale * (1.0 + on*1.6 + uRoar*2.0) * (18.0 / -mv.z); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.0, d)); }',
    });
    crowd = new T.Points(cg, crowdMat); world.add(crowd);

    ray.r = new T.Raycaster(); ray.ndc = new T.Vector2(9, 9); ray.plane = new T.Plane(new T.Vector3(0, 1, 0), -BALL_R * 0.3); ray.hit = new T.Vector3();
    resize();
  }

  function goal(side) {
    const g = new T.Group();
    const x = side * HL;
    const postMat = new T.MeshStandardMaterial({ color: 0xf2f5f8, emissive: 0x334455, roughness: 0.4 });
    const post = (px, pz, h) => { const m = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, h, 12), postMat); m.position.set(px, h / 2, pz); g.add(m); };
    post(x, -GOAL_W, GOAL_H); post(x, GOAL_W, GOAL_H);
    const bar = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, GOAL_W * 2, 12), postMat); bar.rotation.x = Math.PI / 2; bar.position.set(x, GOAL_H, 0); g.add(bar);
    // red: rejilla en el fondo, techo y laterales
    const pts = [], step = 0.14, back = x + side * GOAL_D;
    for (let z = -GOAL_W; z <= GOAL_W + 1e-6; z += step) { pts.push(back, 0, z, back, GOAL_H * 0.85, z); pts.push(x, GOAL_H, z, back, GOAL_H * 0.85, z); }
    for (let y = 0; y <= GOAL_H * 0.85 + 1e-6; y += step) { pts.push(back, y, -GOAL_W, back, y, GOAL_W); }
    for (let t = 0; t <= 1.0001; t += 0.14) { const xx = x + side * GOAL_D * t, yy = GOAL_H - (GOAL_H * 0.15) * t; pts.push(xx, yy, -GOAL_W, xx, yy, GOAL_W); [-GOAL_W, GOAL_W].forEach((z) => pts.push(xx, 0, z, xx, yy, z)); }
    const geo = new T.BufferGeometry(); const arr = new Float32Array(pts);
    geo.setAttribute('position', new T.BufferAttribute(arr, 3));
    const net = new T.LineSegments(geo, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
    g.add(net);
    nets.push({ side, net, base: arr.slice(), t: 9 });
    return g;
  }

  function pillar(d) {
    const g = new T.Group(); g.position.set(d.x, 0, -1.4);
    const beamMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { uColor: { value: C[d.key].clone() }, uPulse: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uPulse; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;\n' +
        'void main(){ float edge = pow(1.0 - abs(dot(vN, vV)), 1.6); float fall = pow(1.0 - vUv.y, 0.7);\n' +
        ' float scan = 0.85 + 0.15*sin(vUv.y*40.0 - uTime*4.0); float top = smoothstep(0.93, 1.0, vUv.y) * 0.9;\n' +
        ' float a = (0.18 + edge*0.65) * fall * scan + top; gl_FragColor = vec4(uColor * (1.0 + uPulse), a * (0.85 + uPulse*0.6)); }',
    });
    const beamGeo = new T.CylinderGeometry(0.42, 0.42, 1, 40, 1, true); beamGeo.translate(0, 0.5, 0);
    const beam = new T.Mesh(beamGeo, beamMat); g.add(beam);
    const coreGeo = new T.CylinderGeometry(0.07, 0.07, 1, 12); coreGeo.translate(0, 0.5, 0);
    const coreM = new T.Mesh(coreGeo, new T.MeshBasicMaterial({ color: C[d.key].clone(), transparent: true, opacity: 0.9, blending: T.AdditiveBlending })); g.add(coreM);
    const ring = new T.Mesh(new T.RingGeometry(0.5, 0.78, 48), new T.MeshBasicMaterial({ color: C[d.key].clone(), transparent: true, opacity: 0.55, blending: T.AdditiveBlending, side: T.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
    const lab = new T.Sprite(new T.SpriteMaterial({ map: labelTexture('33%', '', '#ffffff'), transparent: true, depthWrite: false }));
    lab.scale.set(1.9, 1.19, 1); g.add(lab);
    world.add(g);
    return { g, beam, beamMat, coreM, ring, lab, key: d.key, cur: 0.33, target: 0.33, text: '', pulse: 0, color: C[d.key].clone() };
  }

  function tower(sx, sz) {
    const g = new T.Group(); const x = sx * (HL + 3.2), z = sz * (HW + 3.4);
    const pole = new T.Mesh(new T.CylinderGeometry(0.1, 0.16, 7.5, 10), new T.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.7 }));
    pole.position.set(x, 3.75, z); g.add(pole);
    const lampMat = new T.MeshBasicMaterial({ color: 0xf4f8ff });
    const lamp = new T.Mesh(new T.BoxGeometry(1.6, 0.8, 0.12), lampMat);
    lamp.position.set(x, 7.6, z); lamp.lookAt(0, 0, 0); g.add(lamp);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex('#f4f8ff'), transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false }));
    glow.position.copy(lamp.position); glow.scale.set(5, 5, 1); g.add(glow);
    // haz volumétrico
    const h = 10.5;
    const coneGeo = new T.ConeGeometry(3.2, h, 40, 1, true); coneGeo.translate(0, -h / 2, 0);
    const coneMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { uI: { value: 0.12 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform float uI; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float soft = pow(abs(dot(vN, vV)), 1.4); float a = pow(vUv.y, 1.8) * soft * uI; gl_FragColor = vec4(vec3(0.92, 0.96, 1.0), a); }',
    });
    const cone = new T.Mesh(coneGeo, coneMat);
    cone.position.copy(lamp.position);
    const dir = new T.Vector3(-x * 0.55, -7.6, -z * 0.55).normalize();
    cone.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), dir);
    g.add(cone);
    world.add(g);
    return { g, glow, cone, coneMat, baseQ: cone.quaternion.clone(), dir, ph: Math.random() * 10 };
  }
  function glowTex(color) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d'); const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, color); grd.addColorStop(0.25, color + 'aa'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; return t;
  }

  // ── tablero LED ──────────────────────────────────────────────────────────────
  function ledText() {
    if (!D()) return [];
    const T_ = D().teams, F = XP.fmt;
    return D().matches.filter((m) => m.sel && m.status !== 'final').slice(0, 12).map((m) => {
      const s = m.sel, o = (k) => (s[k].best != null ? F.odds(s[k].best) : F.odds(1 / s[k].pFinal));
      return { live: m.status === 'vivo', txt: T_[m.home].code + (m.status === 'vivo' ? ' ' + m.score.join('-') + ' ' : ' vs ') + T_[m.away].code, odds: '1 ' + o('1') + '   X ' + o('X') + '   2 ' + o('2') };
    });
  }
  function drawLed(force) {
    const items = ledText();
    const sig = JSON.stringify(items);
    if (!force && sig === lastLedSig) return;
    lastLedSig = sig;
    const g = ledCtx, W = ledCanvas.width, H = ledCanvas.height;
    g.fillStyle = '#05070b'; g.fillRect(0, 0, W, H);
    // trama de LED
    g.fillStyle = 'rgba(255,255,255,0.035)';
    for (let x = 0; x < W; x += 6) g.fillRect(x, 0, 1, H);
    let x = 30;
    g.textBaseline = 'middle';
    const acc = hex(C.a);
    const list = items.length ? items : [{ txt: 'XPECTED', odds: 'PRONÓSTICOS CON DATOS', live: false }];
    for (let rep = 0; x < W; rep++) {
      list.forEach((it) => {
        if (x > W) return;
        g.font = '800 46px Inter, sans-serif';
        if (it.live) { g.fillStyle = '#ff5c5c'; g.beginPath(); g.arc(x + 10, H / 2, 9, 0, Math.PI * 2); g.fill(); x += 32; }
        g.fillStyle = '#ffffff'; g.fillText(it.txt, x, H / 2); x += g.measureText(it.txt).width + 26;
        g.font = '700 42px Inter, sans-serif'; g.fillStyle = acc; g.fillText(it.odds, x, H / 2); x += g.measureText(it.odds).width + 40;
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillText('◆', x, H / 2); x += 60;
      });
      if (rep > 8) break;
    }
    ledTex.needsUpdate = true;
  }

  // ── foco y datos ─────────────────────────────────────────────────────────────
  function focusMatch() {
    const id = stage.hoverId || stage.focusId;
    const m = id && D() && D().byId[id];
    if (m && m.sel) return m;
    return D() && (D().matches.find((x) => x.status === 'vivo' && x.sel) || D().matches.find((x) => x.status === 'previa' && x.sel && x.sel['1'].best != null) || D().matches.find((x) => x.sel));
  }
  function applyFocus() {
    if (!stage.ready) return;
    const m = focusMatch();
    if (!m) return;
    const ps = m.status === 'final' && m.frozen ? [m.frozen.p['1'], m.frozen.p['X'], m.frozen.p['2']] : ['1', 'X', '2'].map((k) => m.sel[k].pFinal);
    const T_ = D().teams;
    const codes = [T_[m.home].code, 'EMPATE', T_[m.away].code];
    const cols = [teamColor(m.home, C.h), C.d.clone(), teamColor(m.away, C.w)];
    pillars.forEach((p, i) => {
      p.target = ps[i];
      p.color.copy(cols[i]);
      const text = Math.round(ps[i] * 100) + '%|' + codes[i] + '|' + hex(cols[i]);
      if (text !== p.text) {
        p.text = text;
        p.lab.material.map.dispose();
        p.lab.material.map = labelTexture(Math.round(ps[i] * 100) + '%', codes[i], hex(cols[i]));
        p.lab.material.needsUpdate = true;
      }
    });
    // el balón rueda hacia el favorito
    b.tx = -(ps[0] - ps[2]) * 6.5;
    b.tz = 0.5;
    if (!looping) render(0);
  }

  // ── coreografía de cámara por página ─────────────────────────────────────────
  function layout(mode) {
    const W = window.innerWidth, H = window.innerHeight;
    const wide = W >= 900 && W / H > 1.1;
    const M = wide ? {
      hero: { o: 1, wx: 4.2, ry: -0.5, cx: 0, cy: 5.2, cz: 15, lx: 0, ly: 0.6, lz: 0, s: 1 },
      board: { o: 0.62, wx: 5, ry: -0.18, cx: 0, cy: 15, cz: 12, lx: 0, ly: 0, lz: 0, s: 1 },
      value: { o: 0.68, wx: 4.4, ry: -0.12, cx: 0, cy: 3.2, cz: 12, lx: 0, ly: 1.2, lz: -3, s: 1 },
      match: { o: 0.7, wx: 4.4, ry: -0.35, cx: 0, cy: 6.5, cz: 14, lx: 0, ly: 1.2, lz: 0, s: 1 },
      calm: { o: 0.36, wx: 4.5, ry: 0, cx: 0, cy: 22, cz: 6, lx: 0, ly: 0, lz: 0, s: 1 },
    } : {
      hero: { o: 0.95, wx: 0, ry: -0.35, cx: 0, cy: 8, cz: 23, lx: 0, ly: -2.5, lz: 0, s: 1 },
      board: { o: 0.38, wx: 0, ry: 0, cx: 0, cy: 22, cz: 15, lx: 0, ly: -3, lz: 0, s: 1 },
      value: { o: 0.4, wx: 0, ry: 0, cx: 0, cy: 20, cz: 16, lx: 0, ly: -3, lz: 0, s: 1 },
      match: { o: 0.42, wx: 0, ry: -0.2, cx: 0, cy: 18, cz: 18, lx: 0, ly: -3, lz: 0, s: 1 },
      calm: { o: 0.3, wx: 0, ry: 0, cx: 0, cy: 26, cz: 10, lx: 0, ly: -3, lz: 0, s: 1 },
    };
    return M[mode] || M.calm;
  }
  stage.route = function (name, params) {
    const mode = name === 'landing' ? 'hero' : name === 'hoy' || name === 'mercados' ? 'board' : name === 'valor' ? 'value' : name === 'partido' ? 'match' : 'calm';
    const changed = mode !== stage.mode;
    stage.mode = mode;
    stage.focusId = name === 'partido' && params ? params.id : mode === 'hero' ? stage.focusId : null;
    stage.hoverId = null;
    tgt = layout(mode);
    document.documentElement.dataset.stage = mode;
    if (!stage.ready) return;
    if (changed && !XP.reducedMotion()) { b.vy = 3.2; flash = Math.max(flash, 0.25); }
    applyFocus(); drawLed(); sync();
  };
  stage.focus = function (id) { stage.focusId = id; applyFocus(); };
  stage.hover = function (id) { if (stage.hoverId === id) return; stage.hoverId = id; applyFocus(); };
  stage.setPaused = function (v) { stage.paused = v; sync(); };

  // ── interacción: patear el balón ─────────────────────────────────────────────
  function setNdc(e) { ray.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); }
  function hitsBall() { ray.r.setFromCamera(ray.ndc, camera); return ray.r.intersectObject(ball).length > 0; }
  function pitchPoint() {
    ray.r.setFromCamera(ray.ndc, camera);
    const inv = new T.Matrix4().copy(world.matrixWorld).invert();
    const r2 = ray.r.ray.clone().applyMatrix4(inv);
    return r2.intersectPlane(ray.plane, ray.hit) ? ray.hit.clone() : null;
  }
  function onMove(e) {
    ptr.nx = (e.clientX / window.innerWidth) * 2 - 1; ptr.ny = (e.clientY / window.innerHeight) * 2 - 1;
    setNdc(e);
    if (b.drag) {
      b.moved += Math.abs(e.clientX - b.sx) + Math.abs(e.clientY - b.sy); b.sx = e.clientX; b.sy = e.clientY;
      const p = pitchPoint();
      if (p) {
        aim.geometry.setFromPoints([new T.Vector3(b.x, 0.05, b.z), new T.Vector3(p.x, 0.05, p.z)]); aim.computeLineDistances();
        aimMat.opacity = 0.9;
      }
      return;
    }
    const free = !e.target.closest || !e.target.closest(INTERACTIVE);
    document.body.classList.toggle('stage-over', free && stage.ready && hitsBall());
  }
  function onDown(e) {
    if (!stage.ready || e.button > 0 || XP.reducedMotion()) return;
    if (e.target.closest && e.target.closest(INTERACTIVE)) return;
    setNdc(e);
    if (!hitsBall()) return;
    b.drag = true; b.downAt = performance.now(); b.moved = 0; b.sx = e.clientX; b.sy = e.clientY;
    document.body.classList.add('stage-grab');
  }
  function onUp(e) {
    if (!b.drag) return;
    b.drag = false; aimMat.opacity = 0;
    document.body.classList.remove('stage-grab');
    if (b.moved < 8 && performance.now() - b.downAt < 350) { tap(); return; }
    setNdc(e);
    const p = pitchPoint();
    if (!p) return;
    // patada hacia donde soltaste: más lejos = más fuerte
    let vx = p.x - b.x, vz = p.z - b.z;
    const len = Math.hypot(vx, vz) || 1, power = Math.min(16, 4 + len * 1.6);
    b.vx = (vx / len) * power; b.vz = (vz / len) * power; b.vy = Math.min(5, len * 0.5);
    b.lastKick = clockT;
    if (XP.audio) XP.audio.ui('click');
  }
  /** Toque: el balón salta y la cancha pasa al siguiente partido (las columnas se transforman). */
  function tap() {
    const ids = D().matches.filter((m) => m.sel && m.status !== 'final').slice(0, 14).map((m) => m.id);
    if (!ids.length) return;
    const curId = focusMatch() && focusMatch().id;
    stage.focusId = ids[(ids.indexOf(curId) + 1) % ids.length];
    b.vy = 4.2; flash = 0.3;
    applyFocus();
    if (XP.audio) XP.audio.ui('click');
    XP.bus.emit('stage-focus', stage.focusId);
  }
  function scoreGoal(side) {
    const n = nets.find((x) => x.side === side);
    if (n) n.t = 0;
    flash = 1; roar = 1;
  }

  // ── simulación del balón ─────────────────────────────────────────────────────
  function stepBall(dt) {
    if (b.goal) {
      b.goal.t += dt;
      b.x += b.vx * dt; b.z += b.vz * dt; b.vx *= 0.9; b.vz *= 0.9;
      if (Math.abs(b.x) > HL + GOAL_D - BALL_R) { b.x = Math.sign(b.x) * (HL + GOAL_D - BALL_R); b.vx = 0; }
      if (b.goal.t > 1.6) { b.goal = null; b.x = 0; b.z = 0.5; b.vx = b.vz = 0; b.vy = 3; b.lastKick = clockT; }
    } else {
      const idle = clockT - b.lastKick > 3.5;
      if (idle && b.tx != null) { b.vx += (b.tx - b.x) * 1.2 * dt; b.vz += (b.tz - b.z) * 1.2 * dt; b.vx *= 0.96; b.vz *= 0.96; }
      else { b.vx *= Math.pow(0.55, dt); b.vz *= Math.pow(0.55, dt); }
      b.x += b.vx * dt; b.z += b.vz * dt;
      // ¿gol? entre los palos y bajo el travesaño
      if (Math.abs(b.x) > HL - BALL_R * 0.4 && Math.abs(b.z) < GOAL_W - BALL_R && b.y < GOAL_H + BALL_R) { b.goal = { t: 0 }; scoreGoal(Math.sign(b.x)); }
      else {
        if (Math.abs(b.x) > HL + 1.2) { b.x = Math.sign(b.x) * (HL + 1.2); b.vx *= -0.55; }
        if (Math.abs(b.z) > HW + 0.8) { b.z = Math.sign(b.z) * (HW + 0.8); b.vz *= -0.55; }
      }
    }
    b.vy -= 14 * dt; b.y += b.vy * dt;
    if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy) > 1.2 ? -b.vy * 0.45 : 0; }
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0.001) { const axis = new T.Vector3(b.vz, 0, -b.vx).normalize(); ball.rotateOnWorldAxis(axis, (sp * dt) / BALL_R); }
    else ball.rotation.y += dt * 0.25;
    ball.position.set(b.x, b.y, b.z);
    const sh = ball.userData.shadow; sh.position.set(b.x, 0.012, b.z); sh.material.opacity = 0.45 * Math.max(0.2, 1 - (b.y - BALL_R) * 0.4);
  }

  // ── bucle ────────────────────────────────────────────────────────────────────
  function resize() {
    if (!renderer) return;
    const W = window.innerWidth, H = window.innerHeight;
    renderer.setPixelRatio(Math.min(dprCap, window.devicePixelRatio || 1));
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    tgt = layout(stage.mode);
    crowdMat.uniforms.uScale.value = Math.min(2, renderer.getPixelRatio()) * (H / 900) * 3;
    if (!looping) render(0);
  }
  function enabled() { return XP.settings.stage3d !== false; }
  function sync() {
    if (!stage.ready) return;
    renderer.domElement.style.display = enabled() ? '' : 'none';
    const should = enabled() && !stage.paused && !XP.reducedMotion() && document.visibilityState === 'visible' && !document.documentElement.classList.contains('modal-open');
    if (should && !looping) { looping = true; lastT = performance.now(); raf = requestAnimationFrame(frame); }
    if (!should && looping) { looping = false; cancelAnimationFrame(raf); }
    if (!looping && enabled()) { Object.assign(cur, tgt); pillars.forEach((p) => { p.cur = p.target; }); render(0); }
  }

  function render(dt) {
    clockT += dt;
    const time = performance.now() / 1000;
    const lvl = XP.audio ? XP.audio.level() : 0;
    const k = dt ? 1 - Math.pow(0.002, dt) : 1;
    Object.keys(tgt).forEach((p) => { cur[p] += (tgt[p] - cur[p]) * k; });
    renderer.domElement.style.opacity = cur.o.toFixed(3);
    ptr.sx += (ptr.nx - ptr.sx) * (dt ? 0.05 : 1); ptr.sy += (ptr.ny - ptr.sy) * (dt ? 0.05 : 1);
    const sy = window.scrollY, H = window.innerHeight, sp = Math.min(1, sy / H);
    // grúa con el scroll + paralaje con el mouse (cámara de transmisión)
    camera.position.set(cur.cx + ptr.sx * 1.4, cur.cy + sp * (stage.mode === 'hero' ? 4 : 2) - ptr.sy * 0.7, cur.cz - sp * 1.5);
    camera.lookAt(cur.lx, cur.ly - sp * (stage.mode === 'hero' ? 1.2 : 0.4), cur.lz);
    world.position.set(cur.wx, 0, 0);
    world.rotation.y = cur.ry + ptr.sx * 0.06;
    world.updateMatrixWorld();
    if (dt) stepBall(dt); else ball.position.set(b.x, b.y, b.z);
    const lv = new T.Vector3(-0.35, 0.85, 0.4).transformDirection(camera.matrixWorldInverse);
    ballMat.uniforms.uLight.value.copy(lv);
    const over = document.body.classList.contains('stage-over') ? 1 : 0;
    hoverBall += (over - hoverBall) * 0.12;
    ballMat.uniforms.uGlow.value = hoverBall * 0.8 + flash * 0.6;
    flash *= dt ? Math.pow(0.08, dt) : 0; roar *= dt ? Math.pow(0.25, dt) : 0; ledFlash *= dt ? Math.pow(0.05, dt) : 0;
    // columnas 1X2
    pillars.forEach((p, i) => {
      p.cur += (p.target - p.cur) * (dt ? Math.min(1, dt * 3) : 1);
      const h = 0.25 + p.cur * 7.5;
      p.beam.scale.y = h; p.coreM.scale.y = h;
      p.beamMat.uniforms.uColor.value.lerp(p.color, dt ? 0.08 : 1); p.coreM.material.color.lerp(p.color, dt ? 0.08 : 1); p.ring.material.color.lerp(p.color, dt ? 0.08 : 1);
      p.pulse *= dt ? Math.pow(0.1, dt) : 0;
      p.beamMat.uniforms.uPulse.value = p.pulse + lvl * 0.4;
      p.beamMat.uniforms.uTime.value = time + i;
      p.ring.scale.setScalar(1 + Math.sin(time * 2 + i) * 0.06 + p.pulse * 0.4);
      p.lab.position.y = h + 0.95;
    });
    // reflectores: leve barrido + destello con gol
    towers.forEach((t) => {
      const sway = Math.sin(time * 0.3 + t.ph) * 0.05;
      t.cone.quaternion.copy(t.baseQ).multiply(new T.Quaternion().setFromEuler(new T.Euler(sway, 0, sway * 0.6)));
      t.coneMat.uniforms.uI.value = 0.1 + flash * 0.35 + lvl * 0.06;
      t.glow.material.opacity = 0.7 + flash * 0.3;
    });
    // redes que ondulan
    nets.forEach((n) => {
      n.t += dt;
      const arr = n.net.geometry.attributes.position.array;
      if (n.t < 2.5) {
        for (let i = 0; i < arr.length; i += 3) {
          const dz = n.base[i + 2], dy = n.base[i + 1];
          const wave = Math.sin(n.t * 18 - Math.hypot(dz, dy - 0.6) * 5) * Math.exp(-n.t * 2.2) * 0.22;
          arr[i] = n.base[i] + n.side * Math.max(0, wave) * (Math.abs(n.base[i]) > HL + 0.01 ? 1 : 0.3);
        }
        n.net.geometry.attributes.position.needsUpdate = true;
        n.net.material.opacity = 0.35 + Math.exp(-n.t * 2) * 0.5;
      }
    });
    crowdMat.uniforms.uTime.value = time; crowdMat.uniforms.uRoar.value = roar;
    ledTex.offset.x = (ledTex.offset.x + dt * 0.035) % 1;
    led.material.color.setScalar(1 + ledFlash * 0.8);
    pitchMat.emissiveIntensity = 0.3 + flash * 0.5 + lvl * 0.15;
    renderer.render(scene, camera);
  }
  function frame(now) {
    if (!looping) return;
    acc += Math.min(0.05, (now - lastT) / 1000); lastT = now;
    frameN++;
    if (stage.mode !== 'hero' && !b.drag && !b.goal && frameN % 2) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.08, acc); acc = 0;
    render(dt);
    if (dt > 0.034 * (stage.mode !== 'hero' ? 2 : 1)) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 90 && dprCap > 1) { dprCap = 1; slowFrames = 0; resize(); }
    raf = requestAnimationFrame(frame);
  }

  // ── reacciones a los datos ───────────────────────────────────────────────────
  const lastOdds = new Map();
  function onMatch(m) {
    if (!stage.ready || !m.sel) return;
    const sig = ['1', 'X', '2'].map((k) => m.sel[k].best).join('|');
    const prev = lastOdds.get(m.id);
    lastOdds.set(m.id, sig);
    const f = focusMatch();
    if (prev && prev !== sig) {
      ledFlash = 1;
      if (f && f.id === m.id) pillars.forEach((p) => { p.pulse = 0.8; });
    }
    if (f && f.id === m.id) applyFocus();
    drawLed();
  }
  function onGoal(m) {
    if (!stage.ready) return;
    const last = (m.events || []).filter((e) => e.type === 'gol').slice(-1)[0];
    const side = last ? (last.side === 0 ? 1 : -1) : 1; // el local ataca el arco derecho
    scoreGoal(side);
    if (!looping) render(0);
  }

  /** Para pruebas automáticas: avanza n fotogramas sin depender de requestAnimationFrame. */
  stage.debug = function (n, dt) {
    if (!stage.ready) return null;
    for (let i = 0; i < (n || 1); i++) render(dt || 1 / 60);
    return { mode: stage.mode, opacity: +cur.o.toFixed(2), cam: [cur.cx, cur.cy, cur.cz].map((v) => +v.toFixed(1)), pillars: pillars.map((p) => +p.cur.toFixed(3)), labels: pillars.map((p) => p.text.split('|').slice(0, 2).join(' ')), focus: (focusMatch() || {}).id, ball: [+b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2)], goal: !!b.goal, flash: +flash.toFixed(2), led: lastLedSig.length };
  };
  stage._kick = (vx, vz) => { b.vx = vx; b.vz = vz; b.vy = 2; b.lastKick = clockT; };
  stage._goal = (side) => scoreGoal(side);
  stage._tap = () => tap();

  stage.init = function () {
    if (stage.initP) return stage.initP;
    stage.initP = (async () => {
      const host = document.getElementById('stage');
      if (!host || !XP.three || !XP.three.available()) return false;
      let lib;
      try { lib = await XP.three.load(); } catch (e) { console.warn('[3D] escenario no disponible:', e.message); return false; }
      T = lib.T;
      build(host);
      stage.ready = true;
      tgt = layout(stage.mode);
      Object.assign(cur, tgt); cur.o = 0;
      applyFocus(); b.x = b.tx || 0; sync();
      window.addEventListener('resize', resize);
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerdown', onDown);
      window.addEventListener('pointerup', onUp);
      document.addEventListener('visibilitychange', sync);
      document.addEventListener('pointerover', (e) => {
        const el = e.target.closest && e.target.closest('[data-match]');
        stage.hover(el ? el.dataset.match : null);
      });
      XP.bus.on('match', onMatch);
      XP.bus.on('goal', onGoal);
      XP.bus.on('matches-changed', () => { applyFocus(); drawLed(); });
      XP.bus.on('modal', sync);
      XP.bus.on('settings', () => {
        readColors();
        pitchMat.emissive.copy(C.a); aimMat.color.copy(C.a); ballMat.uniforms.uRim.value.copy(C.a);
        scene.fog.color.copy(C.bg);
        lastLedSig = ''; drawLed(true); applyFocus(); sync();
      });
      return true;
    })();
    return stage.initP;
  };
})();
