const stage = document.querySelector('.stage');
const image = document.getElementById('icon');
const canvas = document.getElementById('glow');
const cameraStatus = document.getElementById('camera-status');
const assetStatus = document.getElementById('asset-status');
const requestedImageSrc = image.dataset.src || 'unburnt-bush.jpg';
const context = canvas.getContext('2d');
const searchParams = new URLSearchParams(window.location.search);
const isSmokeTest = searchParams.get('smokeTest') === '1';
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
const rubySparkles = Array.from({ length: 18 }, () => ({
  x: 0.34 + Math.random() * 0.32,
  y: 0.42 + Math.random() * 0.34,
  radius: 0.002 + Math.random() * 0.004,
  speedY: 0.00022 + Math.random() * 0.00045,
  drift: (Math.random() - 0.5) * 0.0012,
  phase: Math.random() * Math.PI * 2,
  alpha: 0.2 + Math.random() * 0.35
}));
const analysisCanvas = document.createElement('canvas');
analysisCanvas.width = 32;
analysisCanvas.height = 24;
const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });
const cameraVideo = document.createElement('video');
cameraVideo.autoplay = true;
cameraVideo.muted = true;
cameraVideo.playsInline = true;

let renderWidth = 0;
let renderHeight = 0;
let dpr = Math.max(1, window.devicePixelRatio || 1);
let animationStarted = false;
let animationFrameId = null;
let resizeObserver = null;
let isDisposed = false;
let cameraSampleTimeoutId = null;
const cameraState = {
  stream: null,
  influence: 0,
  luminance: 0,
  motion: 0,
  lastSampleTime: 0,
  previousFrame: null
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateCameraStatus(message, isActive) {
  cameraStatus.textContent = message;
  cameraStatus.dataset.active = isActive ? 'true' : 'false';
  cameraStatus.hidden = false;
}

function stopStream(stream) {
  if (!stream) {
    return;
  }

  stream.getTracks().forEach((track) => {
    track.stop();
  });
}

function pickCameraDevice(devices) {
  const videoDevices = devices.filter((device) => device.kind === 'videoinput');
  const preferredPatterns = [/infrared/i, /\bir\b/i, /windows hello/i, /depth/i, /realsense/i];

  for (const pattern of preferredPatterns) {
    const match = videoDevices.find((device) => pattern.test(device.label));
    if (match) {
      return match;
    }
  }

  return videoDevices[0] || null;
}

async function openCameraStream(selectedDevice) {
  const preferredConstraints = selectedDevice
    ? {
        deviceId: { exact: selectedDevice.deviceId },
        width: { ideal: 320 },
        height: { ideal: 240 },
        frameRate: { ideal: 15, max: 24 }
      }
    : true;

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: preferredConstraints,
      audio: false
    });
  } catch (error) {
    if (!selectedDevice) {
      throw error;
    }

    return navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });
  }
}

async function initializeCameraReactivity() {
  if (isSmokeTest) {
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) {
    updateCameraStatus('Camera-reactive glow is unavailable in this environment.', false);
    return;
  }

  let bootstrapStream = null;

  try {
    bootstrapStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    if (isDisposed) {
      stopStream(bootstrapStream);
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    if (isDisposed) {
      stopStream(bootstrapStream);
      return;
    }

    const selectedDevice = pickCameraDevice(devices);

    stopStream(bootstrapStream);
    bootstrapStream = null;

    const stream = await openCameraStream(selectedDevice);
    if (isDisposed) {
      stopStream(stream);
      return;
    }

    cameraState.stream = stream;
    cameraVideo.srcObject = stream;
    await cameraVideo.play().catch(() => {});

    if (isDisposed) {
      stopStream(stream);
      cameraVideo.srcObject = null;
      return;
    }

    const label = stream.getVideoTracks()[0]?.label || selectedDevice?.label || 'camera';
    const infraredSelected = /infrared|\bir\b|windows hello|depth|realsense/i.test(label);
    updateCameraStatus(
      infraredSelected
        ? `Infrared-reactive glow active: ${label}`
        : `Camera-reactive glow active: ${label}`,
      true
    );
  } catch (error) {
    stopStream(bootstrapStream);
    updateCameraStatus('Infrared camera unavailable. Using ambient animation only.', false);
  }
}

function sampleCameraInfluence(time) {
  if (
    !analysisContext ||
    !cameraState.stream ||
    cameraVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    time - cameraState.lastSampleTime < 80
  ) {
    cameraState.influence *= 0.985;
    cameraState.motion *= 0.98;
    return;
  }

  cameraState.lastSampleTime = time;
  analysisContext.drawImage(cameraVideo, 0, 0, analysisCanvas.width, analysisCanvas.height);
  const frame = analysisContext.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height).data;

  let totalLuminance = 0;
  let totalMotion = 0;

  for (let index = 0; index < frame.length; index += 4) {
    const luminance = (frame[index] * 0.2126 + frame[index + 1] * 0.7152 + frame[index + 2] * 0.0722) / 255;
    totalLuminance += luminance;

    if (cameraState.previousFrame) {
      totalMotion += Math.abs(luminance - cameraState.previousFrame[index / 4]);
    }
  }

  const pixelCount = frame.length / 4;
  const averageLuminance = totalLuminance / pixelCount;
  const averageMotion = cameraState.previousFrame ? totalMotion / pixelCount : 0;

  cameraState.previousFrame = new Float32Array(pixelCount);
  for (let index = 0, pixelIndex = 0; index < frame.length; index += 4, pixelIndex += 1) {
    cameraState.previousFrame[pixelIndex] =
      (frame[index] * 0.2126 + frame[index + 1] * 0.7152 + frame[index + 2] * 0.0722) / 255;
  }

  cameraState.luminance += (averageLuminance - cameraState.luminance) * 0.2;
  cameraState.motion += (averageMotion - cameraState.motion) * 0.35;
  cameraState.influence +=
    (clamp(cameraState.luminance * 0.75 + cameraState.motion * 2.4, 0, 1) - cameraState.influence) * 0.3;
}

