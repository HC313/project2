// js/app.js

import { CameraController } from './camera.js';
import { estimateLandmarks, computeFeatures, computeCropBox } from './pose.js';

// ─────────────────────────────────────────────
// DOM 요소
// ─────────────────────────────────────────────
const els = {
  video:  document.getElementById('webcam'),
  canvas: document.getElementById('overlay'),

  // crop 미리보기용 캔버스 (index.html에 추가됨)
  cropCanvas: document.getElementById('crop-canvas'),

  score: document.getElementById('posture-score'),

  earShoulder: document.getElementById('feature-ear-shoulder'),
  headForward: document.getElementById('feature-head-forward'),
  neckAngle:   document.getElementById('feature-neck-angle'),
  shoulderSym: document.getElementById('feature-shoulder-sym'),
  poseRatio:   document.getElementById('feature-pose-ratio'),
  modelPred:   document.getElementById('feature-model-pred'),

  // 추가된 UI (index.html에 추가됨)
  turtleProb:    document.getElementById('feature-turtle-prob'),
  turtleDuration:document.getElementById('feature-turtle-duration'),

  btnStart: document.getElementById('btn-start'),
  btnStop:  document.getElementById('btn-stop'),

  badgeNormal: document.getElementById('badge-normal'),
  badgeTurtle: document.getElementById('badge-turtle'),

  thNeck:  document.getElementById('th-neck-angle'),
  thRatio: document.getElementById('th-ear-shoulder'),

  stateMP:     document.getElementById('state-mediapipe'),
  stateTF:     document.getElementById('state-tf'),
  stateData:   document.getElementById('state-data'),
  modelStatus: document.getElementById('model-status'),

  history: document.getElementById('history-list'),
};

if (els.history) {
  els.history.dataset.empty = 'true';
}

// ─────────────────────────────────────────────
// 카메라 / 알림
// ─────────────────────────────────────────────
const cam = new CameraController(els.video);

const alertMgr = new AlertManager({
  windowMs: 5000,
  onNotify: () => {
    appendHistory(els.history, '거북목 상태 5초 지속 — 자세를 바로 세워주세요');
    flashBadges();
    try { navigator.vibrate?.(200); } catch {}
  },
});

// ─────────────────────────────────────────────
// Baseline 보정 (정상 자세 기준점)
// ─────────────────────────────────────────────
let baselineScores  = [];
let baselineScore   = null;
let isCalibrating   = true;
let recentScores    = [];
let turtleFrameCount = 0;

const BASELINE_FRAMES = 90;      // 처음 3초 (30fps 기준)
const WINDOW_SIZE     = 30;      // 이동평균 윈도우
const DIFF_THRESHOLD  = 0.008;   // baseline보다 0.8%p 이상 증가하면 의심
const REQUIRED_FRAMES = 90;      // 3초 지속되면 Turtle 판정

function updatePostureWithBaseline(turtleProb) {
  // 보정 중
  if (isCalibrating) {
    baselineScores.push(turtleProb);
    if (baselineScores.length >= BASELINE_FRAMES) {
      baselineScore =
        baselineScores.reduce((sum, v) => sum + v, 0) / baselineScores.length;
      isCalibrating = false;
      console.log('Baseline 보정 완료. baselineScore:', baselineScore);
      appendHistory(els.history, 'Baseline 보정 완료 — 실시간 감지 시작');
    }
    return 'calibrating';
  }

  // 이동평균 계산
  recentScores.push(turtleProb);
  if (recentScores.length > WINDOW_SIZE) recentScores.shift();

  const avgScore = recentScores.reduce((sum, v) => sum + v, 0) / recentScores.length;
  const diff = avgScore - baselineScore;

  if (diff > DIFF_THRESHOLD) {
    turtleFrameCount += 1;
  } else {
    turtleFrameCount = 0;
  }

  return turtleFrameCount >= REQUIRED_FRAMES ? 'turtle' : 'normal';
}

// ─────────────────────────────────────────────
// TensorFlow.js 모델
// ─────────────────────────────────────────────
let tfModel = null;

/**
 * model/model.json 을 불러온다.
 * 경로는 프로젝트 루트 기준 model/model.json 으로 고정.
 * 서버 구조에 따라 경로 변경 가능.
 */
