// alert.js — 자세 분류 & 알림 담당
// Turtle Neck 상태가 일정 시간 이상 지속되면
// non-blocking warning message를 표시하는 로직

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
    let warningMessage = document.getElementById('warning-message');

    // warning element 없으면 자동 생성
    if (!warningMessage) {
      warningMessage = document.createElement('div');
      warningMessage.id = 'warning-message';
      document.body.appendChild(warningMessage);
    }

    warningMessage.textContent = '자세를 바로 잡아주세요!';

    // 스타일 적용
    warningMessage.style.display = 'block';
    warningMessage.style.position = 'fixed';
    warningMessage.style.top = '20px';
    warningMessage.style.left = '50%';
    warningMessage.style.transform = 'translateX(-50%)';

    warningMessage.style.backgroundColor = '#ff4d4f';
    warningMessage.style.color = 'white';
    warningMessage.style.padding = '14px 22px';
    warningMessage.style.borderRadius = '12px';
    warningMessage.style.fontWeight = 'bold';
    warningMessage.style.fontSize = '16px';
    warningMessage.style.zIndex = '9999';
    warningMessage.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
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
