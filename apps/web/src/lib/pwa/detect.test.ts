import { describe, expect, it } from 'vitest';
import { isIosUserAgent, isInAppBrowserUserAgent, urlBase64ToUint8Array } from './detect';

describe('isIosUserAgent', () => {
  it('matches iPhone, iPad and iPod user agents', () => {
    expect(
      isIosUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'),
    ).toBe(true);
    expect(isIosUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIosUserAgent('Mozilla/5.0 (iPod touch; CPU iPhone OS 17_0)')).toBe(true);
  });

  it('does not match Android or desktop user agents', () => {
    expect(
      isIosUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120'),
    ).toBe(false);
    expect(
      isIosUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120'),
    ).toBe(false);
  });
});

describe('isInAppBrowserUserAgent', () => {
  const inAppSamples = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) FBAN/FBIOS;FBAV/450.0',
    'Mozilla/5.0 (Linux; Android 14) FBAV/450.0.0.0.100',
    'Mozilla/5.0 (iPhone) FB_IAB/FB4A',
    'Mozilla/5.0 (iPhone) Messenger',
    'Mozilla/5.0 (Linux; Android 14) Instagram 300.0.0.0',
    'Mozilla/5.0 (iPhone) Line/13.0.0',
    'Mozilla/5.0 (Linux; Android 14) musical_ly_2023 TikTok 30.0.0',
    'Mozilla/5.0 (Linux; Android 14) MicroMessenger/8.0.0',
  ];

  it('matches known in-app browsers, case-insensitively', () => {
    for (const ua of inAppSamples) {
      expect(isInAppBrowserUserAgent(ua)).toBe(true);
      expect(isInAppBrowserUserAgent(ua.toLowerCase())).toBe(true);
      expect(isInAppBrowserUserAgent(ua.toUpperCase())).toBe(true);
    }
  });

  it('does not match regular mobile/desktop browsers', () => {
    expect(
      isInAppBrowserUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1',
      ),
    ).toBe(false);
    expect(
      isInAppBrowserUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile',
      ),
    ).toBe(false);
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodes a known vector without URL-safe substitutions or padding', () => {
    // base64 of "Hello" (standard base64 "SGVsbG8=", no padding needed after trim logic)
    expect(Array.from(urlBase64ToUint8Array('SGVsbG8'))).toEqual([72, 101, 108, 108, 111]);
  });

  it('decodes a known vector requiring "-"/"_" -> "+"/"/" substitution and padding', () => {
    // bytes [251, 239, 190, 253, 122] -> standard base64 "++++/Xo=" -> url-safe "----_Xo"
    expect(Array.from(urlBase64ToUint8Array('----_Xo'))).toEqual([251, 239, 190, 253, 122]);
  });
});
