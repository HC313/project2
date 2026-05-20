// pose.js — MediaPipe & Feature 담당
window.__posture = window.__posture || {};
(function(scope){
  const videoEl = document.getElementById('videoElement');
  const canvas = document.getElementById('overlayCanvas');
  const ctx = canvas.getContext('2d');

  scope.pose = null;

  scope.initMediaPipe = async function initMediaPipe() {
    scope.pose = new Pose({
      locateFile: (file) => `[cdn.jsdelivr.net](https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file})`
    });
    scope.pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    scope.pose.onResults(onPoseResults);

    document.getElementById('mpBadge').textContent = '로드됨';
    document.getElementById('mpBadge').className = 'badge loaded';
    document.getElementById('tfBadge').textContent = '로드됨';
    document.getElementById('tfBadge').className = 'badge loaded';
  };

  async function runLoop() {
    if (!scope.__isRunning) return;
    if (videoEl.readyState >= 2) {
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      await scope.pose.send({ image: videoEl });
    }
    requestAnimationFrame(runLoop);
  }
  scope.__runDetectionLoop = runLoop;

  function onPoseResults(results) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!results.poseLandmarks) return;

    drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color:'rgba(0,229,192,0.3)', lineWidth:2 });
    drawLandmarks(ctx, results.poseLandmarks, { color:'rgba(0,229,192,0.8)', lineWidth:1, radius:3 });

    const features = scope.extractFeatures(results.poseLandmarks, canvas.width, canvas.height);
    if (!features) return;

    let modelResult = scope.ruleBasedClassify(features);
    if (scope.tfModel) {
      modelResult = scope.tfModelClassify(features);
    }

    scope.updateUI(features, modelResult);
    scope.visualizeKeyPoints(results.poseLandmarks, features, modelResult);
  }

  // 특징 추출
  scope.extractFeatures = function extractFeatures(landmarks, w, h) {
    const nose = landmarks[0], leftEar = landmarks[7], rightEar = landmarks[8],
          leftShoulder = landmarks[11], rightShoulder = landmarks[12];
    if (!nose || !leftShoulder || !rightShoulder) return null;

    const toPixel = (lm) => ({ x: lm.x * w, y: lm.y * h });

    const noseP = toPixel(nose);
    const lEarP = toPixel(leftEar);
    const rEarP = toPixel(rightEar);
    const lShoulP = toPixel(leftShoulder);
    const rShoulP = toPixel(rightShoulder);

    const earMidX = (lEarP.x + rEarP.x) / 2, earMidY = (lEarP.y + rEarP.y) / 2;
    const shoulMidX = (lShoulP.x + rShoulP.x) / 2, shoulMidY = (lShoulP.y + rShoulP.y) / 2;

    const shoulderWidth = Math.abs(lShoulP.x - rShoulP.x) || 1;

    const earShoulderVertDist = Math.abs(earMidY - shoulMidY);
    const earShoulderRatio = earShoulderVertDist / shoulderWidth;

    const headForwardDist = earMidX - shoulMidX;
    const headForwardNorm = headForwardDist / shoulderWidth;

    const dx = earMidX - shoulMidX;
    const dy = earMidY - shoulMidY;
    const neckAngleDeg = Math.abs(Math.atan2(dx, dy) * 180 / Math.PI);

    const shoulderAsymmetry = Math.abs(lShoulP.y - rShoulP.y) / shoulderWidth;
    const noseShoulderHoriz = (noseP.x - shoulMidX) / shoulderWidth;

    return {
      earShoulderRatio: Math.round(earShoulderRatio*100)/100,
      headForwardDist: Math.round(headForwardDist),
      headForwardNorm: Math.round(headForwardNorm*100)/100,
      neckAngleDeg: Math.round(neckAngleDeg*10)/10,
      shoulderAsymmetry: Math.round(shoulderAsymmetry*100)/100,
      noseShoulderHoriz: Math.round(noseShoulderHoriz*100)/100,
      earMid:{x:earMidX,y:earMidY},
      shoulMid:{x:shoulMidX,y:shoulMidY},
      nosePos:noseP,
    };
  };
})(window.__posture);
