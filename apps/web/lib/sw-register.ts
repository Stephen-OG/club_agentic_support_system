"use client";

import { useEffect } from "react";

const swUrl = "/sw.js";

export function useServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let cancelled = false;

    async function register() {
      try {
        const registration = await navigator.serviceWorker.register(swUrl, {
          scope: "/"
        });

        if (registration.active && !cancelled) {
          registration.active.postMessage({ type: "SKIP_WAITING" });
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (installing) {
            installing.addEventListener("statechange", () => {
              if (installing.state === "activated" && !cancelled) {
                installing.postMessage({ type: "SKIP_WAITING" });
              }
            });
          }
        });
      } catch {
        // SW registration failed — app works without it
      }
    }

    register();

    return () => {
      cancelled = true;
    };
  }, []);
}

export function postServiceWorkerMessage(message: unknown) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.controller?.postMessage(message);
}

export function processOfflineQueue() {
  postServiceWorkerMessage({ type: "PROCESS_QUEUE" });
}
