export const isMobileDevice = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua);
  const touchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1; // iPadOS
  return uaMobile || touchMac;
};

export const prefersReducedMotion = (): boolean => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const isStandalone = (): boolean => typeof matchMedia !== "undefined" && (matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true);

export const locale = (): string => (typeof navigator !== "undefined" ? navigator.language : "en-CA");

export const hasGeolocation = (): boolean => typeof navigator !== "undefined" && "geolocation" in navigator;

export function getPosition(timeoutMs = 12_000): Promise<GeolocationPosition | null> {
  if (!hasGeolocation()) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