async function loadTFModel() {
  setSystemState({ tf: '로딩 중...' });
  try {
    tfModel = await tf.loadGraphModel('./model/model.json');
    // 모델을 한 번 워밍업해서 첫 predict 지연을 줄인다
    const dummy = tf.zeros([1, 224, 224, 3]);
    tfModel.predict(dummy).dispose();
    dummy.dispose();

    setSystemState({ tf: '로드 완료' });
    appendHistory(els.history, 'TF 모델 로드 완료');
    console.log('TF model loaded. Input shape:', tfModel.inputs[0].shape);
  } catch (err) {
    console.error('TF 모델 로드 실패:', err);
    setSystemState({ tf: '로드 실패' });
    appendHistory(els.history, 'TF 모델 로드 실패 — 규칙 기반으로 동작합니다');
  }
}

// ─────────────────────────────────────────────
// Crop → Tensor → Predict
// ─────────────────────────────────────────────

/** 오프스크린 캔버스를 재사용 (매 프레임 생성 방지) */
const offscreen = document.createElement('canvas');
offscreen.width  = 224;
offscreen.height = 224;
const offCtx = offscreen.getContext('2d');

/**
 * video 프레임에서 cropBox 영역을 잘라내어 224×224로 리사이즈한 뒤
 * [0,1] 정규화된 Float32 텐서로 반환.
 *
 * 웹캠이 CSS로 mirror(scaleX(-1))되어 있으므로
 * 실제 픽셀 데이터는 좌우 반전 없이 그대로 읽어야 한다.
 * (MediaPipe도 mirror 없이 원본 frame을 받아 처리하므로 좌표가 일치함)
 *
 * @param {HTMLVideoElement} video
 * @param {{ x, y, w, h }} cropBox
 * @returns {tf.Tensor4D | null}  shape [1, 224, 224, 3]
 */
function cropToTensor(video, cropBox) {
  if (!cropBox) return null;

  const { x, y, w, h } = cropBox;

  try {
    // drawImage로 crop 영역만 224×224로 그린다
    offCtx.drawImage(video, x, y, w, h, 0, 0, 224, 224);
  } catch {
    return null;
  }

  // crop 미리보기 업데이트 (있으면)
  if (els.cropCanvas) {
    const cropCtx = els.cropCanvas.getContext('2d');
    cropCtx.drawImage(offscreen, 0, 0, els.cropCanvas.width, els.cropCanvas.height);
  }

  // MobileNetV2 preprocess_input: [0,255] → [-1,1] (pixel/127.5 - 1.0)
  return tf.tidy(() => {
    const imgTensor = tf.browser.fromPixels(offscreen);        // [224,224,3] uint8
    const normalized = imgTensor.toFloat().div(127.5).sub(1.0);  // [224,224,3] float32 -1~1 (MobileNetV2 preprocess_input)
    return normalized.expandDims(0);                           // [1,224,224,3]
  });
}

/**
 * 텐서를 모델에 넣고 Turtle 확률(0~1)을 반환.
 * 모델 미로드 시 null 반환.
 *
 * @param {tf.Tensor4D} tensor
 * @returns {number | null}
 */
function predictTurtle(tensor) {
  if (!tfModel || !tensor) return null;

  return tf.tidy(() => {
    const output = tfModel.predict(tensor);   // shape [1,1], sigmoid
    return output.dataSync()[0];              // 0에 가까울수록 Normal, 1에 가까울수록 Turtle
  });
}

// ─────────────────────────────────────────────
// Turtle 지속 시간 추적
// ─────────────────────────────────────────────
let turtleStartTime = null;  // Turtle 상태 시작 시각 (ms)

function getTurtleDurationSec() {
  if (turtleStartTime === null) return 0;
  return ((Date.now() - turtleStartTime) / 1000).toFixed(1);
}

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────
function getThresholds() {
  return {
    neckAngleDeg:    parseFloat(els.thNeck?.value)  || 15,
    earShoulderRatio:parseFloat(els.thRatio?.value) || 0.3,
    poseRatio:       parseFloat(els.thRatio?.value) || 0.3,
  };
}

function setStatus(text) {
  if (els.modelStatus) els.modelStatus.textContent = text;
}

function setSystemState({ mp, tf, data } = {}) {
  if (mp   && els.stateMP)   els.stateMP.textContent   = mp;
  if (tf   && els.stateTF)   els.stateTF.textContent   = tf;
  if (data && els.stateData) els.stateData.textContent = data;
}

