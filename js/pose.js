// js/pose.js

let pose = null;
let lastVideoTime = -1;
let lastLandmarks = null;

/**
 * MediaPipe Pose를 한 번만 초기화하는 함수
 */
async function initPose() {
  if (pose) return pose;

  pose = new Pose({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
  });

  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  pose.onResults((results) => {
    if (!results.poseLandmarks) {
      lastLandmarks = null;
      return;
    }

    lastLandmarks = convertLandmarks(results.poseLandmarks);
  });

  return pose;
}

/**
 * MediaPipe normalized landmark를 pixel 좌표로 변환
 */
function convertLandmarks(poseLandmarks) {
  const video = document.getElementById('webcam');

  const w = video.videoWidth || video.clientWidth || 1;
  const h = video.videoHeight || video.clientHeight || 1;

  const toPixel = (lm) => ({
    x: lm.x * w,
    y: lm.y * h,
    z: lm.z ?? 0,
    visibility: lm.visibility ?? 0,
  });

  const nose         = poseLandmarks[0];
  const leftEar      = poseLandmarks[7];
  const rightEar     = poseLandmarks[8];
  const leftShoulder = poseLandmarks[11];
  const rightShoulder= poseLandmarks[12];
  const leftHip      = poseLandmarks[23];
  const rightHip     = poseLandmarks[24];

  if (!nose || !leftEar || !rightEar ||
      !leftShoulder || !rightShoulder ||
      !leftHip || !rightHip) {
    return null;
  }

  return {
    nose:           toPixel(nose),
    leftEar:        toPixel(leftEar),
    rightEar:       toPixel(rightEar),
    leftShoulder:   toPixel(leftShoulder),
    rightShoulder:  toPixel(rightShoulder),
    leftHip:        toPixel(leftHip),
    rightHip:       toPixel(rightHip),

    l_ear:      toPixel(leftEar),
    r_ear:      toPixel(rightEar),
    l_shoulder: toPixel(leftShoulder),
    r_shoulder: toPixel(rightShoulder),
    l_hip:      toPixel(leftHip),
    r_hip:      toPixel(rightHip),

    imgWidth:  w,
    imgHeight: h,
  };
}

function midpoint(p1, p2) {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
    z: ((p1.z ?? 0) + (p2.z ?? 0)) / 2,
  };
}

