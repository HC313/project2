// js/posture.js

/**
 * posture.js
 *
 * 역할:
 * pose.js에서 계산한 feature 값을 받아서
 * Normal / Turtle 여부를 판단한다.
 *
 * 사용 feature:
 * - neckAngleDeg
 * - earShoulderRatio
 * - poseRatio
 *
 * annotation팀의 최종 pose_ratio 계산식과 threshold가 확정되면
 * threshold 로직만 수정하면 된다.
 */

function classifyPosture(features, thresholds = {}) {
  if (!features) {
    return {
      label: '미판정',
      score: null,
      reason: 'No features',
    };
  }

  const neckAngleDeg = features.neckAngleDeg;
  const earShoulderRatio = features.earShoulderRatio;
  const poseRatio = features.poseRatio;

  const neckThreshold = thresholds.neckAngleDeg ?? 15;
  const earShoulderThreshold = thresholds.earShoulderRatio ?? 0.3;

  // poseRatio threshold는 annotation팀 기준 확정 전이라 임시로 earShoulderRatio 기준과 동일하게 사용
  const poseRatioThreshold =
    thresholds.poseRatio ?? thresholds.earShoulderRatio ?? 0.3;

  const hasValidFeature =
    neckAngleDeg != null ||
    earShoulderRatio != null ||
    poseRatio != null;

  if (!hasValidFeature) {
    return {
      label: '미판정',
      score: null,
      reason: 'Invalid features',
    };
  }

  const isNeckAngleBad =
    neckAngleDeg != null && neckAngleDeg > neckThreshold;

  const isEarShoulderBad =
    earShoulderRatio != null && earShoulderRatio > earShoulderThreshold;

  const isPoseRatioBad =
    poseRatio != null && poseRatio > poseRatioThreshold;

  const isTurtle =
    isNeckAngleBad || isEarShoulderBad || isPoseRatioBad;

  const badReasons = [];

  if (isNeckAngleBad) {
    badReasons.push(`neckAngleDeg ${neckAngleDeg} > ${neckThreshold}`);
  }

  if (isEarShoulderBad) {
    badReasons.push(
      `earShoulderRatio ${earShoulderRatio} > ${earShoulderThreshold}`
    );
  }

  if (isPoseRatioBad) {
    badReasons.push(`poseRatio ${poseRatio} > ${poseRatioThreshold}`);
  }

  /**
   * 점수 계산
   * 정상 자세면 높은 점수,
   * threshold를 많이 넘을수록 점수를 낮춘다.
   */
  let score = 100;

  if (neckAngleDeg != null) {
    const neckPenalty = Math.max(0, neckAngleDeg - neckThreshold) * 2;
    score -= neckPenalty;
  }

  if (earShoulderRatio != null) {
    const ratioPenalty =
      Math.max(0, earShoulderRatio - earShoulderThreshold) * 80;
    score -= ratioPenalty;
  }

  if (poseRatio != null) {
    const poseRatioPenalty =
      Math.max(0, poseRatio - poseRatioThreshold) * 80;
    score -= poseRatioPenalty;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  if (isTurtle) {
    return {
      label: 'Turtle',
      score,
      reason: badReasons.join(', '),
    };
  }

  return {
    label: 'Normal',
    score,
    reason: 'Within thresholds',
  };
}

// app.js에서 classifyPosture()를 바로 쓸 수 있도록 전역 등록
window.classifyPosture = classifyPosture;
