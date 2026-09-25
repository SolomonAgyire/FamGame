'use client';

import { useEffect, useState } from 'react';

/** Chrome fires this so a site can offer its own install button. It is not
 * in the DOM lib types because it is not yet standardised. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const DISMISS_KEY = 'wordin-install-dismissed';

function isStandalone(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    // iOS predates the display-mode media query for home-screen apps.
    return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

function isIos(): boolean {
  try {
    const ua = window.navigator.userAgent;
    // iPadOS 13+ reports itself as a Mac, so touch support is the tell.
    return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  } catch {
    return false;
  }
}

/** Offers installation, which is the only thing that reliably protects saved
 * progress: browsers evict storage for sites left unopened, and on iOS a
 * home-screen app is exempt from that. Android gets a real button from
 * `beforeinstallprompt`; iOS Safari has no install API, so it gets the
 * three-step instruction instead. */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Register the worker that makes the game open without a signal. It is
    // optional -- a failure here must never stop the game loading.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    if (isStandalone()) return;
    let alreadyDismissed = false;
    try { alreadyDismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch { /* storage blocked */ }
    if (alreadyDismissed) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    // Deferred to a task so the first client render still matches the server's,
    // which is also why this cannot be a lazy useState initialiser: none of the
    // checks above exist during SSR.
    const timer = window.setTimeout(() => {
      setDismissed(false);
      if (isIos()) setShowIosHelp(true);
    }, 0);
    return () => { window.clearTimeout(timer); window.removeEventListener('beforeinstallprompt', onPrompt); };
  }, []);

  const close = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* storage blocked */ }
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch { /* the browser withdrew the prompt */ }
    setDeferred(null);
    close();
  };

  if (dismissed || (!deferred && !showIosHelp)) return null;

  return <aside className="install-banner" role="complementary">
    <button type="button" className="install-close" onClick={close} aria-label="Not now">×</button>
    <strong>Keep WordIn on your phone</strong>
    {deferred
      ? <>
          <p>Installing keeps your streak and level progress safe, and lets you play with no signal.</p>
          <button type="button" className="primary-button full-button" onClick={install}>Install WordIn</button>
        </>
      : <>
          <p>Add WordIn to your Home Screen so your streak and level progress are not cleared, and it works offline.</p>
          <ol className="install-steps">
            <li>Tap <strong>Share</strong> in the Safari toolbar</li>
            <li>Choose <strong>Add to Home Screen</strong></li>
            <li>Tap <strong>Add</strong></li>
          </ol>
        </>}
  </aside>;
}
