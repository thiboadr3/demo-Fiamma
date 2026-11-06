(function () {
  const $ = (s, c = document) => c.querySelector(s), $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Menu op gsm */
  const burger = $('.nav__burger'), links = $('.nav__links');
  const toggleMenu = open => {
    links.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen');
    document.body.style.overflow = open ? 'hidden' : '';
  };
  burger.addEventListener('click', () => toggleMenu(!links.classList.contains('is-open')));
  links.addEventListener('click', e => { if (e.target.closest('a')) toggleMenu(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') toggleMenu(false); });

  /* Een zachte verschijning, één keer */
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  $$('[data-reveal]').forEach(el => io.observe(el));

  /* Vuur: speelt alleen in beeld, staat stil met de knop of bij minder beweging */
  $$('[data-loop]').forEach(el => {
    const v = $('video', el), btn = $('[data-loop-toggle]', el);
    const s = { seen: false, held: reduced };
    const sync = () => {
      if (s.seen && !s.held) { const p = v.play(); p && p.catch(() => {}); } else v.pause();
      btn.textContent = s.held ? 'Laat het vuur branden' : 'Pauzeer het vuur';
    };
    btn.addEventListener('click', () => { s.held = !s.held; sync(); });
    new IntersectionObserver(([e]) => { s.seen = e.isIntersecting; sync(); }).observe(el);
    if (reduced) v.removeAttribute('autoplay');
    sync();
  });

  /* Gamma: tabbladen, zonder script staan alle soorten onder elkaar */
  const tabs = $$('[role=tab]'), panels = $$('[role=tabpanel]');
  const select = (tab, focus) => {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
    });
    panels.forEach(p => { p.hidden = p.id !== tab.getAttribute('aria-controls'); });
    if (focus) tab.focus();
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      select(tabs[(i + d + tabs.length) % tabs.length], true);
    });
  });
  panels.forEach((p, i) => { p.hidden = i !== 0; });

  /* Keuzehulp */
  const qs = $$('.q'), res = $('.res'), num = $('.quiz__n');
  const answers = {};
  const ADV = {
    hout: ['Een houtkachel', 'Nostalgische warmte met geavanceerde technologie, en toch te regelen met een afstandsbediening.'],
    pellet: ['Een pelletkachel', 'Hoge prestaties en zuinig verwarmen, met een automatisch programma voor opstart en stop.'],
    hybride: ['Een hybride kachel', 'Het gemak van pellets en het geknetter van hout in één kachel.'],
    thermo: ['Een thermokachel', 'Centrale verwarming met pellets, die ook uw warm water kan leveren.'],
    inbouwHout: ['Een inbouwkachel op hout', 'De sfeer van echt hout, ingewerkt in uw wand of bestaande haard.'],
    inbouwPellet: ['Een inbouwkachel op pellets', 'Zorgeloos verwarmen met volledige regeling van temperatuur en vermogen, ingewerkt in uw wand of bestaande haard.']
  };
  const advise = () => {
    const { doel, plaats } = answers;
    if (doel === 'cv') return ADV.thermo;
    if (doel === 'beide') return ADV.hybride;
    if (plaats === 'inbouw') return doel === 'hout' ? ADV.inbouwHout : ADV.inbouwPellet;
    return doel === 'hout' ? ADV.hout : ADV.pellet;
  };
  const PL = { vrij: 'vrijstaand', inbouw: 'ingebouwd', weet: 'plaats nog niet gekend' };
  let adv = null;
  qs.forEach((q, i) => q.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    answers[q.dataset.q] = b.dataset.v;
    q.hidden = true;
    if (qs[i + 1]) {
      qs[i + 1].hidden = false;
      $('span', num).textContent = i + 2;
      $('button', qs[i + 1]).focus({ preventScroll: true });
    } else {
      adv = advise();
      $('.res__t').textContent = adv[0];
      $('.res__p').textContent = adv[1];
      res.hidden = false;
      num.hidden = true;
    }
  }));
  $('.res__again').addEventListener('click', () => {
    res.hidden = true; num.hidden = false; $('span', num).textContent = 1;
    qs.forEach((q, i) => { q.hidden = i !== 0; });
  });
  $('#resCta').addEventListener('click', () => {
    const txt = `${adv[0]}, ${PL[answers.plaats]}. Plaatsing: ${answers.wanneer.toLowerCase()}.`;
    const box = $('.form__spec'); box.hidden = false; $('b', box).textContent = txt;
    const m = $('textarea[name=bericht]');
    if (!m.value) m.value = 'Ik kreeg dit advies in de keuzehulp: ' + txt;
  });

  /* Openingsuren: vandaag in de balk, de volgende dagen als rijen, in Belgische tijd */
  (function () {
    const TZ = 'Europe/Brussels';
    const OPEN = { 3: [960, 1050], 6: [600, 990] };
    const parts = new Intl.DateTimeFormat('nl-BE', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    const g = k => (parts.find(p => p.type === k) || {}).value;
    const day = { zo: 0, ma: 1, di: 2, wo: 3, do: 4, vr: 5, za: 6 }[(g('weekday') || '').slice(0, 2)];
    const min = (+g('hour') % 24) * 60 + +g('minute');
    const clock = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const fmt = new Intl.DateTimeFormat('nl-BE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });

    const rows = [];
    for (let i = 0; i < 15 && rows.length < 3; i++) {
      const d = (day + i) % 7, h = OPEN[d];
      if (!h || (i === 0 && min >= h[1])) continue;
      rows.push({ i, d, h, date: new Date(Date.now() + i * 864e5) });
    }
    $('[data-days]').innerHTML = rows.map(r => `<li><span class="days__d">${fmt.format(r.date).replace(/^./, c => c.toUpperCase())}</span><span class="days__t">${clock(r.h[0])} tot ${clock(r.h[1])}</span></li>`).join('');

    const first = rows[0], isOpen = first.i === 0 && min >= first.h[0];
    const name = first.i === 0 ? 'vandaag' : first.d === 3 ? 'woensdag' : 'zaterdag';
    const today = $('[data-today]'), status = $('.status');
    const short = isOpen ? `Nu open tot ${clock(first.h[1])}` : `Open ${name} om ${clock(first.h[0])}`;
    today.textContent = short; today.classList.toggle('is-open', isOpen);
    status.textContent = isOpen ? `Nu open, tot ${clock(first.h[1])}.` : `Nu gesloten. Open ${name} om ${clock(first.h[0])}.`;
    status.classList.toggle('is-open', isOpen);
  })();

  /* Formulier: controleert lokaal en verstuurt nog niets */
  const form = $('.form'), msg = $('.form__msg');
  form.addEventListener('submit', e => {
    e.preventDefault();
    let ok = true;
    $$('[required]', form).forEach(i => {
      const bad = !i.value.trim() || (i.type === 'email' && !/.+@.+\..+/.test(i.value));
      i.classList.toggle('is-err', bad);
      if (bad) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid');
      if (bad && ok) i.focus();
      ok = ok && !bad;
    });
    msg.textContent = ok
      ? 'Er werd niets verzonden: dit is een demo. Op de echte website komt uw aanvraag hier rechtstreeks binnen bij Fiamma DC.'
      : 'Vul uw naam, telefoonnummer en een volledig e-mailadres in.';
  });
})();
