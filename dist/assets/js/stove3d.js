/* De 3D-kachel: het vuur achter het glas is de echte video. Bij scrollen draait de kachel en vlieg je naar het vuur. */
(function () {
  const root = document.documentElement;
  if (!root.classList.contains('has-3d')) return;
  const hero = document.querySelector('.hero'), stage = document.querySelector('.hero__stage');
  const canvas = document.querySelector('.hero__gl'), video = document.querySelector('.hero__vis video');
  const vis = document.querySelector('.hero__vis'), text = document.querySelector('.hero__in');
  const after = document.querySelector('.hero__after'), scrim = document.querySelector('.hero__scrim');
  const pauseBtn = document.querySelector('[data-loop-toggle]');

  function fail() { root.classList.remove('has-3d'); }
  if (!window.THREE) return fail();

  const T = THREE;
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { return fail(); }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = T.SRGBColorSpace; else renderer.outputEncoding = T.sRGBEncoding;

  const srgb = t => { if ('colorSpace' in t) t.colorSpace = T.SRGBColorSpace; else t.encoding = T.sRGBEncoding; return t; };
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(30, 1, 0.02, 40);

  /* Omgeving: een lichte showroom die alleen in de reflecties bestaat */
  (function () {
    const env = new T.Scene();
    env.add(new T.Mesh(new T.BoxGeometry(12, 8, 12), new T.MeshBasicMaterial({ color: 0x9aa3a8, side: T.BackSide })));
    const panel = (w, h, x, y, z, ry, rx, k) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(k, k, k), side: T.DoubleSide }));
      m.position.set(x, y, z); m.rotation.set(rx, ry, 0); env.add(m);
    };
    panel(4, 6, -5.5, 1, 2, Math.PI / 2, 0, 3.2);   // groot raam links
    panel(1.2, 6, 5.5, 1, 2, -Math.PI / 2, 0, 3); // smalle strook rechts
    panel(7, 4, 0, 3.9, 0, 0, Math.PI / 2, 2.6);    // plafond
    const pm = new T.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.03).texture;
    pm.dispose();
  })();

  /* Hulpjes voor afgeronde vormen */
  function rrect(s, w, h, r) {
    const x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  function slab(w, h, d, r, bevel, hole) {
    const s = rrect(new T.Shape(), w - bevel * 2, h - bevel * 2, r);
    if (hole) { const p = rrect(new T.Path(), hole.w, hole.h, hole.r); p.autoClose = true; const pts = p.getPoints(8).map(v => v.add(new T.Vector2(0, hole.y))); s.holes.push(new T.Path(pts)); }
    const g = new T.ExtrudeGeometry(s, { depth: d - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 10 });
    g.translate(0, 0, -(d - bevel * 2) / 2);
    return g;
  }

  /* Materialen */
  const steel = new T.MeshPhysicalMaterial({ color: 0x1d1e20, metalness: 0.2, roughness: 0.52, clearcoat: 0.22, clearcoatRoughness: 0.4 });
  const black = new T.MeshStandardMaterial({ color: 0x0c0d0e, metalness: 0.6, roughness: 0.32 });
  const matt = new T.MeshStandardMaterial({ color: 0x141517, metalness: 0.2, roughness: 0.62 });
  const brushed = new T.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 1, roughness: 0.28 });
  const inner = new T.MeshStandardMaterial({ color: 0x17110e, metalness: 0, roughness: 0.95 });

  const stove = new T.Group();
  scene.add(stove);
  const W = 0.64, H = 1.08, D = 0.5, GW = 0.44, GH = 0.46, WIN_Y = 0.2;
  const add = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); stove.add(m); return m; };
  const bodyY = 0.08 + H / 2;

  add(new T.BoxGeometry(W - 0.12, 0.08, D - 0.1), matt, 0, 0.04, 0);                     // sokkel
  add(slab(W, H, D, 0.035, 0.012, { w: GW + 0.02, h: GH + 0.02, r: 0.012, y: WIN_Y }), steel, 0, bodyY, 0); // romp met echte opening
  const topY = 0.08 + H + 0.016;
  const top = add(slab(W + 0.02, D + 0.02, 0.028, 0.03, 0.006), black, 0, topY, 0); top.rotation.x = Math.PI / 2; // bovenplaat
  add(slab(GW + 0.11, GH + 0.13, 0.024, 0.016, 0.005, { w: GW, h: GH, r: 0.008, y: 0 }), black, 0, bodyY + WIN_Y, D / 2 + 0.008); // deurkader

  // Haard: binnenkant met diepte, de video staat achteraan
  const DEPTH = 0.11, zBack = D / 2 - DEPTH, winY = bodyY + WIN_Y;
  add(new T.BoxGeometry(GW + 0.03, GH + 0.03, 0.01), inner, 0, winY, zBack - 0.012);
  const lz = zBack + DEPTH / 2 + 0.005, lt = 0.004;
  add(new T.BoxGeometry(lt, GH + 0.02, DEPTH + 0.01), inner, -(GW + 0.02) / 2 + lt / 2, winY, lz);
  add(new T.BoxGeometry(lt, GH + 0.02, DEPTH + 0.01), inner, (GW + 0.02) / 2 - lt / 2, winY, lz);
  add(new T.BoxGeometry(GW + 0.02, lt, DEPTH + 0.01), inner, 0, winY + (GH + 0.02) / 2 - lt / 2, lz);
  add(new T.BoxGeometry(GW + 0.02, lt, DEPTH + 0.01), inner, 0, winY - (GH + 0.02) / 2 + lt / 2, lz);
  const poster = srgb(new T.TextureLoader().load('assets/img/poster-kachelraam.webp'));
  const videoTex = srgb(new T.VideoTexture(video));
  [poster, videoTex].forEach(t => { t.repeat.set(0.398, 0.74); t.offset.set(0.4, 0.11); t.minFilter = T.LinearFilter; });
  const fireMat = new T.MeshBasicMaterial({ map: poster, toneMapped: false });
  const fire = new T.Mesh(new T.PlaneGeometry(GW + 0.02, GH + 0.02), fireMat);
  fire.position.set(0, winY, zBack); stove.add(fire);
  video.addEventListener('playing', () => { fireMat.map = videoTex; fireMat.needsUpdate = true; }, { once: true });
  if (!video.paused && video.readyState > 2) { fireMat.map = videoTex; }

  // Glas: bijna onzichtbaar, alleen de spiegeling van het raam
  const glassMat = new T.MeshPhysicalMaterial({ color: 0x20140c, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 });
  const glass = new T.Mesh(new T.PlaneGeometry(GW, GH), glassMat);
  glass.position.set(0, winY, D / 2 + 0.006); stove.add(glass);

  // Handgreep
  const hx = GW / 2 + 0.03;
  add(new T.CylinderGeometry(0.0085, 0.0085, 0.2, 18), brushed, hx, winY, D / 2 + 0.05);
  [-0.07, 0.07].forEach(o => { const s = add(new T.CylinderGeometry(0.005, 0.005, 0.04, 12), brushed, hx, winY + o, D / 2 + 0.032); s.rotation.x = Math.PI / 2; });

  // Onderpaneel: één fijne naad en drie luchtspleten
  add(new T.BoxGeometry(W - 0.09, 0.003, 0.004), black, 0, 0.36, D / 2 + 0.001);
  [0.20, 0.228, 0.256].forEach(y => add(new T.BoxGeometry(0.26, 0.007, 0.004), black, 0, y, D / 2 + 0.001));

  // Rookkanaal
  const flueY = topY + 0.016;
  add(new T.CylinderGeometry(0.086, 0.09, 0.03, 40), black, 0, flueY + 0.015, -0.05);
  add(new T.CylinderGeometry(0.075, 0.075, 3.4, 40), matt, 0, flueY + 1.7, -0.05);

  /* Licht */
  scene.add(new T.AmbientLight(0xffffff, 0.12));
  const key = new T.DirectionalLight(0xffffff, 1.1);
  key.position.set(-2.4, 4, 3);
  scene.add(key);
  const fireLight = new T.PointLight(0xff6a1a, 0.5, 2, 2);
  fireLight.position.set(0, winY, D / 2 - 0.05); stove.add(fireLight);
  const frontGlow = new T.PointLight(0xff8a3c, 0.5, 1.6, 2);
  frontGlow.position.set(0, winY - 0.1, D / 2 + 0.28); stove.add(frontGlow);

  /* Vloer: zachte schaduw en een warme gloed uit het raam */
  const blob = (size, inner_, outer, stops) => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'), g = x.createRadialGradient(128, 128, inner_, 128, 128, outer);
    stops.forEach(([p, col]) => g.addColorStop(p, col)); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const m = new T.Mesh(new T.PlaneGeometry(size[0], size[1]), new T.MeshBasicMaterial({ map: srgb(new T.CanvasTexture(c)), transparent: true, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; return m;
  };
  const contact = blob([1.7, 1.4], 40, 128, [[0, 'rgba(10,14,22,.5)'], [0.5, 'rgba(10,14,22,.13)'], [1, 'rgba(10,14,22,0)']]);
  contact.position.y = 0.002; stove.add(contact);
  const glow = blob([0.8, 0.5], 0, 128, [[0, 'rgba(255,120,40,.32)'], [0.5, 'rgba(255,120,40,.1)'], [1, 'rgba(255,120,40,0)']]);
  glow.position.set(0, 0.004, D / 2 + 0.22); stove.add(glow);

  /* Pas nu alles werkt: de video wordt het volle scherm aan het einde van de vlucht */
  stage.insertBefore(vis, scrim);
  stage.append(pauseBtn);
  { const pl = video.play(); pl && pl.catch(() => {}); }

  /* Maat en camera */
  let vw = 1, vh = 1, phone = false, end = 0.5;
  function size() {
    const r = stage.getBoundingClientRect();
    vw = r.width; vh = r.height; phone = vw < 960;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, phone ? 1.6 : 2));
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    const k = Math.tan(camera.fov * Math.PI / 360) * 2;
    end = Math.min((GH + 0.02) / k, (GW + 0.02) / (k * camera.aspect)) * 0.94;
    camera.updateProjectionMatrix();
  }
  size();
  new ResizeObserver(size).observe(stage);

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ss = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;

  let target = 0, p = 0, px = 0, py = 0, tx = 0, ty = 0, born = performance.now(), visible = true, lastFire = false;
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; } }, { passive: true });
  function readScroll() {
    const r = hero.getBoundingClientRect(), span = hero.offsetHeight - stage.offsetHeight;
    target = span > 0 ? clamp(-(r.top - parseFloat(getComputedStyle(stage).top)) / span) : 0;
  }
  addEventListener('scroll', readScroll, { passive: true });
  addEventListener('resize', readScroll);
  readScroll(); p = target;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) requestAnimationFrame(frame); }, { rootMargin: '10%' }).observe(hero);

  const noise = t => 0.5 + 0.5 * (Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.1 + 1.3) * 0.3 + Math.sin(t * 23.7 + 0.5) * 0.2);

  function frame(now) {
    if (!visible) return;
    requestAnimationFrame(frame);
    if (document.hidden) return;
    p += (target - p) * 0.11;
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    const t = now / 1000;

    const front = ss(0.06, 0.4, p), fly = ss(0.34, 0.8, p), flyE = fly * fly * (3 - 2 * fly);
    const intro = ss(0, 1, (now - born) / 1300);

    // Draaien: van schuin naar recht vooraan
    const sway = Math.sin(t * 0.35) * 0.035 * (1 - front);
    stove.rotation.y = mix(-0.46 - (1 - intro) * 0.5, 0, front) + sway + px * 0.16 * (1 - front);
    stove.position.y = (1 - intro) * -0.03;

    // Camera: van de kachel in de ruimte, naar vlak voor het vuur
    const startD = phone ? 6.7 : 3.75, zFire = D / 2 - DEPTH;
    const lookStart = 0.66, camStart = 1.0;
    camera.position.set(
      px * 0.1 * (1 - front),
      mix(camStart - py * 0.08 * (1 - front), winY, ss(0.18, 0.55, p)),
      mix(startD, zFire + end, flyE)
    );
    camera.lookAt(0, mix(lookStart, winY, ss(0.18, 0.55, p)), zFire);

    // De kachel staat naast de titel; hij schuift naar het midden
    const c = 1 - front;
    if (phone) camera.setViewOffset(vw, vh, 0, vh * 0.245 * c, vw, vh);
    else camera.setViewOffset(vw, vh, -vw * 0.21 * c, -vh * 0.01 * c, vw, vh);

    // Vuurlicht leeft mee
    const f = noise(t);
    fireLight.intensity = 0.4 + f * 0.5;
    frontGlow.intensity = 0.18 + f * 0.22;
    glow.material.opacity = 0.62 + f * 0.38;
    glassMat.opacity = mix(0.16, 0, ss(0.55, 0.72, p));
    glassMat.envMapIntensity = mix(1.6, 0, ss(0.55, 0.72, p));

    // Tekst weg, video over het hele scherm, tekst op het vuur
    const fade = 1 - ss(0.015, 0.11, p);
    text.style.opacity = fade;
    text.style.transform = `translate3d(0,${(1 - fade) * -14}px,0)`;
    text.style.visibility = fade < 0.01 ? 'hidden' : 'visible';
    const full = ss(0.72, 0.84, p);
    vis.style.opacity = full;
    scrim.style.opacity = full;
    const a = ss(0.84, 0.92, p);
    after.style.opacity = a;
    after.style.transform = `translate3d(0,${(1 - a) * 14}px,0)`;
    after.style.visibility = a < 0.01 ? 'hidden' : 'visible';
    const isFire = p > 0.74;
    if (isFire !== lastFire) { stage.classList.toggle('is-fire', isFire); lastFire = isFire; }

    if (full < 0.999) renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
})();
