import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { playDefaultRequestNotificationSound } from "./default-notification-sound";

describe("default notification sound", () => {
  it("returns false when browser audio is unavailable", async () => {
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

    assert.equal(await playDefaultRequestNotificationSound({ AudioContext: FakeAudioContext } as never), true);
    assert.deepEqual(calls, [
      "frequency:880:10",
      "gain:0.001:10",
      "ramp:0.18:10.02",
      "ramp:0.001:10.22",
      "oscillator.connect",
      "gain.connect",
      "start:10",
      "stop:10.24"
    ]);
  });
});
