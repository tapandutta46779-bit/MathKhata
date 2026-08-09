export async function registerOfflineApp(): Promise<void> {
  if (!import.meta.env.PROD || window.mathKhataDesktop || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
  } catch (error) {
    console.warn('MathKhata offline cache could not be registered.', error);
  }
}
