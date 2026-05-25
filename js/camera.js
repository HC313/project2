// js/camera.js

export class CameraController {
  constructor(videoElement) {
    this.video = videoElement;
    this.stream = null;
    this.frameCallback = null;
    this.animationId = null;
    this.isRunning = false;
  }

  async start() {
    if (!this.video) {
      throw new Error('Video element not found');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user',
      },
      audio: false,
    });

    this.video.srcObject = this.stream;

    await this.video.play();

    const videoMsg = document.getElementById('videoMsg');
    if (videoMsg) {
      videoMsg.style.display = 'none';
    }

    this.isRunning = true;

    return this.stream;
  }

  stop() {
    this.isRunning = false;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }

    const videoMsg = document.getElementById('videoMsg');
    if (videoMsg) {
      videoMsg.style.display = 'flex';
    }
  }

  onFrame(callback) {
    this.frameCallback = callback;

    const loop = async () => {
      if (!this.isRunning) return;

      if (this.video && this.video.readyState >= 2 && this.frameCallback) {
        await this.frameCallback(this.video);
      }

      this.animationId = requestAnimationFrame(loop);
    };

    loop();
  }
}