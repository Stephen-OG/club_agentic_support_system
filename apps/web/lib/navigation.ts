export function safeReplace(router: { replace: (href: string) => void }, href: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.setTimeout(() => {
    router.replace(href);
  }, 0);
}
