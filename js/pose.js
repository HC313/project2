// pose.js — MediaPipe & Feature 담당
// 실제 MediaPipe가 없다면 랜덤/더미 값을 리턴해 UI 연결만 확인 가능

function deg(rad) { return rad * 180 / Math.PI; }

function distance(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function angleBetween(p1, p2) {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

// 귀-어깨 비율과 목 기울기, 머리 전방 이동 계산
export function computeFeatures(landmarks, video) {
  // landmarks에 필요한 포인트가 없으면 더미
  if (!landmarks) {
    return {
      earShoulderRatio: null,
      neckAngleDeg: null,
      headForwardPx: null,
      shoulderSymmetry: null,
    };
  }

  // 예시 인덱스(좌표계는 화면 픽셀 기준이라고 가정)
  const leftEar = landmarks.leftEar;
  const rightEar = landmarks.rightEar;
  const leftShoulder = landmarks.leftShoulder;
  const rightShoulder = landmarks.rightShoulder;
  const neckBase = landmarks.neck ?? {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2
  };

  // 목 기울기: 목 기준선과 수직(또는 수평) 기준 간 각도
  const neckAngle = Math.abs(deg(angleBetween(neckBase, leftEar)));
  // 화면 좌표 보정(0~180로 단순화)
  const neckAngleDeg = Math.min(180, Math.round(neckAngle));

  // 귀-어깨 거리 비율: (귀-어깨 거리) / (어깨 폭)
  const earShoulderDist = distance(leftEar, leftShoulder);
  const shoulderWidth = distance(leftShoulder, rightShoulder) || 1;
  const earShoulderRatio = +(earShoulderDist / shoulderWidth).toFixed(2);

  // 머리 전방 이동(px): 귀의 x가 어깨 중점보다 얼마나 전방(화면 오른쪽)인가
  const shoulderMid = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2
  };
  const avgEarX = (leftEar.x + rightEar.x) / 2;
  const headForwardPx = Math.round(avgEarX - shoulderMid.x);

  // 어깨 수평 대칭: 좌/우 어깨 y 차이 절대값
  const shoulderSymmetry = Math.round(Math.abs(leftShoulder.y - rightShoulder.y));

  return { earShoulderRatio, neckAngleDeg, headForwardPx, shoulderSymmetry };
}

// 실제로는 MediaPipe Pose 결과를 반환해야 함. 여기서는 더미 생성.
export async function estimateLandmarks(video) {
  // 간단 더미: 비디오 크기 기준 임의 좌표
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  const midX = w / 2;
  const shoulderY = h * 0.5;
  const earY = h * 0.28;

  // 좌우 어깨, 귀 점
  return {
    leftShoulder: { x: midX - 120, y: shoulderY },
    rightShoulder: { x: midX + 120, y: shoulderY + Math.sin(performance.now()/1000)*5 },
    leftEar: { x: midX - 20 + Math.sin(performance.now()/900)*15, y: earY },
    rightEar: { x: midX + 20 + Math.sin(performance.now()/1100)*15, y: earY },
  };
}
