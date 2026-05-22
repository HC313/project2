import { CameraController } from './camera.js';
import { estimateLandmarks, computeFeatures } from './pose.js';

const els = {
  video: document.getElementById('webcam'),
  canvas: document.getElementById('overlay'),

  score: document.getElementById('posture-score'),

  earShoulder: document.getElementById('feature-ear-shoulder'),
  headForward: document.getElementById('feature-head-forward'),
  neckAngle: document.getElementById('feature-neck-angle'),
  shoulderSym: document.getElementById('feature-shoulder-sym'),

  // annotation팀 pose_ratio 표시용
  poseRatio: document.getElementById('feature-pose-ratio'),

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

if (els.history) {
  els.history.dataset.empty = 'true';
}

const cam = new CameraController(els.video);

const alertMgr = new AlertManager({
  windowMs: 5000,
  onNotify: () => {
    appendHistory(
      els.history,
      '거북목 상태 5초 지속 — 자세를 바로 세워주세요'
    );
    flashBadges();

    try {
      navigator.vibrate?.(200);
    } catch {}
  },
});

let running = false;

/**
 * 현재 threshold slider 값 가져오기
 *
 * thRatio는 현재 귀-어깨 거리 비율 threshold로 사용.
 * annotation팀 pose_ratio threshold가 확정되면
 * 여기에 poseRatioThreshold를 추가하거나 thRatio를 poseRatio 기준으로 변경 가능.
 */
function getThresholds() {
  return {
    neckAngleDeg: parseFloat(els.thNeck?.value) || 15,
    earShoulderRatio: parseFloat(els.thRatio?.value) || 0.3,

    // 현재는 같은 slider 값을 poseRatio에도 임시 적용
    // annotation팀 threshold가 나오면 별도 slider/값으로 분리 가능
    poseRatio: parseFloat(els.thRatio?.value) || 0.3,
  };
}

function setStatus(text) {
  if (els.modelStatus) {
    els.modelStatus.textContent = text;
  }
}

function setSystemState({ mp, tf, data } = {}) {
  if (mp && els.stateMP) els.stateMP.textContent = mp;
  if (tf && els.stateTF) els.stateTF.textContent = tf;
  if (data && els.stateData) els.stateData.textContent = data;
}

/**
 * MediaPipe에서 추출한 주요 landmark를 canvas에 점으로 표시
 */
function drawOverlay(landmarks) {
  const ctx = els.canvas.getContext('2d');

  const dispW = els.video.clientWidth;
  const dispH = els.video.clientHeight;

  els.canvas.width = dispW;
  els.canvas.height = dispH;

  ctx.clearRect(0, 0, dispW, dispH);

  if (!landmarks) return;

  const srcW = els.video.videoWidth || dispW;
  const srcH = els.video.videoHeight || dispH;

  const scaleX = dispW / srcW;
  const scaleY = dispH / srcH;

  const isMirrored = getComputedStyle(els.video).transform.includes(
    'matrix(-1'
  );

  ctx.save();

  if (isMirrored) {
    ctx.translate(dispW, 0);
    ctx.scale(-1, 1);
  }

  const pointsToDraw = [
    'nose',
    'leftEar',
    'rightEar',
    'leftShoulder',
    'rightShoulder',
    'leftHip',
    'rightHip',
  ];

  ctx.fillStyle = '#5b8cff';

  for (const key of pointsToDraw) {
    const p = landmarks[key];

    if (!p || p.x == null || p.y == null) continue;

    const x = p.x * scaleX;
    const y = p.y * scaleY;

    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * feature 값과 분류 결과를 화면에 표시
 */
function updateUI(features, result) {
  const nf = (v, alt = '--') =>
    v == null || Number.isNaN(v) ? alt : String(v);

  els.earShoulder.textContent = nf(features?.earShoulderRatio);
  els.headForward.textContent = nf(features?.headForwardPx);
  els.neckAngle.textContent = nf(features?.neckAngleDeg);
  els.shoulderSym.textContent = nf(features?.shoulderSymmetry);

  // annotation팀 pose_ratio 표시
  if (els.poseRatio) {
    els.poseRatio.textContent = nf(features?.poseRatio);
  }

  els.modelPred.textContent =
    result.label === '미판정' ? '--' : result.label;

  els.score.textContent =
    result.score == null ? '-- / 100' : `${result.score} / 100`;

  const isBad = result.label === 'Turtle';

  els.badgeTurtle.classList.toggle('hidden', !isBad);
  els.badgeNormal.classList.toggle('hidden', isBad);
}

function flashBadges() {
  els.badgeTurtle.classList.add('danger');

  setTimeout(() => {
    els.badgeTurtle.classList.remove('danger');
  }, 800);
}

/**
 * 매 프레임마다 실행되는 메인 루프
 */
async function onFrame(video) {
  if (!running) return;

  const landmarks = await estimateLandmarks(video);

  drawOverlay(landmarks);

  const features = computeFeatures(landmarks, video);

  const result = classifyPosture(features, getThresholds());

  updateUI(features, result);

  const isBad = result.label === 'Turtle';

  alertMgr.update(isBad);

  setSystemState({
    mp: landmarks ? '동작 중' : '탐지 대기',
    tf: '미학습',
    data: '미학습 0개',
  });
}

els.btnStart.addEventListener('click', async () => {
  try {
    await cam.start();

    running = true;

    setStatus('분석 중');

    setSystemState({
      mp: '동작 중',
      tf: '미학습',
      data: '미학습 0개',
    });

    els.btnStart.disabled = true;
    els.btnStop.disabled = false;

    cam.onFrame(onFrame);
  } catch (e) {
    console.error(e);

    setStatus('카메라 권한 필요');

    appendHistory(
      els.history,
      '카메라 시작 실패: 권한을 확인하세요'
    );
  }
});

els.btnStop.addEventListener('click', () => {
  running = false;

  cam.stop();

  setStatus('대기 중');

  setSystemState({
    mp: '대기',
    tf: '미학습',
    data: '미학습 0개',
  });

  els.btnStart.disabled = false;
  els.btnStop.disabled = true;
});

// 초기 뱃지 가시성 조정
els.badgeTurtle.classList.add('hidden');
els.badgeNormal.classList.remove('hidden');

setSystemState({
  mp: '대기',
  tf: '미학습',
  data: '미학습 0개',
});
