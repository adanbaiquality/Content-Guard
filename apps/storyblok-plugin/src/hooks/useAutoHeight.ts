import { useEffect } from "react";

import { KEY_SLUG } from "@/utils/const";

const MIN_TOOL_HEIGHT = 320;
const MIN_HEIGHT_DELTA = 8;
const MIN_POST_INTERVAL_MS = 250;

function getToolSlug() {
  if (typeof window === "undefined") {
    return null;
  }

  const storedSlug = sessionStorage.getItem(KEY_SLUG);
  if (storedSlug) {
    return storedSlug;
  }

  return new URLSearchParams(window.location.search).get("slug");
}

function getDocumentHeight() {
  const { body, documentElement } = document;

  return Math.max(
    body.scrollHeight,
    body.offsetHeight,
    documentElement.scrollHeight,
    documentElement.offsetHeight,
    documentElement.clientHeight,
  );
}

export function useAutoHeight() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.top === window.self) {
      return;
    }

    const tool = getToolSlug();
    if (!tool) {
      return;
    }

    let rafId = 0;
    let lastHeight = 0;
    let lastPostedAt = 0;

    const sendHeight = () => {
      const height = Math.max(MIN_TOOL_HEIGHT, Math.ceil(getDocumentHeight()));
      const now = Date.now();

      // Ignore tiny layout jitter to prevent excessive bridge chatter.
      if (Math.abs(height - lastHeight) < MIN_HEIGHT_DELTA) {
        return;
      }

      if (now - lastPostedAt < MIN_POST_INTERVAL_MS) {
        return;
      }

      lastHeight = height;
      lastPostedAt = now;
      window.parent.postMessage(
        {
          action: "tool-changed",
          event: "heightChange",
          height,
          tool,
        },
        "*",
      );
    };

    const scheduleHeightUpdate = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(sendHeight);
    };

    scheduleHeightUpdate();

    const resizeObserver = new ResizeObserver(scheduleHeightUpdate);
    resizeObserver.observe(document.body);
    resizeObserver.observe(document.documentElement);

    window.addEventListener("resize", scheduleHeightUpdate);
    window.addEventListener("load", scheduleHeightUpdate);

    void document.fonts?.ready.then(scheduleHeightUpdate);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleHeightUpdate);
      window.removeEventListener("load", scheduleHeightUpdate);
    };
  }, []);
}