function resizeCanvas() {
  if (isDisposed) {
    return;
  }

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
    animationFrameId = requestAnimationFrame(drawGlow);
  }
}

function drawGlow(time) {
  if (isDisposed) {
    return;
  }

  if (!renderWidth || !renderHeight) {
    animationFrameId = requestAnimationFrame(drawGlow);
    return;
  }

  sampleCameraInfluence(time);

  const t = time * 0.001;
  const centerX = renderWidth * 0.5;
  const centerY = renderHeight * 0.47;
  const baseRadius = Math.min(renderWidth, renderHeight) * 0.19;
  const cameraBoost = 1 + cameraState.influence * 0.2;
  const pulse =
    (1 + Math.sin(t * 1.4) * 0.045 + Math.sin(t * 0.63 + 1.7) * 0.03) * cameraBoost;
  const flicker = 0.88 + Math.sin(t * 4.6 + 0.4) * 0.04 + cameraState.motion * 0.18;

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
  coreGlow.addColorStop(0.22, `rgba(255, 173, 82, ${(0.18 + cameraState.luminance * 0.05) * flicker})`);
  coreGlow.addColorStop(0.55, `rgba(220, 58, 20, ${(0.11 + cameraState.motion * 0.05) * flicker})`);
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
    particle.y -= particle.speedY * (1 + cameraState.influence * 0.6);
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
      (0.9 + Math.sin(t + particle.phase) * 0.18 + cameraState.motion * 0.35);

    const particleGlow = context.createRadialGradient(x, y, 0, x, y, radius);
    particleGlow.addColorStop(0, `rgba(255, 224, 168, ${particle.alpha + cameraState.luminance * 0.1})`);
    particleGlow.addColorStop(0.4, `rgba(255, 152, 70, ${(particle.alpha * 0.55) + cameraState.motion * 0.08})`);
    particleGlow.addColorStop(1, 'rgba(255, 60, 0, 0)');
    context.fillStyle = particleGlow;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  });

  rubySparkles.forEach((sparkle, index) => {
    sparkle.phase += 0.02 + index * 0.00004;
    sparkle.y -= sparkle.speedY * (0.8 + cameraState.influence * 0.8);
    sparkle.x += Math.sin(sparkle.phase) * sparkle.drift;

    if (sparkle.y < 0.18 || sparkle.x < 0.26 || sparkle.x > 0.74) {
      sparkle.x = 0.35 + Math.random() * 0.3;
      sparkle.y = 0.62 + Math.random() * 0.22;
      sparkle.alpha = 0.22 + Math.random() * 0.38;
    }

    const x = sparkle.x * renderWidth;
    const y = sparkle.y * renderHeight;
    const radius =
      sparkle.radius *
      Math.min(renderWidth, renderHeight) *
      (1.1 + Math.sin(t * 2.2 + sparkle.phase) * 0.55 + cameraState.motion * 0.9);
    const alpha = clamp(sparkle.alpha + cameraState.influence * 0.16, 0, 0.9);

    const rubyGlow = context.createRadialGradient(x, y, 0, x, y, radius * 1.6);
    rubyGlow.addColorStop(0, `rgba(255, 226, 236, ${alpha})`);
    rubyGlow.addColorStop(0.24, `rgba(255, 84, 132, ${alpha * 0.9})`);
    rubyGlow.addColorStop(0.58, `rgba(210, 22, 78, ${alpha * 0.55})`);
    rubyGlow.addColorStop(1, 'rgba(120, 0, 30, 0)');
    context.fillStyle = rubyGlow;
    context.beginPath();
    context.arc(x, y, Math.max(radius * 1.6, 1.2), 0, Math.PI * 2);
    context.fill();
  });

  animationFrameId = requestAnimationFrame(drawGlow);
}

function handleImageLoad() {
  resizeCanvas();
}

function handleImageError() {
  if (image.currentSrc === fallbackImageSrc) {
    assetStatus.hidden = false;
    resizeCanvas();
    return;
  }

  assetStatus.hidden = false;
  image.src = fallbackImageSrc;
}

function handleWindowResize() {
  resizeCanvas();
}

if (typeof ResizeObserver === 'function') {
  resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(stage);
  resizeObserver.observe(image);
}

image.addEventListener('load', handleImageLoad);
image.addEventListener('error', handleImageError);
window.addEventListener('resize', handleWindowResize);
image.src = requestedImageSrc;
cameraSampleTimeoutId = window.setTimeout(() => {
  initializeCameraReactivity();
}, 150);

window.addEventListener(
  'beforeunload',
  () => {
    isDisposed = true;
    animationStarted = false;

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }

    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    if (cameraSampleTimeoutId !== null) {
      clearTimeout(cameraSampleTimeoutId);
    }

    stopStream(cameraState.stream);
    cameraVideo.srcObject = null;
    image.removeEventListener('load', handleImageLoad);
    image.removeEventListener('error', handleImageError);
    window.removeEventListener('resize', handleWindowResize);
  },
  { once: true }
);
