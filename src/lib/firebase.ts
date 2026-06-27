import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

declare global {
  // App Check honors this global as a debug token in non-production builds only.
  // `var` (not `let`/`const`) is required so it augments `globalThis`/`self`.
  // See https://firebase.google.com/docs/app-check/web/debug-provider
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean | undefined;
}

const placeholderFirebaseValues = new Set([
  'your-api-key',
  'your-app-id',
  'your-project-id',
  'your-project-id.firebaseapp.com',
  'your-recaptcha-enterprise-site-key',
]);

function readFirebaseEnvValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isConfiguredFirebaseValue(value: string) {
  return Boolean(value) && !placeholderFirebaseValues.has(value);
}

const firebaseConfig = {
  apiKey: readFirebaseEnvValue(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: readFirebaseEnvValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: readFirebaseEnvValue(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  appId: readFirebaseEnvValue(import.meta.env.VITE_FIREBASE_APP_ID),
} satisfies FirebaseOptions;

const appCheckSiteKey = readFirebaseEnvValue(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY);
const appCheckDebugToken = readFirebaseEnvValue(import.meta.env.VITE_APPCHECK_DEBUG_TOKEN);

const isFirebaseDisabledForTests =
  import.meta.env.MODE === 'test' && import.meta.env.VITE_FIREBASE_ENABLE_TEST_SERVICES !== 'true';

export const hasFirebaseConfig =
  Object.values(firebaseConfig).every(isConfiguredFirebaseValue) && !isFirebaseDisabledForTests;

export const firebaseApp = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;

// App Check guards Firebase backend quota (including AI Logic). It is opt-in:
// `firebaseApp` is only non-null when Firebase is configured and not test-disabled,
// and the site key must be present and non-placeholder. When the key is absent we
// skip init so local dev and the test runner keep working without App Check.
function createAppCheck(app: FirebaseApp): AppCheck | null {
  if (!isConfiguredFirebaseValue(appCheckSiteKey)) {
    return null;
  }

  // In dev only, a debug token lets unregistered localhost browsers obtain App
  // Check tokens. Must be set on the global before `initializeAppCheck` runs.
  if (import.meta.env.DEV && appCheckDebugToken) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
  }

  try {
    return initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    return null;
  }
}

export const appCheck = firebaseApp ? createAppCheck(firebaseApp) : null;

export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;