function distance2D(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function computePoseRatio(earCenter, shoulderCenter, hipCenter) {
  const headForwardOffset = Math.abs(earCenter.x - shoulderCenter.x);
  const torsoLength = distance2D(shoulderCenter, hipCenter) || 1;
  return headForwardOffset / torsoLength;
}

/**
 * keypoint 기준으로 목~상체 crop 좌표를 계산한다.
 *
 * 기준 포인트:
 *   - 상단: 귀 중심 y에서 머리 높이만큼 위로 (귀~어깨 거리의 0.6배)
 *   - 하단: 어깨 중심 y에서 어깨~골반 거리의 0.4배 아래
 *   - 좌우: 어깨 너비의 1.3배로 중심에서 확장
 *
 * 반환: { x, y, w, h } — 비디오 픽셀 좌표 기준 (mirror 보정 전)
 * 범위를 벗어나면 클램핑 처리함.
 */
export function computeCropBox(landmarks) {
  if (!landmarks) return null;

  const {
    leftEar, rightEar,
    leftShoulder, rightShoulder,
    leftHip, rightHip,
    imgWidth: W, imgHeight: H,
  } = landmarks;

  if (!leftEar || !rightEar || !leftShoulder || !rightShoulder ||
      !leftHip  || !rightHip) return null;

  const earCenter    = midpoint(leftEar, rightEar);
  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const hipCenter    = midpoint(leftHip, rightHip);

  const shoulderWidth  = distance2D(leftShoulder, rightShoulder);
  const earToShoulder  = distance2D(earCenter, shoulderCenter);
  const shoulderToHip  = distance2D(shoulderCenter, hipCenter);

  // crop 경계 계산
  const topY    = earCenter.y - earToShoulder * 0.6;       // 머리 위 여백
  const bottomY = shoulderCenter.y + shoulderToHip * 0.4;  // 상체 일부 포함
  const halfW   = shoulderWidth * 0.65;                     // 좌우 여백
  const centerX = shoulderCenter.x;

  const x = Math.max(0, Math.round(centerX - halfW));
  const y = Math.max(0, Math.round(topY));
  const x2 = Math.min(W, Math.round(centerX + halfW));
  const y2 = Math.min(H, Math.round(bottomY));

  const w = x2 - x;
  const h = y2 - y;

  if (w < 10 || h < 10) return null;

  return { x, y, w, h };
}

/**
 * app.js에서 호출: 웹캠 video를 MediaPipe에 넣고 landmark를 반환
 */
export async function estimateLandmarks(video) {
  const poseInstance = await initPose();

  if (!video || video.readyState < 2) return null;

  if (video.currentTime === lastVideoTime) return lastLandmarks;

  lastVideoTime = video.currentTime;

  try {
    await poseInstance.send({ image: video });
    return lastLandmarks;
  } catch (error) {
    console.error('MediaPipe pose estimation failed:', error);
    return null;
  }
}

/**
 * app.js에서 호출: landmark → posture features
 */
export function computeFeatures(landmarks, video) {
  if (!landmarks) {
    return {
      earShoulderRatio: null,
      headForwardPx: null,
      neckAngleDeg: null,
      shoulderSymmetry: null,
      poseRatio: null,
    };
  }

  const {
    leftEar, rightEar,
    leftShoulder, rightShoulder,
    leftHip, rightHip,
  } = landmarks;

  if (!leftEar || !rightEar || !leftShoulder || !rightShoulder ||
      !leftHip  || !rightHip) {
    return {
      earShoulderRatio: null,
      headForwardPx: null,
      neckAngleDeg: null,
      shoulderSymmetry: null,
      poseRatio: null,
    };
  }

  const earCenter      = midpoint(leftEar, rightEar);
  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const hipCenter      = midpoint(leftHip, rightHip);
  const shoulderWidth  = distance2D(leftShoulder, rightShoulder) || 1;

  const dx = earCenter.x - shoulderCenter.x;
  const dy = shoulderCenter.y - earCenter.y;

  const neckAngleDeg     = Math.abs(Math.atan2(dx, dy) * 180 / Math.PI);
  const earShoulderRatio = Math.abs(dx) / shoulderWidth;
  const headForwardPx    = Math.round(dx);
  const shoulderSymmetry =
    Math.abs(leftShoulder.y - rightShoulder.y) / shoulderWidth;
  const poseRatio = computePoseRatio(earCenter, shoulderCenter, hipCenter);

  return {
    earShoulderRatio: Number(earShoulderRatio.toFixed(2)),
    headForwardPx,
    neckAngleDeg: Number(neckAngleDeg.toFixed(1)),
    shoulderSymmetry: Number(shoulderSymmetry.toFixed(2)),
    poseRatio: Number(poseRatio.toFixed(2)),

    imgWidth:  landmarks.imgWidth,
    imgHeight: landmarks.imgHeight,

    l_ear_x: Number(leftEar.x.toFixed(1)),
    l_ear_y: Number(leftEar.y.toFixed(1)),
    l_ear_z: Number((leftEar.z ?? 0).toFixed(4)),
    r_ear_x: Number(rightEar.x.toFixed(1)),
    r_ear_y: Number(rightEar.y.toFixed(1)),
    r_ear_z: Number((rightEar.z ?? 0).toFixed(4)),
    l_shoulder_x: Number(leftShoulder.x.toFixed(1)),
    l_shoulder_y: Number(leftShoulder.y.toFixed(1)),
    l_shoulder_z: Number((leftShoulder.z ?? 0).toFixed(4)),
    r_shoulder_x: Number(rightShoulder.x.toFixed(1)),
    r_shoulder_y: Number(rightShoulder.y.toFixed(1)),
    r_shoulder_z: Number((rightShoulder.z ?? 0).toFixed(4)),
    l_hip_x: Number(leftHip.x.toFixed(1)),
    l_hip_y: Number(leftHip.y.toFixed(1)),
    l_hip_z: Number((leftHip.z ?? 0).toFixed(4)),
    r_hip_x: Number(rightHip.x.toFixed(1)),
    r_hip_y: Number(rightHip.y.toFixed(1)),
    r_hip_z: Number((rightHip.z ?? 0).toFixed(4)),

    earCenter,
    shoulderCenter,
    hipCenter,
  };
}
