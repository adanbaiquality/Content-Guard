import { useEffect, useState } from "react";

// eslint-disable-next-line sort-imports
import { getApiBaseUrl } from "@/utils/api";
// eslint-disable-next-line sort-imports
import { APP_BRIDGE_TOKEN_HEADER_KEY, KEY_TOKEN } from "@/utils/const";

export default function Example() {
  const [testInfo, setTestInfo] = useState<{ verified: boolean }>({
    verified: false,
  });
  useEffect(() => {
    const fetchTestInfo = async () => {
      const response = await fetch(`${getApiBaseUrl()}/api/example`, {
        credentials: "include",
        headers: {
          [APP_BRIDGE_TOKEN_HEADER_KEY]: sessionStorage.getItem(KEY_TOKEN) || "",
        },
      });
      const json = await response.json();
      setTestInfo(json);
    };
    void fetchTestInfo();
  }, []);

  let status = "not verified";
  if (testInfo?.verified) {
    status = "verified";
  }
  return <pre>App Bridge session is {status}</pre>;
}
