// alert.js — 자세 분류 & 알림 담당
// Turtle Neck 상태가 일정 시간 이상 지속되면
// 화면 상단에 non-blocking warning message를 표시하는 로직

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
    } else {
      this.reset();
    }
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
    let warningMessage = document.getElementById('warning-message');

    if (!warningMessage) {
      warningMessage = document.createElement('div');
      warningMessage.id = 'warning-message';
      document.body.appendChild(warningMessage);
    }

    warningMessage.textContent = '자세를 바로 잡아주세요!';

    warningMessage.style.display = 'block';
    warningMessage.style.position = 'fixed';
    warningMessage.style.top = '24px';
    warningMessage.style.left = '50%';
    warningMessage.style.transform = 'translateX(-50%)';

    warningMessage.style.backgroundColor = '#ff4d4f';
    warningMessage.style.color = 'white';
    warningMessage.style.padding = '16px 28px';
    warningMessage.style.borderRadius = '14px';
    warningMessage.style.fontWeight = 'bold';
    warningMessage.style.fontSize = '20px';
    warningMessage.style.zIndex = '9999';
    warningMessage.style.boxShadow = '0 6px 16px rgba(0,0,0,0.3)';
  }

  hideWarning() {
    const warningMessage = document.getElementById('warning-message');

    if (warningMessage) {
      warningMessage.style.display = 'none';
    }
  }

  reset() {
    this.badPostureStartTime = null;
    this.warningShown = false;
    this.hideWarning();
  }
}

window.AlertManager = AlertManager;
