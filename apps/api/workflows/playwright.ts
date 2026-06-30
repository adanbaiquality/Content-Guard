import type { LaunchOptions } from "playwright";

export function getChromiumLaunchOptions(): LaunchOptions {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
  const launchOptions: LaunchOptions = {
    headless: true,
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  return launchOptions;
}
