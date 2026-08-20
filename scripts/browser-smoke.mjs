import { chromium } from "playwright";

const checks = [
  {
    name: "Frenchami root",
    route: "/",
    url: process.env.FRENCHAMI_URL ?? "http://127.0.0.1:4173/",
    heading: "Make French feel like yours.",
  },
  {
    name: "Mockup sandbox",
    route: "/__mockup/",
    url: process.env.MOCKUP_SANDBOX_URL ?? "http://127.0.0.1:4174/__mockup/",
    heading: "Component Preview Server",
  },
];

async function waitForServer(check) {
  const deadline = Date.now() + 30_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(check.url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const details =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `FAIL ${check.name} (${check.route}): preview server did not respond within 30 seconds (${details})`,
  );
}

async function checkPage(browser, check) {
  const page = await browser.newPage();
  const pageErrors = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  try {
    const response = await page.goto(check.url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    if (!response || !response.ok()) {
      throw new Error(
        `HTTP ${response?.status() ?? "no response"} from ${check.url}`,
      );
    }

    await page.getByRole("heading", { name: check.heading }).waitFor({
      state: "visible",
      timeout: 15_000,
    });
    await page.waitForTimeout(250);

    if (pageErrors.length > 0) {
      throw new Error(`pageerror: ${pageErrors.join("\n")}`);
    }

    console.log(`PASS ${check.name} (${check.route})`);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`FAIL ${check.name} (${check.route}): ${details}`);
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({ headless: true });

try {
  for (const check of checks) {
    await waitForServer(check);
    await checkPage(browser, check);
  }
} finally {
  await browser.close();
}
