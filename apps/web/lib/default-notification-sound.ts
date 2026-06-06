type BrowserAudioWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

type RequestNotificationAudioContext = AudioContext;

let sharedContext: RequestNotificationAudioContext | null = null;
let unlockListenersInstalled = false;

function getAudioContextConstructor(targetWindow: BrowserAudioWindow) {
  return targetWindow.AudioContext ?? targetWindow.webkitAudioContext;
}

async function getOrCreateAudioContext(targetWindow: BrowserAudioWindow) {
  const AudioContextConstructor = getAudioContextConstructor(targetWindow);
  if (!AudioContextConstructor) {
    return null;
  }

  sharedContext ??= new AudioContextConstructor();
  if (sharedContext.state === "suspended") {
    await sharedContext.resume();
  }

  return sharedContext;
}

export function initializeDefaultRequestNotificationSound(targetWindow: BrowserAudioWindow | undefined = globalThis.window as BrowserAudioWindow | undefined) {
  if (!targetWindow || unlockListenersInstalled || !getAudioContextConstructor(targetWindow)) {
    return;
  }

  unlockListenersInstalled = true;
  const unlock = () => {
    void getOrCreateAudioContext(targetWindow).catch(() => undefined);
  };
  const options = { once: true, passive: true };

  targetWindow.addEventListener("pointerdown", unlock, options);
  targetWindow.addEventListener("keydown", unlock, { once: true });
  targetWindow.addEventListener("touchstart", unlock, options);
}

export async function playDefaultRequestNotificationSound(targetWindow: BrowserAudioWindow | undefined = globalThis.window as BrowserAudioWindow | undefined) {
  if (!targetWindow) {
    return false;
  }

  try {
    const context = await getOrCreateAudioContext(targetWindow);
    if (!context || context.state === "suspended") {
      return false;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = context.currentTime;

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(880, startAt);
    gain.gain.setValueAtTime(0.001, startAt);
    gain.gain.exponentialRampToValueAtTime(1, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.28);
    oscillator.frequency.setValueAtTime(1320, startAt + 0.3);
    gain.gain.setValueAtTime(0.001, startAt + 0.3);
    gain.gain.exponentialRampToValueAtTime(1, startAt + 0.315);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.58);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.6);

    return true;
  } catch {
    return false;
  }
}

export function resetDefaultRequestNotificationSoundForTests() {
  sharedContext = null;
  unlockListenersInstalled = false;
}
