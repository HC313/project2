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
 *
 * annotation팀 CSV 기준:
 * l_ear_x, l_ear_y, l_ear_z
 * r_ear_x, r_ear_y, r_ear_z
 * l_shoulder_x, l_shoulder_y, l_shoulder_z
 * r_shoulder_x, r_shoulder_y, r_shoulder_z
 * l_hip_x, l_hip_y, l_hip_z
 * r_hip_x, r_hip_y, r_hip_z
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

  // MediaPipe Pose landmark index
  const nose = poseLandmarks[0];

  const leftEar = poseLandmarks[7];
  const rightEar = poseLandmarks[8];

  const leftShoulder = poseLandmarks[11];
  const rightShoulder = poseLandmarks[12];

  const leftHip = poseLandmarks[23];
  const rightHip = poseLandmarks[24];

  if (
    !nose ||
    !leftEar ||
    !rightEar ||
    !leftShoulder ||
    !rightShoulder ||
    !leftHip ||
    !rightHip
  ) {
    return null;
  }

  return {
    // 기존 app overlay용
    nose: toPixel(nose),
    leftEar: toPixel(leftEar),
    rightEar: toPixel(rightEar),
    leftShoulder: toPixel(leftShoulder),
    rightShoulder: toPixel(rightShoulder),
    leftHip: toPixel(leftHip),
    rightHip: toPixel(rightHip),

    // annotation팀 column명과 대응되는 raw-style key도 같이 제공
    l_ear: toPixel(leftEar),
    r_ear: toPixel(rightEar),
    l_shoulder: toPixel(leftShoulder),
    r_shoulder: toPixel(rightShoulder),
    l_hip: toPixel(leftHip),
    r_hip: toPixel(rightHip),

    imgWidth: w,
    imgHeight: h,
  };
}

/**
 * 두 점의 중심점 계산
 */
function midpoint(p1, p2) {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
    z: ((p1.z ?? 0) + (p2.z ?? 0)) / 2,
  };
}

/**
 * 2D 거리 계산
 */
function distance2D(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * annotation팀의 pose_ratio 대응용 계산 함수
 *
 * 현재 임시 정의:
 * poseRatio = |earCenter.x - shoulderCenter.x| / torsoLength
 *
 * 의미:
 * 귀 중심이 어깨 중심선에서 얼마나 벗어났는지를
 * 어깨-골반 중심 거리로 정규화한 값.
 *
 * 나중에 annotation팀의 정확한 pose_ratio 계산식을 받으면
 * 이 함수 내부만 교체하면 됨.
 */
function computePoseRatio(earCenter, shoulderCenter, hipCenter) {
  const headForwardOffset = Math.abs(earCenter.x - shoulderCenter.x);
  const torsoLength = distance2D(shoulderCenter, hipCenter) || 1;

  return headForwardOffset / torsoLength;
}

/**
 * app.js에서 호출하는 함수
 * 웹캠 video를 MediaPipe에 넣고 landmark를 반환
 */
export async function estimateLandmarks(video) {
  const poseInstance = await initPose();

  if (!video || video.readyState < 2) {
    return null;
  }

  // 같은 프레임 중복 처리 방지
  if (video.currentTime === lastVideoTime) {
    return lastLandmarks;
  }

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
 * app.js에서 호출하는 함수
 * landmark를 이용해 posture feature 계산
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
    leftEar,
    rightEar,
    leftShoulder,
    rightShoulder,
    leftHip,
    rightHip,
  } = landmarks;

  if (
    !leftEar ||
    !rightEar ||
    !leftShoulder ||
    !rightShoulder ||
    !leftHip ||
    !rightHip
  ) {
    return {
      earShoulderRatio: null,
      headForwardPx: null,
      neckAngleDeg: null,
      shoulderSymmetry: null,
      poseRatio: null,
    };
  }

  const earCenter = midpoint(leftEar, rightEar);
  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const hipCenter = midpoint(leftHip, rightHip);

  const shoulderWidth =
    distance2D(leftShoulder, rightShoulder) || 1;

  const dx = earCenter.x - shoulderCenter.x;
  const dy = shoulderCenter.y - earCenter.y;

  /**
   * 기존 app 표시용 feature
   */
  const neckAngleDeg = Math.abs(
    Math.atan2(dx, dy) * 180 / Math.PI
  );

  const earShoulderRatio = Math.abs(dx) / shoulderWidth;

  const headForwardPx = Math.round(dx);

  const shoulderSymmetry =
    Math.abs(leftShoulder.y - rightShoulder.y) / shoulderWidth;

  /**
   * annotation팀의 pose_ratio 대응 feature
   */
  const poseRatio = computePoseRatio(
    earCenter,
    shoulderCenter,
    hipCenter
  );

  return {
    // 기존 app.js UI와 posture.js에서 사용
    earShoulderRatio: Number(earShoulderRatio.toFixed(2)),
    headForwardPx,
    neckAngleDeg: Number(neckAngleDeg.toFixed(1)),
    shoulderSymmetry: Number(shoulderSymmetry.toFixed(2)),

    // annotation팀 feature와 맞추기 위한 값
    poseRatio: Number(poseRatio.toFixed(2)),

    // 디버깅/추후 CSV 저장용
    imgWidth: landmarks.imgWidth,
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