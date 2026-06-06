import { initializeDefaultRequestNotificationSound, playDefaultRequestNotificationSound } from "./default-notification-sound";

export type RequestNotificationAlert = {
  id: string;
  title: string;
  body: string;
};

export type RequestNotificationPermission = NotificationPermission | "unsupported";

type RequestNotificationWindow = Window & {
  Notification?: typeof Notification;
};

type RequestNotificationNavigator = Navigator & {
  vibrate?: (pattern: number[]) => boolean;
};

type AlertWindow = Partial<RequestNotificationWindow> & {
  navigator?: Partial<RequestNotificationNavigator>;
};

type ExtendedNotificationOptions = NotificationOptions & {
  renotify?: boolean;
  vibrate?: number[];
};

const vibrationPattern = [240, 80, 240, 80, 420];

export function initializeRequestNotificationAlerts(targetWindow: AlertWindow | undefined = globalThis.window as AlertWindow | undefined) {
  initializeDefaultRequestNotificationSound(targetWindow as RequestNotificationWindow | undefined);
}

export function isRequestNotificationSupported(targetWindow: AlertWindow | undefined = globalThis.window as AlertWindow | undefined) {
  return Boolean(targetWindow?.Notification);
}

export function getRequestNotificationPermission(targetWindow: AlertWindow | undefined = globalThis.window as AlertWindow | undefined): RequestNotificationPermission {
  if (!targetWindow?.Notification) {
    return "unsupported";
  }

  return targetWindow.Notification.permission;
}

export async function requestRequestNotificationPermission(targetWindow: AlertWindow | undefined = globalThis.window as AlertWindow | undefined) {
  if (!targetWindow?.Notification) {
    return "unsupported" as const;
  }

  return targetWindow.Notification.requestPermission();
}

export async function deliverRequestNotificationAlerts(
  alerts: RequestNotificationAlert[],
  targetWindow: AlertWindow | undefined = globalThis.window as AlertWindow | undefined,
  playSound: (targetWindow?: Window) => Promise<boolean> = playDefaultRequestNotificationSound
) {
  if (alerts.length === 0) {
    return { nativeCount: 0, soundPlayed: false, vibrationRequested: false };
  }

  const soundPlayed = await playSound(targetWindow as Window | undefined);
  const vibrationRequested = Boolean(targetWindow?.navigator?.vibrate?.(vibrationPattern));
  let nativeCount = 0;

  if (targetWindow?.Notification?.permission === "granted") {
    for (const alert of alerts) {
      new targetWindow.Notification(alert.title, {
        body: alert.body,
        requireInteraction: true,
        renotify: true,
        tag: alert.id,
        vibrate: vibrationPattern
      } as ExtendedNotificationOptions);
      nativeCount += 1;
    }
  }

  return { nativeCount, soundPlayed, vibrationRequested };
}
