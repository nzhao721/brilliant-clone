import { isNativePlatform } from '../lib/platform';

/*
 * One-time native shell bootstrap, called once from main.tsx. Everything here is
 * a no-op on the web (guarded by `isNativePlatform()`), and every native call is
 * wrapped so a missing/old plugin can never stop the web app from rendering.
 *
 * Responsibilities:
 *  - tag <html> with `capacitor-native` so native-only CSS can opt in;
 *  - style the status bar to match the light app chrome;
 *  - wire the Android hardware BACK button to history-back (and exit at the root);
 *  - hide the splash screen once the web app has booted.
 */
export async function initNativeApp(): Promise<void> {
  if (!isNativePlatform()) {
    return;
  }

  // Set synchronously (before the first React paint) so native CSS applies at once.
  document.documentElement.classList.add('capacitor-native');

  try {
    const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
      import('@capacitor/app'),
      import('@capacitor/status-bar'),
      import('@capacitor/splash-screen'),
    ]);

    try {
      // Style.Light renders DARK status-bar icons, which suit the light app bar.
      await StatusBar.setStyle({ style: Style.Light });
      // Android-only; ignored on platforms that manage the bar themselves.
      await StatusBar.setBackgroundColor({ color: '#f5f2ea' });
    } catch {
      // StatusBar not available on this device — non-fatal.
    }

    // Android back button: step back through history, or exit when at the root.
    await App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        void App.exitApp();
      }
    });

    try {
      await SplashScreen.hide();
    } catch {
      // Splash screen already hidden / plugin unavailable — non-fatal.
    }
  } catch {
    // Any native bootstrap failure must never block the web app.
  }
}
