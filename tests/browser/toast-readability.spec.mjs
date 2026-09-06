import { test, expect } from "@playwright/test";

const APP_URL = "http://127.0.0.1:3000/index.html?page=settings&settings=sync";

test.use({ serviceWorkers:"block" });

test("status toast text remains readable in both themes and all semantic variants", async ({ page }) => {
  await page.goto(APP_URL, { waitUntil:"networkidle" });
  await expect.poll(() => page.evaluate(() => typeof window.showToast)).toBe("function");

  const toast = page.locator("#toast");
  for (const viewport of [{ width:1440, height:900 }, { width:390, height:844 }]) {
    await page.setViewportSize(viewport);
    for (const theme of ["light", "dark"]) {
      for (const variant of ["success", "info", "warning", "error"]) {
        await page.evaluate(({ theme: nextTheme, variant: nextVariant }) => {
          document.documentElement.dataset.theme = nextTheme;
          window.showToast("Readable notification", nextVariant);
        }, { theme, variant });

        await expect(toast).toHaveClass(/show/);
        const metrics = await toast.evaluate(node => {
          const message = node.querySelector(".toast-message");
          const icon = node.querySelector(".toast-icon");
          const toastStyle = getComputedStyle(node);
          const messageStyle = getComputedStyle(message);
          const iconStyle = getComputedStyle(icon);
          const messageRect = message.getBoundingClientRect();
          return {
            toastColor:toastStyle.color,
            toastBackground:toastStyle.backgroundColor,
            toastShadow:toastStyle.boxShadow,
            messageColor:messageStyle.color,
            messageBackground:messageStyle.backgroundColor,
            messageShadow:messageStyle.boxShadow,
            iconColor:iconStyle.color,
            iconBackground:iconStyle.backgroundColor,
            messageWidth:messageRect.width,
            text:message.textContent
          };
        });

        expect(metrics.text).toBe("Readable notification");
        expect(metrics.messageWidth).toBeGreaterThan(0);
        expect(metrics.toastColor).not.toBe(metrics.toastBackground);
        expect(metrics.messageColor).toBe(metrics.toastColor);
        expect(metrics.iconColor).not.toBe(metrics.iconBackground);
        expect(metrics.messageBackground).toBe("rgba(0, 0, 0, 0)");
        expect(metrics.toastShadow).toBe("none");
        expect(metrics.messageShadow).toBe("none");
        await page.evaluate(() => window.hideToast?.());
      }
    }
  }
});