function drawOverlay(landmarks) {
  const ctx   = els.canvas.getContext('2d');
  const srcW  = els.video.videoWidth  || els.video.clientWidth;
  const srcH  = els.video.videoHeight || els.video.clientHeight;
  const dispW = els.video.clientWidth;
  const dispH = els.video.clientHeight;

  // 캔버스 해상도를 비디오 원본 크기로 설정
  // (CSS transform으로 표시 크기는 조절되므로 여기선 원본 기준)
  els.canvas.width  = srcW;
  els.canvas.height = srcH;
  ctx.clearRect(0, 0, srcW, srcH);

  if (!landmarks) return;

  // MediaPipe 좌표는 비디오 원본 픽셀 기준이므로 스케일 1:1
  // CSS scaleX(-1)이 video와 canvas 모두에 걸려 있어서
  // 좌표를 그대로 쓰면 mirror가 자동으로 맞춰짐
  const pointsToDraw = [
    'nose', 'leftEar', 'rightEar',
    'leftShoulder', 'rightShoulder',
    'leftHip', 'rightHip',
  ];

  ctx.fillStyle = '#5b8cff';
  for (const key of pointsToDraw) {
    const p = landmarks[key];
    if (!p || p.x == null || p.y == null) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─────────────────────────────────────────────
// UI 업데이트
// ─────────────────────────────────────────────
function updateUI(features, result) {
  const nf = (v, alt = '--') =>
    v == null || Number.isNaN(v) ? alt : String(v);

  els.earShoulder.textContent = nf(features?.earShoulderRatio);
  els.headForward.textContent = nf(features?.headForwardPx);
  els.neckAngle.textContent   = nf(features?.neckAngleDeg);
  els.shoulderSym.textContent = nf(features?.shoulderSymmetry);
  if (els.poseRatio) els.poseRatio.textContent = nf(features?.poseRatio);

  // 모델 판정 및 확률
  const labelText = result.label === '미판정' ? '--' : result.label;
  els.modelPred.textContent = labelText;

  // Turtle 확률 (%)
  if (els.turtleProb) {
    els.turtleProb.textContent =
      result.turtleProb != null
        ? `${(result.turtleProb * 100).toFixed(1)}%`
        : '--';
  }

  // Turtle 지속 시간
  if (els.turtleDuration) {
    els.turtleDuration.textContent =
      result.label === 'Turtle'
        ? `${getTurtleDurationSec()}s`
        : '0s';
  }

  // 점수 바
  els.score.textContent =
    result.score == null ? '-- / 100' : `${result.score} / 100`;

  const barEl = document.getElementById('scoreBar');
  if (barEl) {
    barEl.style.width = (result.score ?? 0) + '%';
    barEl.style.background =
      result.score >= 70 ? 'var(--accent)'
      : result.score >= 50 ? 'var(--accent3)'
      : 'var(--accent2)';
  }

  // 배지
  if (result.label === 'Turtle') {
    els.badgeTurtle.className = 'badge error';
    els.badgeNormal.className = 'badge pending';
  } else if (result.label === 'Normal') {
    els.badgeTurtle.className = 'badge pending';
    els.badgeNormal.className = 'badge loaded';
  } else {
    els.badgeTurtle.className = 'badge pending';
    els.badgeNormal.className = 'badge pending';
  }
}

function flashBadges() {
  els.badgeTurtle.style.transition  = 'all 0.2s';
  els.badgeTurtle.style.transform   = 'scale(1.15)';
  els.badgeTurtle.style.boxShadow   = '0 0 15px var(--accent2)';
  setTimeout(() => {
    els.badgeTurtle.style.transform = '';
    els.badgeTurtle.style.boxShadow = '';
  }, 800);
}

// ─────────────────────────────────────────────
// 감지 이력 추가
// ─────────────────────────────────────────────
function appendHistory(container, msg) {
  if (!container) return;

  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();

  const now     = new Date();
  const timeStr = now.toLocaleTimeString('ko-KR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const isGood = msg.includes('완료') || msg.includes('Normal');
  const type   = isGood ? 'good' : 'bad';

  const item = document.createElement('div');
  item.className = 'timeline-item';
  item.innerHTML = `
    <span class="tl-time">${timeStr}</span>
    <div class="tl-dot ${type}"></div>
    <span class="tl-msg">${msg}</span>
  `;
  container.insertBefore(item, container.firstChild);

  while (container.children.length > 20) {
    container.removeChild(container.lastChild);
  }
}

// ─────────────────────────────────────────────
// 메인 프레임 루프
// ─────────────────────────────────────────────
let running = false;

async function onFrame(video) {
  if (!running) return;

  // 1. landmark 추출
  const landmarks = await estimateLandmarks(video);
  drawOverlay(landmarks);

  // 2. feature 계산
  const features = computeFeatures(landmarks, video);

  // 3. crop box 계산
  const cropBox = computeCropBox(landmarks);

  // 4. crop → tensor → TF 예측 (참고용 — UI 표시만)
  let turtleProb = null;
  if (cropBox && tfModel) {
    const tensor = cropToTensor(video, cropBox);
    if (tensor) {
      turtleProb = predictTurtle(tensor);
      tensor.dispose();
    }
  }

  // 5. 최종 판정 — baseline 대비 상대 변화량으로 판정
  let result;
  if (turtleProb != null) {
    const postureState = updatePostureWithBaseline(turtleProb);

    if (postureState === 'calibrating') {
      const progress = Math.round((baselineScores.length / BASELINE_FRAMES) * 100);
      result = {
        label:      '보정 중',
        score:      null,
        turtleProb,
        reason:     `baseline 보정 중... ${progress}%`,
      };
    } else {
      const avgScore   = recentScores.reduce((s, v) => s + v, 0) / recentScores.length;
      const diff       = avgScore - baselineScore;
      const isTurtle   = postureState === 'turtle';
      // diff를 점수로 변환: diff가 클수록 낮은 점수
      const score      = Math.max(0, Math.min(100, Math.round(100 - diff * 5000)));

      result = {
        label:      isTurtle ? 'Turtle' : 'Normal',
        score,
        turtleProb,
        reason:     `diff: ${(diff * 100).toFixed(3)}%p | frames: ${turtleFrameCount}`,
      };
    }
  } else {
    // 모델 미로드 시 규칙 기반 fallback
    const ruleResult = classifyPosture(features, getThresholds());
    result = { ...ruleResult, turtleProb: null };
  }

  // 6. Turtle 지속 시간 갱신
  if (result.label === 'Turtle') {
    if (turtleStartTime === null) turtleStartTime = Date.now();
  } else {
    turtleStartTime = null;
  }

  // 7. UI 업데이트
  updateUI(features, result);

  // 8. 알림 매니저 (5초 지속 시 알림)
  alertMgr.update(result.label === 'Turtle');

  // 9. 시스템 상태 표시
  setSystemState({
    mp:   landmarks ? '동작 중' : '탐지 대기',
    tf:   tfModel   ? '동작 중' : '미로드',
    data: tfModel   ? '모델 사용 중' : '규칙 기반',
  });
}

// ─────────────────────────────────────────────
// 버튼 이벤트
// ─────────────────────────────────────────────
els.btnStart.addEventListener('click', async () => {
  try {
    await cam.start();
    running = true;
    setStatus('분석 중');
    setSystemState({ mp: '동작 중', tf: tfModel ? '동작 중' : '미로드', data: '실행 중' });

    els.btnStart.disabled = false; // 재시작 가능하도록 유지
    els.btnStop.disabled  = false;

    cam.onFrame(onFrame);
  } catch (e) {
    console.error(e);
    setStatus('카메라 권한 필요');
    appendHistory(els.history, '카메라 시작 실패: 권한을 확인하세요');
  }
});

els.btnStop.addEventListener('click', () => {
  running = false;
  cam.stop();
  turtleStartTime = null;
  // baseline 리셋
  baselineScores   = [];
  baselineScore    = null;
  isCalibrating    = true;
  recentScores     = [];
  turtleFrameCount = 0;
  setStatus('대기 중');
  setSystemState({ mp: '대기', tf: tfModel ? '로드됨' : '미로드', data: '대기' });
  els.btnStart.disabled = false;
  els.btnStop.disabled  = true;
});

// ─────────────────────────────────────────────
// 초기화
// ─────────────────────────────────────────────
els.badgeTurtle.className = 'badge pending';
els.badgeNormal.className = 'badge loaded';

setSystemState({ mp: '대기', tf: '로딩 중...', data: '대기' });

// 페이지 로드 시 TF 모델 자동 로드
loadTFModel();
