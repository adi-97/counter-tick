(() => {
  'use strict';

  const KEY = 'counter-app:v1';
  const $ = (id) => document.getElementById(id);

  const stage = $('stage');
  const tapBtn = $('tap');
  const dial = $('dial');
  const countEl = $('count');
  const hintEl = $('hint');
  const statusEl = $('status');
  const dialog = $('settings-dialog');
  const limitInput = $('limit-input');
  const limitLabel = $('limit-label');
  const limitHint = $('limit-hint');
  const dirInputs = dialog.querySelectorAll('input[name="dir"]');
  const soundBtn = $('sound');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

  let count = 0;
  let limit = null;
  let dir = 1;
  let sound = false;

  function load() {
    count = 0;
    limit = null;
    dir = 1;
    sound = false;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && Number.isInteger(saved.count)) count = saved.count;
      if (saved && Number.isInteger(saved.limit) && saved.limit > 0) limit = saved.limit;
      if (saved && saved.dir === -1) dir = -1;
      if (saved && saved.sound === true) sound = true;
    } catch {}
    clamp();
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ count, limit, dir, sound }));
    } catch {}
  }

  let audio = null;
  let speakingSince = 0;
  let pending = null;

  function click() {
    if (!sound) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio = audio || new AC();
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.04);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  function say(text) {
    speakingSince = performance.now();
    const u = new SpeechSynthesisUtterance(String(text));
    u.rate = 1.6;
    u.onend = u.onerror = () => {
      speakingSince = 0;
      if (pending !== null) {
        const next = pending;
        pending = null;
        say(next);
      }
    };
    speechSynthesis.speak(u);
  }

  function stopSpeech() {
    pending = null;
    speakingSince = 0;
    if (canSpeak) speechSynthesis.cancel();
  }

  function speak(text, { interrupt = false } = {}) {
    if (!sound || !canSpeak) return;
    const stuck = speakingSince && performance.now() - speakingSince > 2500;
    if (interrupt || stuck) stopSpeech();
    else if (speakingSince) { pending = text; return; }
    say(text);
  }

  function clamp() {
    count = Math.max(0, limit === null ? count : Math.min(limit, count));
  }

  const start = () => (dir > 0 ? 0 : limit ?? 0);
  const done = () => limit !== null && (dir > 0 ? count >= limit : count <= 0);

  function render() {
    const text = String(count);
    countEl.textContent = text;
    countEl.style.setProperty('--len', Math.max(2, text.length));

    const finished = done();
    document.body.classList.toggle('at-limit', finished);
    dial.style.setProperty('--p', limit === null ? 0 : count / limit);
    hintEl.hidden = count !== start();
    hintEl.textContent = dir < 0 && limit === null
      ? 'Set a start number in Settings'
      : `Tap anywhere to count ${dir > 0 ? 'up' : 'down'}`;
    tapBtn.setAttribute('aria-label', dir > 0 ? 'Count up' : 'Count down');
    soundBtn.setAttribute('aria-pressed', sound);

    if (finished) statusEl.textContent = dir > 0 ? 'Limit reached! 🎉' : 'Countdown complete! 🎉';
    else if (dir > 0) statusEl.textContent = `Counting up · ${limit === null ? 'No limit' : `Limit ${limit}`}`;
    else statusEl.textContent = limit === null ? 'Counting down · No start set' : `Counting down from ${limit}`;
  }

  function animate(el, keyframes, duration) {
    if (reducedMotion.matches || !el.animate) return null;
    return el.animate(keyframes, { duration, easing: 'cubic-bezier(.2,.8,.3,1)' });
  }

  const pop = (d) => animate(countEl,
    [{ transform: `translateY(${d * -4}%) scale(1.06)` }, { transform: 'none' }], 160);

  const shake = () => {
    animate(countEl, [
      { transform: 'translateX(0)' }, { transform: 'translateX(-4%)' },
      { transform: 'translateX(3%)' }, { transform: 'translateX(-2%)' },
      { transform: 'translateX(0)' },
    ], 260);
    if (navigator.vibrate) navigator.vibrate(30);
  };

  function ripple(e) {
    if (reducedMotion.matches) return;
    const box = stage.getBoundingClientRect();
    const fromPointer = e && e.detail > 0;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.left = `${fromPointer ? e.clientX - box.left : box.width / 2}px`;
    dot.style.top = `${fromPointer ? e.clientY - box.top : box.height / 2}px`;
    stage.append(dot);
    const anim = animate(dot, [{ transform: 'scale(.2)', opacity: 1 }, { transform: 'scale(2.4)', opacity: 0 }], 450);
    if (anim) anim.onfinish = () => dot.remove(); else dot.remove();
  }

  function celebrate() {
    if (navigator.vibrate) navigator.vibrate([40, 60, 80]);
    animate(countEl, [
      { transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(.95)' }, { transform: 'scale(1)' },
    ], 600);
    if (reducedMotion.matches) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'confetti';
    document.body.append(canvas);
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const colors = ['#fcd34d', '#f472b6', '#34d399', '#60a5fa', '#fb923c', '#ffffff', '#a78bfa'];
    const gravity = 0.32;
    const pieces = [];

    const popper = (x, angle) => {
      for (let i = 0; i < 80; i++) {
        const a = angle + (Math.random() - 0.5) * 0.8;
        const v = Math.sqrt(1.6 * gravity * h) * (0.55 + Math.random() * 0.6);
        pieces.push({
          x, y: h,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          size: 6 + Math.random() * 6,
          rot: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 0.3,
          flip: Math.random() * Math.PI,
          color: colors[(Math.random() * colors.length) | 0],
          round: Math.random() < 0.3,
        });
      }
    };
    popper(0, -Math.PI / 3);
    popper(w, (-2 * Math.PI) / 3);

    const balloonColors = ['#f43f5e', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#fb923c', '#f472b6'];
    const scale = Math.max(0.7, Math.min(w, h) / 700);
    const balloons = Array.from({ length: Math.round(Math.min(16, 6 + w / 120)) }, () => {
      const r = (22 + Math.random() * 14) * scale;
      return {
        x: r + Math.random() * (w - 2 * r),
        y: h + r * 1.3 + Math.random() * h * 0.6,
        r,
        vy: -(2.1 + Math.random() * 1.6) * (h / 700 + 0.4),
        phase: Math.random() * Math.PI * 2,
        color: balloonColors[(Math.random() * balloonColors.length) | 0],
      };
    });

    const drawBalloon = (b, t) => {
      const x = b.x + Math.sin(t / 700 + b.phase) * 12 * scale;
      const { y, r } = b;
      const ry = r * 1.2;

      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y + ry + 4);
      ctx.quadraticCurveTo(x - 8 * scale, y + ry + 30 * scale, x, y + ry + 60 * scale);
      ctx.quadraticCurveTo(x + 8 * scale, y + ry + 80 * scale, x, y + ry + 95 * scale);
      ctx.stroke();

      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.ellipse(x, y, r, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y + ry - 2);
      ctx.lineTo(x - r * 0.18, y + ry + 6);
      ctx.lineTo(x + r * 0.18, y + ry + 6);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath();
      ctx.ellipse(x - r * 0.38, y - ry * 0.35, r * 0.16, r * 0.34, -0.5, 0, Math.PI * 2);
      ctx.fill();
    };

    const start = performance.now();
    let last = start;

    function frame(now) {
      const dt = Math.min((now - last) / 16.667, 3);
      last = now;
      ctx.clearRect(0, 0, w, h);
      let alive = 0;

      for (const b of balloons) {
        b.y += b.vy * dt;
        if (b.y + b.r * 1.2 + 100 * scale < 0) continue;
        alive++;
        drawBalloon(b, now);
      }

      for (const p of pieces) {
        p.vx *= Math.pow(0.985, dt);
        p.vy = Math.min(p.vy + gravity * dt, 3.2);
        p.x += p.vx * dt + Math.sin(p.flip) * 0.6;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        p.flip += 0.12 * dt;
        if (p.y > h + 20) continue;
        alive++;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.flip));
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      }

      if (alive && now - start < 12000) requestAnimationFrame(frame);
      else canvas.remove();
    }
    requestAnimationFrame(frame);
  }

  function step(delta, e) {
    const next = count + delta;
    if (next < 0 || (limit !== null && next > limit)) return shake();
    count = next;
    save();
    render();
    ripple(e);
    click();
    if (done()) {
      speak(`${count}. ${dir > 0 ? 'Limit reached!' : 'Done!'}`, { interrupt: true });
      celebrate();
    } else {
      speak(count);
      pop(delta);
    }
  }

  function toggleSound() {
    sound = !sound;
    save();
    render();
    if (sound) speak('Sound on', { interrupt: true });
    else stopSpeech();
  }

  function reset() {
    if (count === start()) return;
    count = start();
    save();
    render();
    animate(countEl, [{ transform: 'scale(.85)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], 180);
  }

  tapBtn.addEventListener('click', (e) => step(dir, e));
  $('reset').addEventListener('click', reset);
  soundBtn.hidden = !canSpeak;
  soundBtn.addEventListener('click', toggleSound);

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || dialog.open) return;
    switch (e.key) {
      case ' ': case 'Enter':
        if (document.activeElement && document.activeElement !== document.body) return;
        step(dir);
        break;
      case '+': case '=': case 'ArrowUp': step(1); break;
      case '-': case '_': case 'ArrowDown': step(-1); break;
      case 'r': case 'R': reset(); break;
      case 's': case 'S': if (canSpeak) toggleSound(); break;
      default: return;
    }
    e.preventDefault();
  });

  $('settings').addEventListener('click', () => {
    limitInput.value = limit ?? '';
    dirInputs.forEach((input) => { input.checked = Number(input.value) === dir; });
    updateLimitField();
    dialog.returnValue = '';
    dialog.showModal();
  });

  function updateLimitField() {
    const down = dialog.querySelector('input[name="dir"]:checked')?.value === '-1';
    limitLabel.textContent = down ? 'Start from' : 'Limit';
    limitInput.placeholder = down ? 'e.g. 10' : 'No limit';
    limitHint.textContent = down
      ? 'Each tap counts down from this number to 0.'
      : 'Counting stops at this number. Leave empty for no limit.';
  }

  dirInputs.forEach((input) => input.addEventListener('change', updateLimitField));

  $('settings-cancel').addEventListener('click', () => dialog.close());

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => {
    if (dialog.returnValue !== 'save') return;
    const prevDir = dir;
    const prevLimit = limit;
    const n = parseInt(limitInput.value, 10);
    limit = n > 0 ? n : null;
    const checked = dialog.querySelector('input[name="dir"]:checked');
    dir = checked && checked.value === '-1' ? -1 : 1;
    if (dir !== prevDir || (dir < 0 && limit !== prevLimit)) count = start();
    clamp();
    save();
    render();
  });

  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { load(); render(); }
  });

  document.addEventListener('touchstart', () => {}, { passive: true });

  load();
  render();
})();
