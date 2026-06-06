import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deliverRequestNotificationAlerts, getRequestNotificationPermission, isRequestNotificationSupported } from "./request-notification-alerts";

describe("request notification alerts", () => {
  it("reports notification support and permission without assuming every browser has native alerts", () => {
    assert.equal(isRequestNotificationSupported({ Notification: class {} } as never), true);
    assert.equal(isRequestNotificationSupported({} as never), false);
    assert.equal(getRequestNotificationPermission({ Notification: { permission: "granted" } } as never), "granted");
    assert.equal(getRequestNotificationPermission({} as never), "unsupported");
  });

  it("uses native browser notifications, device vibration, and one high-priority sound for new requests", async () => {
    const nativeNotifications: Array<{ title: string; options?: NotificationOptions }> = [];
    const vibrations: number[][] = [];
    let soundCount = 0;

    class FakeNotification {
      static permission: NotificationPermission = "granted";

      constructor(title: string, options?: NotificationOptions) {
        nativeNotifications.push({ title, options });
      }
    }

    const result = await deliverRequestNotificationAlerts(
      [
        { id: "request-1", title: "Urgent guest request", body: "Table 8 needs support" },
        { id: "request-2", title: "New guest request", body: "Room 204 needs towels" }
      ],
      {
        Notification: FakeNotification,
        navigator: {
          vibrate(pattern: number[]) {
            vibrations.push(pattern);
            return true;
          }
        }
      } as never,
      async () => {
        soundCount += 1;
        return true;
      }
    );

    assert.deepEqual(result, { nativeCount: 2, soundPlayed: true, vibrationRequested: true });
    assert.equal(soundCount, 1);
    assert.deepEqual(
      nativeNotifications.map((notification) => {
        const options = notification.options as (NotificationOptions & { renotify?: boolean }) | undefined;
        return [notification.title, options?.body, options?.tag, options?.renotify];
      }),
      [
        ["Urgent guest request", "Table 8 needs support", "request-1", true],
        ["New guest request", "Room 204 needs towels", "request-2", true]
      ]
    );
    assert.equal(nativeNotifications[0]?.options?.requireInteraction, true);
    assert.deepEqual(vibrations, [[240, 80, 240, 80, 420]]);
  });
});
