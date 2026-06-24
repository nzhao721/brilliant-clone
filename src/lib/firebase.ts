import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const placeholderFirebaseValues = new Set([
  'your-api-key',
  'your-app-id',
  'your-project-id',
  'your-project-id.firebaseapp.com',
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

const isFirebaseDisabledForTests =
  import.meta.env.MODE === 'test' && import.meta.env.VITE_FIREBASE_ENABLE_TEST_SERVICES !== 'true';

export const hasFirebaseConfig =
  Object.values(firebaseConfig).every(isConfiguredFirebaseValue) && !isFirebaseDisabledForTests;

export const firebaseApp = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;

export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;
