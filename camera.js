// camera.js — 화면 & 웹캠 담당
export class CameraController {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
    this.listeners = new Set();
  }

  async start(constraints = { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }) {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.stream;
    await this.video.play();
    this._loop();
  }

  stop() {
    if (!this.stream) return;
    this.stream.getTracks().forEach(t => t.stop());
    this.video.pause();
    this.video.srcObject = null;
    this.stream = null;
  }

  onFrame(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }

  _loop = () => {
    if (!this.stream) return;
    for (const cb of this.listeners) cb(this.video);
    requestAnimationFrame(this._loop);
  }
}
