export const getApiBaseUrl = () => {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!configuredBaseUrl) {
    return "";
  }

  // If this code runs in a remote iframe (Storyblok + tunnel), localhost is unreachable.
  if (typeof window !== "undefined") {
    const isLocalApiTarget = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(
      configuredBaseUrl,
    );
    const currentHost = window.location.hostname;
    const isLocalHost = currentHost === "localhost" || currentHost === "127.0.0.1";

    if (isLocalApiTarget && !isLocalHost) {
      return "";
    }
  }

  return configuredBaseUrl.replace(/\/$/, "");
};
