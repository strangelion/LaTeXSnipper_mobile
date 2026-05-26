// Particle background — math symbol animation on canvas
// Extracted from ocr_demo.html, logic preserved 100%

const SYMBOLS = ['∑', '∫', '∂', '∇', '√', 'π', '∞', '≈', '≠', '≤', '≥', 'Δ', 'Σ', 'λ', 'θ', 'α', 'β', 'γ', 'δ', 'ε', 'μ', 'σ', 'τ', 'ω', 'φ', 'ψ', '×', '÷'];
const FORMULAS = ['e^{iπ}+1=0', '∫e^{-x²}dx', 'Σ1/n²', 'a²+b²=c²', 'sin²θ+cos²θ=1', 'F=ma', 'E=mc²'];

let canvas, ctx;
let mouse = { x: -100, y: -100 };
let trail = [], formulas = [];
let frame = 0;
let lastMove = Date.now();
let checkerCache = null;
let animating = false;
let _rt = null;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  checkerCache = null;
  initFormulas();
}

function buildChecker() {
  if (checkerCache) return;
  checkerCache = document.createElement('canvas');
  checkerCache.width = canvas.width;
  checkerCache.height = canvas.height;
  const ctx2 = checkerCache.getContext('2d');
  const d = document.documentElement.getAttribute('data-theme') === 'dark';
  ctx2.fillStyle = d ? '#0f111a' : '#f8fafc';
  ctx2.fillRect(0, 0, canvas.width, canvas.height);
}

function initFormulas() {
  formulas = [];
  // Mobile: reduce density
  const density = window.innerWidth < 768 ? 160000 : 110000;
  const count = Math.max(8, Math.min(20, Math.floor((canvas.width * canvas.height) / density)));
  for (let i = 0; i < count; i++) {
    formulas.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      content: FORMULAS[Math.floor(Math.random() * FORMULAS.length)],
      size: Math.random() * 12 + 14,
      opacity: 0,
      targetO: Math.random() * 0.2 + 0.15,
      fadeSpeed: Math.random() * 0.006 + 0.002,
      life: Math.random() * 500 + 250,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      phase: 'in',
    });
  }
}

function spawn(cx, cy, px, py) {
  const dx = cx - px, dy = cy - py;
  const sx = (Math.sqrt(dx * dx + dy * dy) > 2 ? dx * 0.15 : 0) + (Math.random() - 0.5) * 1.2;
  const sy = (Math.sqrt(dx * dx + dy * dy) > 2 ? dy * 0.15 : 0) + Math.random() * 0.5 + 0.3;
  trail.push({
    x: cx + (Math.random() - 0.5) * 6,
    y: cy + (Math.random() - 0.5) * 6,
    s: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    life: 1,
    size: Math.random() * 7 + 12,
    vx: sx,
    vy: sy,
  });
  if (trail.length > 20) trail.splice(0, trail.length - 20);
}

function animate() {
  if (!animating) return;
  frame++;
  if (document.hidden) { requestAnimationFrame(animate); return; }

  buildChecker();
  ctx.drawImage(checkerCache, 0, 0);
  const fc = 'rgba(180,200,240,0.7)';

  if (frame % 2 === 0) {
    for (let i = 0; i < formulas.length; i++) {
      const f = formulas[i];
      f.x += f.vx;
      f.y += f.vy;
      f.life--;
      if (f.phase === 'in') { f.opacity += f.fadeSpeed; if (f.opacity >= f.targetO) f.phase = 'hold'; }
      else if (f.phase === 'hold') { if (f.life < 60) f.phase = 'out'; }
      else if (f.phase === 'out') { f.opacity -= f.fadeSpeed; }

      if (f.life <= 0 || f.opacity <= 0 || f.x < -100 || f.x > canvas.width + 100 || f.y < -50 || f.y > canvas.height + 50) {
        formulas[i] = {
          x: Math.random() * canvas.width, y: Math.random() * canvas.height,
          content: FORMULAS[Math.floor(Math.random() * FORMULAS.length)],
          size: Math.random() * 12 + 14, opacity: 0,
          targetO: Math.random() * 0.2 + 0.15, fadeSpeed: Math.random() * 0.006 + 0.002,
          life: Math.random() * 500 + 250,
          vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.15,
          phase: 'in',
        };
        continue;
      }
      if (f.opacity < 0.02) continue;

      ctx.save();
      ctx.globalAlpha = f.opacity;
      ctx.fillStyle = fc;
      ctx.font = f.size + 'px "Times New Roman",serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.content, f.x, f.y);
      ctx.restore();
    }
  }

  if (frame % 25 === 0 && Date.now() - lastMove > 800 && mouse.x > 0) {
    trail.push({
      x: mouse.x + (Math.random() - 0.5) * 25,
      y: mouse.y + (Math.random() - 0.5) * 15,
      s: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      life: 1, size: Math.random() * 5 + 10,
      vx: (Math.random() - 0.5) * 0.25, vy: Math.random() * 0.5 + 0.3,
    });
    if (trail.length > 20) trail.splice(0, trail.length - 20);
  }

  for (let i = trail.length - 1; i >= 0; i--) {
    const p = trail[i];
    p.life -= 0.006;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05;
    p.vx *= 0.993;
    if (p.life <= 0) { trail.splice(i, 1); continue; }

    ctx.save();
    ctx.globalAlpha = p.life * 0.75;
    ctx.fillStyle = 'rgba(96,165,250,0.85)';
    ctx.font = p.size + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.s, Math.floor(p.x), Math.floor(p.y));
    ctx.restore();
  }

  requestAnimationFrame(animate);
}

function onMove(e) {
  const px = mouse.x, py = mouse.y;
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  spawn(e.clientX, e.clientY, px, py);
  lastMove = Date.now();
}

export function initParticles(canvasId) {
  canvas = document.getElementById(canvasId);
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  resize();
  initFormulas();

  window.addEventListener('resize', () => {
    clearTimeout(_rt);
    _rt = setTimeout(resize, 150);
  });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', (e) => {
    if (!e.touches.length) return;
    const t = e.touches[0];
    const px = mouse.x, py = mouse.y;
    mouse.x = t.clientX;
    mouse.y = t.clientY;
    spawn(t.clientX, t.clientY, px, py);
    lastMove = Date.now();
  }, { passive: true });

  animating = true;
  animate();
}

export function stopParticles() {
  animating = false;
}
