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
    const labelDefault = getMeta('smartbanner:button') ?? 'VIEW';

    // Publish the banner with the default label so it always shows.
    this.publishBanner(labelDefault);

    // On mobile, attach a click handler so the deep-link action only fires
    // when the user taps the banner button — never on page load.
    const isMobile = /android|ipad|iphone|ipod/i.test(navigator.userAgent);
    if (isMobile) {
      this.attachButtonHandler();
    }
  }

  private attachButtonHandler(): void {
    const tryAttach = () => {
      const btn = document.querySelector<HTMLElement>('.smartbanner__button');
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.handleBannerAction();
        });
      } else {
        // Button not yet in DOM — retry shortly after publish renders it.
        setTimeout(tryAttach, 100);
      }
    };
    tryAttach();
  }

  private handleBannerAction(): void {
    const storeUrl = this.getStoreUrl();
    const ua = navigator.userAgent;
    const isIOS = /ipad|iphone|ipod/i.test(ua);

    // On iOS, attempting a custom URL scheme when the app is not installed causes
    // Safari to show "Safari cannot open the page because the address is invalid".
    // To avoid that dialog, go directly to the App Store — which shows an "Open"
    // button if the app is already installed, allowing it to be launched from there.
    if (isIOS) {
      if (storeUrl) window.location.href = storeUrl;
      return;
    }

    // Android: try the deep link first; fall back to the Play Store on timeout.
    const deepLink = getDeepLink();
    if (!deepLink) {
      if (storeUrl) window.location.href = storeUrl;
      return;
    }

    let resolved = false;
    const start = Date.now();

    const finish = (installed: boolean) => {
      if (resolved) return;
      resolved = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearTimeout(fallbackTimer);
      if (!installed && storeUrl) {
        window.location.href = storeUrl;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const onReturn = () => {
          if (document.visibilityState === 'visible') {
            document.removeEventListener('visibilitychange', onReturn);
            finish(true);
          }
        };
        document.addEventListener('visibilitychange', onReturn);
        setTimeout(() => finish(true), 30_000);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.location.href = deepLink;

    const fallbackTimer = setTimeout(() => {
      const elapsed = Date.now() - start;
      finish(elapsed > DETECTION_TIMEOUT_MS * 1.5);
    }, DETECTION_TIMEOUT_MS);
  }

  private getStoreUrl(): string | null {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) {
      return (
        getMeta('smartbanner:button-url-google') ??
        getMeta('smartbanner:google-play-url') ??
        getMeta('smartbanner:url') ??
        null
      );
    }
    if (/ipad|iphone|ipod/i.test(ua)) {
      return (
        getMeta('smartbanner:button-url-apple') ??
        getMeta('smartbanner:apple-app-store-url') ??
        getMeta('smartbanner:url') ??
        null
      );
    }
    return getMeta('smartbanner:url') ?? null;
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
