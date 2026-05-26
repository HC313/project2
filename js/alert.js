// alert.js — non-blocking alert logic

class AlertManager {
  constructor({ windowMs = 5000, onNotify } = {}) {
    this.windowMs = windowMs;
    this.onNotify = onNotify;

    this.badPostureStartTime = null;
    this.warningShown = false;
  }

  update(isBadPosture) {
    if (isBadPosture) {
      if (this.badPostureStartTime === null) {
        this.badPostureStartTime = Date.now();
      }

      const elapsedTime = Date.now() - this.badPostureStartTime;

      if (elapsedTime >= this.windowMs && !this.warningShown) {
        this.showWarning();
        this.warningShown = true;

        // onNotify error гарвал detection loop зогсохоос хамгаална
        try {
          if (typeof this.onNotify === "function") {
            this.onNotify();
          }
        } catch (error) {
          console.error("onNotify error:", error);
        }
      }
    } else {
      this.reset();
    }
  }

  showWarning() {
    let warningMessage = document.getElementById("warning-message");

    if (!warningMessage) {
      warningMessage = document.createElement("div");
      warningMessage.id = "warning-message";
      document.body.appendChild(warningMessage);
    }

    warningMessage.textContent = "자세를 바로 잡아주세요!";
    warningMessage.style.display = "block";
    warningMessage.style.position = "fixed";
    warningMessage.style.top = "20px";
    warningMessage.style.left = "50%";
    warningMessage.style.transform = "translateX(-50%)";
    warningMessage.style.backgroundColor = "#ff4d4f";
    warningMessage.style.color = "white";
    warningMessage.style.padding = "14px 24px";
    warningMessage.style.borderRadius = "12px";
    warningMessage.style.fontWeight = "bold";
    warningMessage.style.fontSize = "18px";
    warningMessage.style.zIndex = "9999";
    warningMessage.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
  }

  hideWarning() {
    const warningMessage = document.getElementById("warning-message");

    if (warningMessage) {
      warningMessage.style.display = "none";
    }
  }

  reset() {
    this.badPostureStartTime = null;
    this.warningShown = false;
    this.hideWarning();
  }
}

window.AlertManager = AlertManager;
