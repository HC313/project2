import { CameraController } from './camera.js';
import { estimateLandmarks, computeFeatures } from './pose.js';
import { classifyPosture } from './posture.js';
import { AlertManager, appendHistory } from './alert.js';

const els = {
  video: document.getElementById('webcam'),
  canvas: document.getElementById('overlay'),
  score: document.getElementById('posture-score'),
  earShoulder: document.getElementById('feature-ear-shoulder'),
  headForward: document.getElementById('feature-head-forward'),
  neckAngle: document.getElementById('feature-neck-angle'),
  shoulderSym: document.getElementById('feature-shoulder-sym'),
  modelPred: document.getElementById('feature-model-pred'),
  btnStart: document.getElementById('btn-start'),
  btnStop: document.getElementById('btn-stop'),
  badgeNormal: document.getElementById('badge-normal'),
  badgeTurtle: document.getElementById('badge-turtle'),
  thNeck: document.getElementById('th-neck-angle'),
  thRatio: document.getElementById('th-ear-shoulder'),
  stateMP: document.getElementById('state-mediapipe'),
  stateTF: document.getElementById('state-tf'),
  stateData: document.getElementById('state-data'),
  modelStatus: document.getElementById('model-status'),
  history: document.getElementById('history-list'),
};

els.history.dataset.empty = 'true';

const cam = new CameraController(els.video);
const alertMgr = new AlertManager({
  windowMs: 5000,
  onNotify: () => {
    appendHistory(els.history, '거북목 상태 5초 지속 — 자세를 바로 세워주세요');
    flashBadges();
    try { navigator.vibrate?.(200); } catch {}
  }
});

let running = false;

function getThresholds() {
  return {
    neckAngleDeg: parseFloat(els.thNeck.value) || 15,
    earShoulderRatio: parseFloat(els.thRatio.value) || 0.3,
  };
}

function setStatus(text) { els.modelStatus.textContent = text; }

function drawOverlay(landmarks) {
  const ctx = els.canvas.getContext('2d');
  // 1) 캔버스를 ‘표시되는 비디오 크기’에 맞춤
  const dispW = els.video.clientWidth;
  const dispH = els.video.clientHeight;
  els.canvas.width = dispW;
  els.canvas.height = dispH;
  ctx.clearRect(0, 0, dispW, dispH);
  if (!landmarks) return;
  // 2) 원본 해상도(센서/스트림) → 표시 크기 스케일
  const srcW = els.video.videoWidth || dispW;
  const srcH = els.video.videoHeight || dispH;
  const scaleX = dispW / srcW;
  const scaleY = dispH / srcH;
  // 3) CSS 미러링을 썼다면(예: transform: scaleX(-1)) 캔버스도 반전
  const isMirrored = getComputedStyle(els.video).transform.includes('matrix(-1');
  ctx.save();
  if (isMirrored) {
    ctx.translate(dispW, 0);
    ctx.scale(-1, 1);
  }
  ctx.fillStyle = '#5b8cff';
  for (const key of Object.keys(landmarks)) {
    const p = landmarks[key];
    const x = p.x * scaleX;
    const y = p.y * scaleY;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function updateUI(features, result) {
  const nf = (v, alt='--') => (v==null || Number.isNaN(v)) ? alt : String(v);

  els.earShoulder.textContent = nf(features.earShoulderRatio);
  els.headForward.textContent = nf(features.headForwardPx);
  els.neckAngle.textContent = nf(features.neckAngleDeg);
  els.shoulderSym.textContent = nf(features.shoulderSymmetry);
  els.modelPred.textContent = result.label === '미판정' ? '--' : result.label;

  els.score.textContent = result.score == null ? '-- / 100' : `${result.score} / 100`;

  const isBad = result.label === 'Turtle';
  els.badgeTurtle.classList.toggle('hidden', !isBad);
  els.badgeNormal.classList.toggle('hidden', isBad);
}

function flashBadges() {
  els.badgeTurtle.classList.add('danger');
  setTimeout(() => els.badgeTurtle.classList.remove('danger'), 800);
}

async function onFrame(video) {
  if (!running) return;

  // 실제 구현에선 MediaPipe Pose 호출
  const landmarks = await estimateLandmarks(video);
  drawOverlay(landmarks);

  const features = computeFeatures(landmarks, video);
  const result = classifyPosture(features, getThresholds());
  updateUI(features, result);

  const isBad = result.label === 'Turtle';
  alertMgr.update(isBad);

  // 상태 표시(더미)
  els.stateMP.textContent = '대기';
  els.stateTF.textContent = '미학습';
  els.stateData.textContent = '미학습 0개';
}

els.btnStart.addEventListener('click', async () => {
  try {
    await cam.start();
    running = true;
    setStatus('분석 중');
    cam.onFrame(onFrame);
  } catch (e) {
    setStatus('카메라 권한 필요');
    appendHistory(els.history, '카메라 시작 실패: 권한을 확인하세요');
  }
});

els.btnStop.addEventListener('click', () => {
  running = false;
  cam.stop();
  setStatus('대기 중');
});

// 초기 뱃지 가시성 조정
els.badgeTurtle.classList.add('hidden');
