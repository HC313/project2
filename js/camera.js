// camera.js — 화면 & 웹캠 담당
window.__posture = window.__posture || {};
(function(scope){
  let isRunning = false;

  scope.startCamera = async function startCamera() {
    const videoEl = document.getElementById('videoElement');
    document.getElementById('startBtn').disabled = true;

    if (!scope.initMediaPipe) {
      console.error('MediaPipe initializer not found');
    } else if (!scope.pose) {
      await scope.initMediaPipe();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      videoEl.srcObject = stream;
      await videoEl.play();

      document.getElementById('videoMsg').style.display = 'none';
      document.getElementById('stopBtn').disabled = false;
      document.getElementById('collectNormalBtn').disabled = false;
      document.getElementById('collectTurtleBtn').disabled = false;

      scope.setStatus('active', '감지 중');
      isRunning = true;
      scope.__runDetectionLoop();
    } catch (err) {
      console.error(err);
      scope.setStatus('', '카메라 오류');
      document.getElementById('startBtn').disabled = false;
      alert('카메라 접근 권한이 필요합니다.');
    }
  };

  scope.stopCamera = function stopCamera() {
    const videoEl = document.getElementById('videoElement');
    const canvas = document.getElementById('overlayCanvas');
    const ctx = canvas.getContext('2d');

    isRunning = false;
    if (videoEl.srcObject) {
      videoEl.srcObject.getTracks().forEach(t => t.stop());
      videoEl.srcObject = null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('videoMsg').style.display = 'flex';
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('collectNormalBtn').disabled = true;
    document.getElementById('collectTurtleBtn').disabled = true;
    scope.setStatus('', '대기 중');
    scope.resetMetrics();
  };

  // 루프 실행 플래그 노출
  Object.defineProperty(scope, '__isRunning', { get: ()=>isRunning });
})(window.__posture);
