import type { CapacitorConfig } from '@capacitor/cli';

/*
 * Capacitor wraps the SAME Vite web build (webDir: 'dist') in a native Android
 * WebView. The app keeps 100% of its web behavior; only the shell is native.
 *
 * App identity:
 *   appId   app.slopewise   (the Android applicationId / Java package — this is
 *                            the package you register in the Firebase console and
 *                            on Google Play; it cannot be changed after publish)
 *   appName SlopeWise        (the label under the launcher icon)
 *
 * Android serves the bundled assets from https://localhost (Capacitor's default
 * androidScheme), so Firebase Auth/Firestore/Functions see a secure origin that
 * matches production. Routing uses a hash history on native (see src/main.tsx) so
 * deep links + in-app reloads always resolve against the local server.
 *
 * LIVE RELOAD (dev): do NOT hardcode `server.url` here (it would also affect
 * release builds). Instead run, with the Vite dev server reachable on your LAN:
 *   npx cap run android -l --external
 * which injects the dev URL for that run only.
 */
const config: CapacitorConfig = {
  appId: 'app.slopewise',
  appName: 'SlopeWise',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#11815a',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    /*
     * Use the Firebase JS SDK as the single source of truth: the native plugin
     * only performs the Google OAuth handshake and hands the credential back to
     * the web layer (src/auth/nativeAuth.ts bridges it via signInWithCredential),
     * which keeps Firestore/Functions auth identical to the web app.
     */
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
