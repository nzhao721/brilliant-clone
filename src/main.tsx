import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import 'katex/dist/katex.min.css';
import App from './App';
import { isNativePlatform } from './lib/platform';
import { initNativeApp } from './native/nativeApp';
import './styles.css';

/*
 * Web keeps clean BrowserRouter URLs (and Firebase Hosting's SPA rewrite). Inside
 * the Capacitor WebView there is no server rewrite, so a hash history guarantees
 * deep links and in-app reloads always resolve against the local bundle. The app
 * code is router-agnostic (NavLink/useLocation behave identically), so behavior is
 * unchanged — only the URL representation differs on native.
 */
const Router = isNativePlatform() ? HashRouter : BrowserRouter;

// Native-only shell setup (status bar, splash, back button); a no-op on the web.
void initNativeApp();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
);
