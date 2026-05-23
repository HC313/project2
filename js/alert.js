let turtleNeckStartTime = null;
let warningShown = false;
function showWarning() {
    const warningText =
        document.getElementById("warning-text");
    if (warningText) {
        warningText.innerText =
            "자세를 바로 잡아주세요!";
        warningText.style.display = "block";
    }
}
function hideWarning() {
    const warningText =
        document.getElementById("warning-text");

    if (warningText) {
        warningText.style.display = "none";
    }
}

function handleAlert(posture) {

    if (posture === "Turtle Neck") {
        if (!turtleNeckStartTime) {
            turtleNeckStartTime = Date.now();
        }
        const elapsed =
            Date.now() - turtleNeckStartTime;
        if (elapsed >= 5000 &&
            !warningShown) {
            showWarning();
            warningShown = true;
        }
    } else {
        turtleNeckStartTime = null;
        warningShown = false;
        hideWarning();
    }
}
