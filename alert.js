// alert.js — 5초 알림 및 이력
export class AlertManager {
  constructor({ onNotify, windowMs = 5000 }) {
    this.onNotify = onNotify;
    this.windowMs = windowMs;
    this._badSince = null;
  }

  update(isBad) {
    const now = performance.now();
    if (isBad) {
      if (this._badSince == null) this._badSince = now;
      const elapsed = now - this._badSince;
      if (elapsed >= this.windowMs) {
        this._badSince = now + 1e9; // 재알림 지연
        this.onNotify?.();
      }
    } else {
      this._badSince = null;
    }
  }
}

export function appendHistory(container, entry) {
  if (container.dataset.empty === 'true') {
    container.innerHTML = '';
    delete container.dataset.empty;
  }
  const row = document.createElement('div');
  row.className = 'entry';
  row.innerHTML = `
    <span>[${new Date().toLocaleTimeString()}]</span>
    <span>${entry}</span>
  `;
  container.prepend(row);
}
