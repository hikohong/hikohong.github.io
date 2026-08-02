// ==UserScript==
// @name         YouTube Ad Skip Auto-Clicker
// @namespace    https://github.com/hikohong/ytautoclicker
// @version      1.0.0
// @description  Automatically clicks YouTube's "Skip Ad" button the moment it appears, then returns you to the normal clip. Also fast-forwards un-skippable ads and closes overlay banners.
// @author       hikohong
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://www.youtube-nocookie.com/*
// @run-at       document-start
// @grant        none
// @noframes     false
// ==/UserScript==

(function () {
  'use strict';

  // Selectors for the various "Skip" buttons YouTube has shipped over the years.
  // Kept broad on purpose — YouTube renames these frequently.
  const SKIP_SELECTORS = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-container button',
    'button[class*="ytp-ad-skip-button"]',
    '.ytp-ad-survey-answer-selector button',
  ];

  // "Close overlay banner ad" buttons (the small ads over the bottom of the video).
  const OVERLAY_CLOSE_SELECTORS = [
    '.ytp-ad-overlay-close-button',
    '.ytp-ad-overlay-close-container',
    '.ytp-ad-text-overlay .ytp-ad-overlay-close-button',
  ];

  // Elements that indicate an ad is currently playing.
  const AD_SHOWING_SELECTORS = ['.ad-showing', '.ad-interrupting'];

  const isVisible = (el) =>
    el &&
    el.offsetParent !== null &&
    !el.disabled &&
    getComputedStyle(el).visibility !== 'hidden' &&
    getComputedStyle(el).display !== 'none';

  function clickFirstVisible(selectors) {
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (isVisible(el)) {
          el.click();
          return true;
        }
      }
    }
    return false;
  }

  function adIsShowing() {
    const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    if (player) {
      return AD_SHOWING_SELECTORS.some((c) => player.classList.contains(c.replace('.', '')));
    }
    return !!document.querySelector(AD_SHOWING_SELECTORS.join(','));
  }

  // Fast-forward an un-skippable ad by seeking the ad video to its end.
  // Only touches the video while an ad is actually showing, so it never
  // affects the real clip.
  function fastForwardAd() {
    if (!adIsShowing()) return;
    const video = document.querySelector('.html5-main-video, video');
    if (video && video.duration && isFinite(video.duration)) {
      // Jump to the end — YouTube then advances to the content automatically.
      if (video.currentTime < video.duration - 0.5) {
        video.currentTime = video.duration;
      }
      // Mute the ad while we blow past it, in case seeking is throttled.
      video.muted = true;
    }
  }

  function tick() {
    // 1. The main goal: click "Skip Ad" as soon as it's clickable.
    const skipped = clickFirstVisible(SKIP_SELECTORS);

    // 2. Close any overlay banner ads.
    clickFirstVisible(OVERLAY_CLOSE_SELECTORS);

    // 3. If it's an ad but the skip button isn't available yet, fast-forward it.
    if (!skipped) {
      fastForwardAd();
    }
  }

  // Run on every DOM mutation (fast reaction) plus a steady interval (safety net).
  const observer = new MutationObserver(tick);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const interval = setInterval(tick, 300);

  // Clean up if the page is torn down (SPA navigations keep the script alive,
  // so this mainly matters on full unload).
  window.addEventListener('unload', () => {
    observer.disconnect();
    clearInterval(interval);
  });

  // First pass immediately.
  tick();
})();
