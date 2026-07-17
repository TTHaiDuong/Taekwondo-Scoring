let time: number = 0;
let isRunning: boolean = false;
let interval: NodeJS.Timeout;
let isVisible: boolean = true;
const delta = 10;

function start() {
    if (!isRunning) {
        isRunning = true;
        interval = setInterval(() => {
            time = Math.max(time - delta, 0);
            if (isVisible && (time > 10000 && time % 1000 === 0 || time <= 10000) || time <= 0) postMessage(time);
            if (time <= 0) pause();
        }, delta);
    }
}

function pause() {
    if (isRunning) {
        clearInterval(interval);
        isRunning = false;
    }
}

function reset(initTime: number) {
    pause();
    time = initTime;
    postMessage(time);
}

onmessage = (e) => {
    const { action, initTime, isAppVisible } = e.data;
    switch (action) {
        case "start": start(); break;
        case "pause": pause(); break;
        case "reset": reset(initTime); break;
        case "setIsAppVisible": isVisible = isAppVisible; break;
    }
}