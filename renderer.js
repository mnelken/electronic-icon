const stage = document.querySelector('.stage');
const image = document.getElementById('icon');
const canvas = document.getElementById('glow');
const assetStatus = document.getElementById('asset-status');
const requestedImageSrc = image.dataset.src || 'unburnt-bush.jpg';
const context = canvas.getContext('2d');
const fallbackImageSrc = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 2200">
    <defs>
      <radialGradient id="glow" cx="50%" cy="42%" r="38%">
        <stop offset="0%" stop-color="#ffe4a0" stop-opacity="0.95" />
        <stop offset="28%" stop-color="#f6a651" stop-opacity="0.82" />
        <stop offset="58%" stop-color="#b32e1b" stop-opacity="0.62" />
        <stop offset="100%" stop-color="#110707" stop-opacity="1" />
      </radialGradient>
    </defs>
    <rect width="1600" height="2200" fill="#020202" />
    <rect x="120" y="120" width="1360" height="1960" rx="34" fill="#140808" stroke="#7f2e16" stroke-width="8" />
    <circle cx="800" cy="920" r="480" fill="url(#glow)" />
    <path d="M800 360 936 744 1328 760 1014 996 1124 1378 800 1148 476 1378 586 996 272 760 664 744Z" fill="none" stroke="#f0bf73" stroke-width="34" stroke-linejoin="round" />
    <circle cx="800" cy="920" r="164" fill="none" stroke="#f7deb2" stroke-width="22" />
    <text x="800" y="1630" text-anchor="middle" font-family="Arial, sans-serif" font-size="94" fill="#f6dfbe">Placeholder Artwork</text>
    <text x="800" y="1748" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" fill="#f0c17f">Add unburnt-bush.jpg to display the final icon.</text>
  </svg>
`)}`;
const particles = Array.from({ length: 36 }, () => ({
  x: Math.random(),
  y: Math.random(),
  radius: 0.003 + Math.random() * 0.008,
  speedY: 0.00035 + Math.random() * 0.0007,
  drift: (Math.random() - 0.5) * 0.0009,
  phase: Math.random() * Math.PI * 2,
  alpha: 0.18 + Math.random() * 0.35
}));

let renderWidth = 0;
let renderHeight = 0;
let dpr = Math.max(1, window.devicePixelRatio || 1);
let animationStarted = false;

function resizeCanvas() {
  const rect = image.getBoundingClientRect();
  renderWidth = Math.max(1, rect.width);
  renderHeight = Math.max(1, rect.height);
  dpr = Math.max(1, window.devicePixelRatio || 1);

  canvas.style.width = `${renderWidth}px`;
  canvas.style.height = `${renderHeight}px`;
  canvas.width = Math.round(renderWidth * dpr);
  canvas.height = Math.round(renderHeight * dpr);

  const stageRect = stage.getBoundingClientRect();
  canvas.style.left = `${rect.left - stageRect.left}px`;
  canvas.style.top = `${rect.top - stageRect.top}px`;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (!animationStarted) {
    animationStarted = true;
    requestAnimationFrame(drawGlow);
  }
}

function drawGlow(time) {
  if (!renderWidth || !renderHeight) {
    requestAnimationFrame(drawGlow);
    return;
  }

  const t = time * 0.001;
  const centerX = renderWidth * 0.5;
  const centerY = renderHeight * 0.47;
  const baseRadius = Math.min(renderWidth, renderHeight) * 0.19;
  const pulse = 1 + Math.sin(t * 1.4) * 0.045 + Math.sin(t * 0.63 + 1.7) * 0.03;
  const flicker = 0.88 + Math.sin(t * 4.6 + 0.4) * 0.04;

  context.clearRect(0, 0, renderWidth, renderHeight);

  const coreGlow = context.createRadialGradient(
    centerX,
    centerY,
    baseRadius * 0.08,
    centerX,
    centerY,
    baseRadius * 2.4 * pulse
  );
  coreGlow.addColorStop(0, `rgba(255, 224, 150, ${0.32 * flicker})`);
  coreGlow.addColorStop(0.22, `rgba(255, 173, 82, ${0.18 * flicker})`);
  coreGlow.addColorStop(0.55, `rgba(220, 58, 20, ${0.11 * flicker})`);
  coreGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = coreGlow;
  context.fillRect(0, 0, renderWidth, renderHeight);

  const emberGlow = context.createRadialGradient(
    centerX + Math.sin(t * 0.8) * baseRadius * 0.18,
    centerY - baseRadius * 0.1,
    baseRadius * 0.12,
    centerX,
    centerY,
    baseRadius * 1.3 * pulse
  );
  emberGlow.addColorStop(0, 'rgba(255, 110, 70, 0.17)');
  emberGlow.addColorStop(0.5, 'rgba(255, 62, 24, 0.08)');
  emberGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = emberGlow;
  context.fillRect(0, 0, renderWidth, renderHeight);

  particles.forEach((particle, index) => {
    particle.phase += 0.015 + index * 0.00003;
    particle.y -= particle.speedY;
    if (particle.y < -0.08) {
      particle.x = 0.28 + Math.random() * 0.44;
      particle.y = 1.08 + Math.random() * 0.12;
    }

    particle.x += Math.sin(particle.phase) * particle.drift;

    const x = particle.x * renderWidth;
    const y = particle.y * renderHeight;
    const radius =
      particle.radius *
      Math.min(renderWidth, renderHeight) *
      (0.9 + Math.sin(t + particle.phase) * 0.18);

    const particleGlow = context.createRadialGradient(x, y, 0, x, y, radius);
    particleGlow.addColorStop(0, `rgba(255, 224, 168, ${particle.alpha})`);
    particleGlow.addColorStop(0.4, `rgba(255, 152, 70, ${particle.alpha * 0.55})`);
    particleGlow.addColorStop(1, 'rgba(255, 60, 0, 0)');
    context.fillStyle = particleGlow;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  });

  requestAnimationFrame(drawGlow);
}

if (typeof ResizeObserver === 'function') {
  const resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(stage);
  resizeObserver.observe(image);
}

image.addEventListener('load', resizeCanvas);

image.addEventListener('error', () => {
  if (image.currentSrc === fallbackImageSrc) {
    assetStatus.hidden = false;
    resizeCanvas();
    return;
  }

  assetStatus.hidden = false;
  image.src = fallbackImageSrc;
});

window.addEventListener('resize', resizeCanvas);
image.src = requestedImageSrc;
