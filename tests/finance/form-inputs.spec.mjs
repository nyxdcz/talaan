import { test, expect } from "../helpers/browser-fixtures.mjs";
import { fileURLToPath } from "node:url";

const formInputsScript = fileURLToPath(new URL("../../form-inputs.js", import.meta.url));

test("V15.2.6 extracted form inputs preserve calculator and validation behavior", async ({ page }) => {
  // Use an isolated DOM fixture so app authentication/PWA navigation cannot destroy
  // the execution context while this focused module test is running.
  await page.setContent("<!doctype html><html><body></body></html>", { waitUntil:"domcontentloaded" });
  await page.evaluate(() => {
    window.money = value => new Intl.NumberFormat("en-PH", {
      style:"currency",
      currency:"PHP",
      minimumFractionDigits:2,
      maximumFractionDigits:2
    }).format(Number(value || 0));
  });
  await page.addScriptTag({ path:formInputsScript });
  await expect.poll(() => page.evaluate(() => typeof window.evaluateArithmeticExpression)).toBe("function");

  const arithmetic = await page.evaluate(() => ({
    add:window.evaluateArithmeticExpression("200 + 100"),
    multiply:window.evaluateArithmeticExpression("12 × 3"),
    parentheses:window.evaluateArithmeticExpression("(10 + 5) * 2"),
    divideByZero:window.evaluateArithmeticExpression("10 / 0"),
    invalidSequence:window.evaluateArithmeticExpression("10 ++ 2")
  }));
  expect(arithmetic.add).toMatchObject({ ok:true, value:300 });
  expect(arithmetic.multiply).toMatchObject({ ok:true, value:36 });
  expect(arithmetic.parentheses).toMatchObject({ ok:true, value:30 });
  expect(arithmetic.divideByZero).toMatchObject({ ok:false, code:"division" });
  expect(arithmetic.invalidSequence).toMatchObject({ ok:false, code:"sequence" });

  const formState = await page.evaluate(() => {
    const host = document.createElement("div");
    host.innerHTML = '<div><input id="phase5Money" data-money-input data-min="0"></div><div><input id="phase5Integer" data-integer-input min="0" max="100"></div>';
    document.body.appendChild(host);
    window.setupNumericInputs(host);
    const moneyInput = document.getElementById("phase5Money");
    const integerInput = document.getElementById("phase5Integer");
    moneyInput.value = "200 + 100";
    moneyInput.dispatchEvent(new Event("input", { bubbles:true }));
    const preview = document.getElementById("phase5Money-preview")?.textContent || "";
    const operatorCount = moneyInput.closest(".calculator-input-shell")?.querySelectorAll(".calculator-operator-row button").length || 0;
    const formatted = window.formatMoneyInput(moneyInput, true);
    const formattedValue = moneyInput.value;

    // Verify the extracted shared error helper still exposes accessible field state.
    window.setFieldError(moneyInput, "Example validation error");
    const accessibleInvalid = moneyInput.getAttribute("aria-invalid");
    const accessibleDescribedBy = moneyInput.getAttribute("aria-describedby");
    const accessibleError = document.getElementById("phase5Money-error")?.textContent || "";
    window.setFieldError(moneyInput, "");

    // Preserve the existing validation behavior exactly; focusing after a rejected
    // value may refresh the live calculator preview, so the rejection result itself
    // is asserted separately from the shared error-helper semantics above.
    moneyInput.value = "-5";
    const negativeAccepted = window.validateMoneyInput(moneyInput, { required:true, min:0 });
    integerInput.value = "10 / 4";
    const integerAccepted = window.validateIntegerInput(integerInput, { required:true, min:0, max:100 });
    const integerError = document.getElementById("phase5Integer-error")?.textContent || "";
    return { preview, operatorCount, formatted, formattedValue, accessibleInvalid, accessibleDescribedBy, accessibleError, negativeAccepted, integerAccepted, integerError };
  });
  expect(formState.preview).toContain("₱300.00");
  expect(formState.operatorCount).toBe(6);
  expect(formState.formatted).toBe(true);
  expect(formState.formattedValue).toBe("300.00");
  expect(formState.accessibleInvalid).toBe("true");
  expect(formState.accessibleDescribedBy).toBe("phase5Money-error");
  expect(formState.accessibleError).toBe("Example validation error");
  expect(formState.negativeAccepted).toBe(false);
  expect(formState.integerAccepted).toBe(false);
  expect(formState.integerError).toContain("whole number");
});
