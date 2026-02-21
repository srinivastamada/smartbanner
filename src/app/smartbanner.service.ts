import { Injectable } from '@angular/core';

declare const smartbanner: { publish: () => void } | undefined;

function publishSmartbanner(): void {
  const sb = (window as unknown as Record<string, unknown>)['smartbanner'] as
    | { publish: () => void }
    | undefined;
  if (sb) sb.publish();
}

/** How long (ms) to wait for the OS to switch to the app before deciding it's not installed. */
const DETECTION_TIMEOUT_MS = 1500;

/**
 * Reads deep link schemes from meta tags in index.html:
 *   <meta name="smartbanner:deeplink-ios"     content="com.amazon.mobile.shopping://">
 *   <meta name="smartbanner:deeplink-android" content="amazon://">
 */
function getDeepLink(): string {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) {
    return getMeta('smartbanner:deeplink-android') ?? 'amazon://';
  }
  if (/ipad|iphone|ipod/i.test(ua)) {
    return getMeta('smartbanner:deeplink-ios') ?? 'com.amazon.mobile.shopping://';
  }
  return getMeta('smartbanner:deeplink-android') ?? 'amazon://';
}

function getMeta(name: string): string | null {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? null;
}

@Injectable({ providedIn: 'root' })
export class SmartbannerService {
  init(): void {
    const labelInstalled = getMeta('smartbanner:button:installed')?.toUpperCase() ?? 'OPEN';
    const labelDefault = getMeta('smartbanner:button') ?? 'VIEW';

    // Publish the banner immediately with the default label so it always shows.
    this.publishBanner(labelDefault);

    // On mobile, attempt detection in the background and swap label if app is found.
    const isMobile = /android|ipad|iphone|ipod/i.test(navigator.userAgent);
    if (isMobile) {
      this.detectAppInstalled().then((installed) => {
        if (installed) {
          this.setButtonMeta(labelInstalled);
          // Also update the already-rendered banner button text in the DOM.
          const btn = document.querySelector<HTMLElement>('.smartbanner__button');
          if (btn) btn.textContent = labelInstalled;
        }
      });
    }
  }

  private publishBanner(label: string): void {
    this.setButtonMeta(label);
    if (typeof smartbanner !== 'undefined') {
      publishSmartbanner();
    } else {
      // Script not yet ready — wait for load and retry once.
      window.addEventListener('load', () => publishSmartbanner(), { once: true });
    }
  }

  private detectAppInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      const deepLink = getDeepLink();
      if (!deepLink) {
        resolve(false);
        return;
      }

      // Wait a tick so the banner renders visibly before we attempt navigation.
      setTimeout(() => {
        let resolved = false;
        const start = Date.now();

        const finish = (installed: boolean) => {
          if (resolved) return;
          resolved = true;
          document.removeEventListener('visibilitychange', onVisibilityChange);
          clearTimeout(fallbackTimer);
          resolve(installed);
        };

        const onVisibilityChange = () => {
          if (document.visibilityState === 'hidden') {
            // Page went to background → app opened → installed.
            // Wait for the user to return (visible) then confirm.
            const onReturn = () => {
              if (document.visibilityState === 'visible') {
                document.removeEventListener('visibilitychange', onReturn);
                finish(true);
              }
            };
            document.addEventListener('visibilitychange', onReturn);
            // Safety: if user never returns within 30s, still resolve.
            setTimeout(() => finish(true), 30_000);
          }
        };

        document.addEventListener('visibilitychange', onVisibilityChange);

        // Navigate via window.location.href — the only reliable way to trigger
        // custom URL schemes on both Android Chrome and iOS Safari.
        window.location.href = deepLink;

        // Fallback timer: if JS runs on schedule (not suspended), the app didn't open.
        // If the app DID open, JS is throttled and the elapsed time will be >> timeout.
        const fallbackTimer = setTimeout(() => {
          const elapsed = Date.now() - start;
          // If elapsed is considerably larger than our timeout, JS was suspended → installed.
          finish(elapsed > DETECTION_TIMEOUT_MS * 1.5);
        }, DETECTION_TIMEOUT_MS);
      }, 300);
    });
  }

  private setButtonMeta(label: string): void {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="smartbanner:button"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'smartbanner:button';
      document.head.appendChild(meta);
    }
    meta.content = label;
  }
}
