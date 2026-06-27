import { describe, expect, it } from 'vitest';
import { appCheck, auth, db, firebaseApp, hasFirebaseConfig } from './firebase';

describe('Firebase initialization', () => {
  it('does not initialize real Firebase services in Vitest by default', () => {
    expect(import.meta.env.MODE).toBe('test');
    expect(hasFirebaseConfig).toBe(false);
    expect(firebaseApp).toBeNull();
    expect(auth).toBeNull();
    expect(db).toBeNull();
    expect(appCheck).toBeNull();
  });
});
