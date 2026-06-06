import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initializeDefaultRequestNotificationSound, playDefaultRequestNotificationSound, resetDefaultRequestNotificationSoundForTests } from "./default-notification-sound";

describe("default notification sound", () => {
  it("installs one-shot unlock listeners for browser audio", async () => {
    const events: Array<{ event: string; listener: () => void; options: unknown }> = [];
    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      state = "suspended";

      createOscillator() {
        return {
          frequency: { setValueAtTime() {} },
          type: "",
          connect() {},
          start() {},
          stop() {},
          onended: null
        };
      }

      createGain() {
        return {
          connect() {},
          gain: {
            exponentialRampToValueAtTime() {},
            setValueAtTime() {}
          }
        };
      }

      async resume() {
        this.state = "running";
      }

      async close() {}
    }

    resetDefaultRequestNotificationSoundForTests();
    initializeDefaultRequestNotificationSound({
      AudioContext: FakeAudioContext,
      addEventListener(event: string, listener: () => void, options: unknown) {
        events.push({ event, listener, options });
      }
    } as never);

    assert.deepEqual(events.map((event) => event.event), ["pointerdown", "keydown", "touchstart"]);
    events[0]?.listener();
    assert.equal(await playDefaultRequestNotificationSound({ AudioContext: FakeAudioContext } as never), true);
    resetDefaultRequestNotificationSoundForTests();
  });

  it("returns false when browser audio is unavailable", async () => {
    resetDefaultRequestNotificationSoundForTests();
    assert.equal(await playDefaultRequestNotificationSound({} as Window), false);
  });

  it("plays a short default tone when browser audio is available", async () => {
    const calls: string[] = [];
    class FakeAudioContext {
      currentTime = 10;
      destination = {};
      state = "running";

      createOscillator() {
        return {
          frequency: {
            setValueAtTime(value: number, time: number) {
              calls.push(`frequency:${value}:${time}`);
            }
          },
          type: "",
          connect() {
            calls.push("oscillator.connect");
          },
          start(time: number) {
            calls.push(`start:${time}`);
          },
          stop(time: number) {
            calls.push(`stop:${time}`);
          },
          onended: null
        };
      }

      createGain() {
        return {
          connect() {
            calls.push("gain.connect");
          },
          gain: {
            exponentialRampToValueAtTime(value: number, time: number) {
              calls.push(`ramp:${value}:${time}`);
            },
            setValueAtTime(value: number, time: number) {
              calls.push(`gain:${value}:${time}`);
            }
          }
        };
      }

      async resume() {
        calls.push("resume");
      }

      async close() {
        calls.push("close");
      }
    }

    resetDefaultRequestNotificationSoundForTests();
    assert.equal(await playDefaultRequestNotificationSound({ AudioContext: FakeAudioContext } as never), true);
    assert.deepEqual(calls, [
      "frequency:880:10",
      "gain:0.001:10",
      "ramp:1:10.015",
      "ramp:0.001:10.28",
      "frequency:1320:10.3",
      "gain:0.001:10.3",
      "ramp:1:10.315",
      "ramp:0.001:10.58",
      "oscillator.connect",
      "gain.connect",
      "start:10",
      "stop:10.6"
    ]);
    resetDefaultRequestNotificationSoundForTests();
  });
});
