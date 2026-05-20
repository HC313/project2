// posture.js — 자세 분류 & 점수/판정
export function classifyPosture(features, thresholds) {
  const { earShoulderRatio, neckAngleDeg, headForwardPx, shoulderSymmetry } = features;

  // 안전장치: 값이 없으면 미판정
  if (
    earShoulderRatio == null ||
    neckAngleDeg == null ||
    headForwardPx == null ||
    shoulderSymmetry == null
  ) {
    return { label: '미판정', score: null, reasons: [] };
  }

  const reasons = [];
  const badByAngle = neckAngleDeg > thresholds.neckAngleDeg;
  const badByRatio = earShoulderRatio < thresholds.earShoulderRatio;

  if (badByAngle) reasons.push(`목 기울기 ${neckAngleDeg}° > ${thresholds.neckAngleDeg}°`);
  if (badByRatio) reasons.push(`귀-어깨 비율 ${earShoulderRatio} < ${thresholds.earShoulderRatio}`);

  // 간단 점수: 규범에서 벗어날수록 감점
  let score = 100;
  if (badByAngle) score -= Math.min(40, Math.max(5, Math.round((neckAngleDeg - thresholds.neckAngleDeg) * 1.5)));
  if (badByRatio) score -= Math.min(40, Math.max(5, Math.round((thresholds.earShoulderRatio - earShoulderRatio) * 120)));

  // 추가 패널티: 어깨 비대칭/머리 전방 이동 약하게 반영
  score -= Math.min(10, Math.round(Math.abs(shoulderSymmetry) * 0.2));
  score -= Math.min(10, Math.round(Math.abs(headForwardPx) * 0.05));
  score = Math.max(0, Math.min(100, score));

  const label = (badByAngle || badByRatio) ? 'Turtle' : 'Good';
  return { label, score, reasons };
}
