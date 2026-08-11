export async function registerOfflineApp(): Promise<void> {
  if (!import.meta.env.PROD || window.mathKhataDesktop || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
  } catch (error) {
    console.warn('MathKhata offline cache could not be registered.', error);
  }
}

export async function checkOfflineAppReady(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('caches' in window)) return false;
  try {
    await navigator.serviceWorker.ready;
    const readyUrl = new URL(`${import.meta.env.BASE_URL}offline-ready.json`, window.location.href);
    return Boolean(await window.caches.match(readyUrl));
  } catch {
    return false;
  }
}
