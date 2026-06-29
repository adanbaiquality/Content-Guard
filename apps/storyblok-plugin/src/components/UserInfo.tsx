import { useEffect, useState } from "react";

const JSON_INDENT_LEVEL = 2;

export default function UserInfo() {
  const [userInfo, setUserInfo] = useState<unknown>(undefined);
  useEffect(() => {
    const fetchUserInfo = async () => {
      const response = await fetch("/api/user_info");
      const json = await response.json();
      setUserInfo(json);
    };
    void fetchUserInfo();
  }, []);

  const jsonString = JSON.stringify(userInfo, undefined, JSON_INDENT_LEVEL);

  return <pre>{jsonString}</pre>;
}
