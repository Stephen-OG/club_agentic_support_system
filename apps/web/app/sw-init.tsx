"use client";

import { useServiceWorker } from "@/lib/sw-register";

export function ServiceWorkerInit() {
  useServiceWorker();
  return null;
}
