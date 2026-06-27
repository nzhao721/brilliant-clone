import { Capacitor } from '@capacitor/core';

/*
 * Thin wrapper around Capacitor's platform detection. Centralizing it keeps the
 * "native vs web" branch in one place and makes it trivial to mock in tests. On
 * the web (including the Vitest/jsdom runner) `isNativePlatform()` is false, so
 * every web/test code path is unchanged — the native branches only run inside the
 * Android (or iOS) WebView.
 */

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function getPlatform(): string {
  return Capacitor.getPlatform();
}
