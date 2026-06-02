type BrowserAudioWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

export async function playDefaultRequestNotificationSound(targetWindow: BrowserAudioWindow | undefined = globalThis.window as BrowserAudioWindow | undefined) {
  if (!targetWindow) {
    return false;
  }

  const AudioContextConstructor = targetWindow.AudioContext ?? targetWindow.webkitAudioContext;
  if (!AudioContextConstructor) {
    return false;
  }

  try {
    const context = new AudioContextConstructor();
    if (context.state === "suspended") {
      await context.resume();
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = context.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, startAt);
    gain.gain.setValueAtTime(0.001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.22);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.24);
    oscillator.onended = () => {
      void context.close();
    };

    return true;
  } catch {
    return false;
  }
}
