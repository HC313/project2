// alert.js — 자세 분류 & 알림 담당
// Turtle Neck 상태가 일정 시간 이상 지속되면 warning을 표시하는 로직

class AlertManager {
  constructor({ windowMs = 5000, onNotify } = {}) {
    this.windowMs = windowMs;
    this.onNotify = onNotify;

    this.badPostureStartTime = null;
    this.warningShown = false;
  }

  update(isBadPosture) {
    if (isBadPosture) {
      this.startBadPostureTimer();
      return;
    }

    this.reset();
  }

  startBadPostureTimer() {
    if (this.badPostureStartTime === null) {
      this.badPostureStartTime = Date.now();
    }

    const elapsedTime = Date.now() - this.badPostureStartTime;

    if (elapsedTime >= this.windowMs && !this.warningShown) {
      this.showWarning();
      this.warningShown = true;

      if (typeof this.onNotify === 'function') {
        this.onNotify();
      }
    }
  }

  showWarning() {
    const warningMessage = document.getElementById('warning-message');

    if (warningMessage) {
      warningMessage.textContent = '자세를 바로 잡아주세요!';
      warningMessage.classList.remove('hidden');
    } else {
      alert('자세를 바로 잡아주세요!');
    }
  }

  hideWarning() {
    const warningMessage = document.getElementById('warning-message');

    if (warningMessage) {
      warningMessage.classList.add('hidden');
    }
  }

  reset() {
    this.badPostureStartTime = null;
    this.warningShown = false;
    this.hideWarning();
  }
}

window.AlertManager = AlertManager;
