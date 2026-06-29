import { useEffect } from "react";

import { APP_BRIDGE_ORIGIN, KEY_SLUG } from "@/utils/const";

const getToolSlug = () => {
  const storedSlug = sessionStorage.getItem(KEY_SLUG);
  if (storedSlug) {
    return storedSlug;
  }

  const slugFromQuery = new URLSearchParams(window.location.search).get("slug");
  if (slugFromQuery) {
    return slugFromQuery;
  }

  return process.env.NEXT_PUBLIC_TOOL_ID || "";
};

export function useAutoHeight() {
  useEffect(() => {
    const notifyHeight = () => {
      window.parent.postMessage(
        {
          action: "tool-changed",
          event: "heightChange",
          height: document.body.scrollHeight,
          tool: getToolSlug(),
        },
        APP_BRIDGE_ORIGIN,
      );
    };

    const observer = new MutationObserver(() => {
      notifyHeight();
    });

    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    notifyHeight();

    return () => {
      observer.disconnect();
    };
  }, []);
}