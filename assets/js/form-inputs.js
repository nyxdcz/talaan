"use strict";
/* V15.2.6 · Extracted numeric and calculator form-input subsystem. */
(function exposeFinanceFormInputs(root) {
  const CALCULATOR_MAX_LENGTH = 120;
  const CALCULATOR_MAX_RESULT = 999999999999999.99;
  
  function calculatorError(code) {
    const messages = {
      empty: "",
      scientific: "Scientific notation is not accepted. Enter the full amount.",
      unsupported: "Use numbers and the operators +, −, ×, ÷, and parentheses only.",
      sequence: "Check the operator sequence and complete the calculation.",
      number: "Enter a valid number in the calculation.",
      incomplete: "Complete the calculation before saving.",
      "missing-closing": "Add the missing closing parenthesis.",
      "unexpected-closing": "Remove the extra closing parenthesis.",
      operator: "Add an operator between the values.",
      division: "Cannot divide by zero.",
      range: "The calculated amount is too large.",
      finite: "The calculation did not produce a valid amount.",
      length: "The calculation is too long. Use 120 characters or fewer."
    };
    return messages[code] || "Enter a valid amount or calculation, such as 200 + 100.";
  }
  
  function normalizeCalculatorExpression(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return { ok:false, code:"empty", error:"", source:"" };
    if (raw.length > CALCULATOR_MAX_LENGTH) return { ok:false, code:"length", error:calculatorError("length"), source:raw };
    if (/[A-DF-Za-df-z]/.test(raw)) return { ok:false, code:"unsupported", error:calculatorError("unsupported"), source:raw };
    if (/[eE]/.test(raw)) return { ok:false, code:"scientific", error:calculatorError("scientific"), source:raw };
    const source = raw
      .replace(/[₱,\s]/g, "")
      .replace(/[×]/g, "*")
      .replace(/[÷]/g, "/")
      .replace(/[−–—]/g, "-");
    if (!source) return { ok:false, code:"empty", error:"", source:"" };
    if (/[^0-9+\-*/().]/.test(source)) return { ok:false, code:"unsupported", error:calculatorError("unsupported"), source };
    if (/[+\-*/]{2,}/.test(source)) return { ok:false, code:"sequence", error:calculatorError("sequence"), source };
    return { ok:true, source };
  }
  
  function tokenizeCalculatorExpression(source) {
    const tokens = [];
    let index = 0;
    while (index < source.length) {
      const character = source[index];
      if (/\d|\./.test(character)) {
        let end = index + 1;
        while (end < source.length && /\d|\./.test(source[end])) end += 1;
        const rawNumber = source.slice(index, end);
        if (rawNumber === "." || (rawNumber.match(/\./g) || []).length > 1) return { ok:false, code:"number" };
        const value = Number(rawNumber);
        if (!Number.isFinite(value)) return { ok:false, code:"number" };
        tokens.push({ type:"number", value });
        index = end;
        continue;
      }
      if ("+-*/()".includes(character)) {
        tokens.push({ type:character, value:character });
        index += 1;
        continue;
      }
      return { ok:false, code:"unsupported" };
    }
    return { ok:true, tokens };
  }
  
  function evaluateArithmeticExpression(value) {
    const normalized = normalizeCalculatorExpression(value);
    if (!normalized.ok) return normalized;
    const tokenized = tokenizeCalculatorExpression(normalized.source);
    if (!tokenized.ok) return { ok:false, code:tokenized.code, error:calculatorError(tokenized.code), source:normalized.source };
    const tokens = tokenized.tokens;
    let position = 0;
  
    const checked = result => {
      if (!Number.isFinite(result)) throw { code:"finite" };
      if (Math.abs(result) > CALCULATOR_MAX_RESULT) throw { code:"range" };
      return result;
    };
  
    const parsePrimary = () => {
      const token = tokens[position];
      if (!token) throw { code:"incomplete" };
      if (token.type === "number") { position += 1; return token.value; }
      if (token.type === "(") {
        position += 1;
        const result = parseExpression();
        if (!tokens[position]) throw { code:"missing-closing" };
        if (tokens[position].type !== ")") throw { code:"missing-closing" };
        position += 1;
        return result;
      }
      if (token.type === ")") throw { code:"unexpected-closing" };
      throw { code:"incomplete" };
    };
  
    const parseUnary = () => {
      const token = tokens[position];
      if (token?.type === "+" || token?.type === "-") {
        position += 1;
        const value = parseUnary();
        return token.type === "-" ? checked(-value) : value;
      }
      return parsePrimary();
    };
  
    const parseTerm = () => {
      let result = parseUnary();
      while (tokens[position]?.type === "*" || tokens[position]?.type === "/") {
        const operator = tokens[position++].type;
        const right = parseUnary();
        if (operator === "/" && Math.abs(right) < 1e-15) throw { code:"division" };
        result = checked(operator === "*" ? result * right : result / right);
      }
      return result;
    };
  
    const parseExpression = () => {
      let result = parseTerm();
      while (tokens[position]?.type === "+" || tokens[position]?.type === "-") {
        const operator = tokens[position++].type;
        const right = parseTerm();
        result = checked(operator === "+" ? result + right : result - right);
      }
      return result;
    };
  
    try {
      const result = parseExpression();
      if (position < tokens.length) {
        const token = tokens[position];
        const code = token.type === ")" ? "unexpected-closing" : "operator";
        return { ok:false, code, error:calculatorError(code), source:normalized.source };
      }
      return { ok:true, value:checked(result), source:normalized.source };
    } catch (error) {
      const code = error?.code || "finite";
      return { ok:false, code, error:calculatorError(code), source:normalized.source };
    }
  }
  
  function roundCurrency(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }
  
  function parseMoneyValue(value) {
    if (!String(value ?? "").trim()) return 0;
    const result = evaluateArithmeticExpression(value);
    return result.ok ? roundCurrency(result.value) : NaN;
  }
  
  function moneyInputText(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return number.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  
  function calculatorPreviewElement(input) {
    const shell = input?.closest(".calculator-input-shell");
    if (!shell) return null;
    let preview = shell.querySelector(".calculation-preview");
    if (!preview) {
      preview = document.createElement("small");
      preview.className = "calculation-preview";
      preview.id = `${input.id || "number-field"}-preview`;
      preview.setAttribute("aria-live", "polite");
      shell.appendChild(preview);
    }
    return preview;
  }
  
  function setCalculatorPreview(input, message = "", state = "") {
    const preview = calculatorPreviewElement(input);
    if (!preview) return;
    if (preview.textContent !== message) preview.textContent = message;
    const className = `calculation-preview${message ? " show" : ""}${state ? ` ${state}` : ""}`;
    if (preview.className !== className) preview.className = className;
  }
  
  function setFieldError(input, message = "") {
    if (!input) return false;
    const id = `${input.id || "number-field"}-error`;
    let error = document.getElementById(id);
    const anchor = input.closest(".calculator-input-shell") || input;
    if (message) {
      if (!error) {
        error = document.createElement("small");
        error.id = id;
        error.className = "field-error";
        if (anchor.classList?.contains("calculator-input-shell")) anchor.appendChild(error);
        else anchor.insertAdjacentElement("afterend", error);
      }
      error.textContent = message;
      input.classList.add("input-error");
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", id);
      return false;
    }
    error?.remove();
    input.classList.remove("input-error");
    input.removeAttribute("aria-invalid");
    if (input.getAttribute("aria-describedby") === id) input.removeAttribute("aria-describedby");
    return true;
  }
  
  function expressionUsesOperators(value) {
    const normalized = String(value || "").replace(/[₱,\s]/g, "").replace(/[−–—]/g, "-");
    return /[+*/×÷()]|.-/.test(normalized);
  }
  
  function updateMoneyCalculatorPreview(input, showErrors = false) {
    const raw = String(input?.value || "").trim();
    if (!raw) {
      setCalculatorPreview(input, document.activeElement === input ? "Enter an amount or calculation, such as 200 + 100." : "", "hint");
      setFieldError(input, "");
      return;
    }
    const result = evaluateArithmeticExpression(raw);
    if (result.ok) {
      setFieldError(input, "");
      setCalculatorPreview(input, expressionUsesOperators(raw) ? `Result: ${root.money(roundCurrency(result.value))}` : "", "result");
      return;
    }
    if (!showErrors && ["incomplete", "missing-closing"].includes(result.code)) {
      setFieldError(input, "");
      setCalculatorPreview(input, "Continue entering the calculation.", "pending");
      return;
    }
    setCalculatorPreview(input, "", "");
    setFieldError(input, result.error || calculatorError(result.code));
  }
  
  function updateIntegerCalculatorPreview(input, showErrors = false) {
    const raw = String(input?.value || "").trim();
    if (!raw) {
      setCalculatorPreview(input, document.activeElement === input ? "Enter a whole number or calculation, such as 10 + 5." : "", "hint");
      setFieldError(input, "");
      return;
    }
    const result = evaluateArithmeticExpression(raw);
    if (result.ok && Number.isInteger(result.value)) {
      setFieldError(input, "");
      setCalculatorPreview(input, expressionUsesOperators(raw) ? `Result: ${Math.round(result.value)}` : "", "result");
      return;
    }
    if (result.ok) {
      setCalculatorPreview(input, "", "");
      if (showErrors) setFieldError(input, "The result must be a whole number.");
      return;
    }
    if (!showErrors && ["incomplete", "missing-closing"].includes(result.code)) {
      setFieldError(input, "");
      setCalculatorPreview(input, "Continue entering the calculation.", "pending");
      return;
    }
    setCalculatorPreview(input, "", "");
    setFieldError(input, result.error || calculatorError(result.code));
  }
  
  function formatMoneyInput(input, showErrors = true) {
    if (!input || !String(input.value || "").trim()) { setCalculatorPreview(input, "", ""); return true; }
    const result = evaluateArithmeticExpression(input.value);
    if (!result.ok) {
      if (showErrors) setFieldError(input, result.error || calculatorError(result.code));
      return false;
    }
    input.value = moneyInputText(roundCurrency(result.value));
    setFieldError(input, "");
    setCalculatorPreview(input, "", "");
    return true;
  }
  
  function formatIntegerInput(input, showErrors = true) {
    if (!input || !String(input.value || "").trim()) { setCalculatorPreview(input, "", ""); return true; }
    const result = evaluateArithmeticExpression(input.value);
    if (!result.ok || !Number.isInteger(result.value)) {
      if (showErrors) setFieldError(input, result.ok ? "The result must be a whole number." : (result.error || calculatorError(result.code)));
      return false;
    }
    input.value = String(Math.round(result.value));
    setFieldError(input, "");
    setCalculatorPreview(input, "", "");
    return true;
  }
  
  function setMoneyInputValue(idOrInput, value, blank = false) {
    const input = typeof idOrInput === "string" ? document.getElementById(idOrInput) : idOrInput;
    if (!input) return;
    input.value = blank || value === "" || value === null || value === undefined ? "" : moneyInputText(value);
    setFieldError(input, "");
    setCalculatorPreview(input, "", "");
  }
  
  function moneyInputValue(idOrInput) {
    const input = typeof idOrInput === "string" ? document.getElementById(idOrInput) : idOrInput;
    return input ? parseMoneyValue(input.value) : NaN;
  }
  
  function integerInputValue(idOrInput) {
    const input = typeof idOrInput === "string" ? document.getElementById(idOrInput) : idOrInput;
    if (!input) return NaN;
    const result = evaluateArithmeticExpression(input.value);
    return result.ok && Number.isInteger(result.value) ? Math.round(result.value) : NaN;
  }
  
  function validateMoneyInput(idOrInput, options = {}) {
    const input = typeof idOrInput === "string" ? document.getElementById(idOrInput) : idOrInput;
    if (!input || input.closest("[hidden]")) return true;
    const raw = String(input.value || "").trim();
    const required = Boolean(options.required);
    const min = options.min ?? Number(input.dataset.min ?? 0);
    if (!raw) {
      if (!required) { setCalculatorPreview(input, "", ""); return setFieldError(input, ""); }
      setFieldError(input, options.message || "Enter an amount."); input.focus(); return false;
    }
    const result = evaluateArithmeticExpression(raw);
    if (!result.ok) {
      setFieldError(input, result.error || calculatorError(result.code)); input.focus(); return false;
    }
    const value = roundCurrency(result.value);
    if (value < min) {
      const message = value < 0 && min >= 0 ? "This field cannot contain a negative amount." : (options.message || `Enter an amount${min > 0 ? " greater than zero" : " of zero or more"}.`);
      setFieldError(input, message); input.focus(); return false;
    }
    input.value = moneyInputText(value);
    setCalculatorPreview(input, "", "");
    return setFieldError(input, "");
  }
  
  function validateIntegerInput(idOrInput, options = {}) {
    const input = typeof idOrInput === "string" ? document.getElementById(idOrInput) : idOrInput;
    if (!input || input.closest("[hidden]")) return true;
    const raw = String(input.value || "").trim();
    if (!raw && !options.required) { setCalculatorPreview(input, "", ""); return setFieldError(input, ""); }
    const result = evaluateArithmeticExpression(raw);
    const min = Number(input.min || options.min || 0), max = Number(input.max || options.max || Number.MAX_SAFE_INTEGER);
    if (!result.ok) {
      setFieldError(input, result.error || calculatorError(result.code)); input.focus(); return false;
    }
    if (!Number.isInteger(result.value)) {
      setFieldError(input, "The result must be a whole number."); input.focus(); return false;
    }
    const value = Math.round(result.value);
    if (value < min || value > max) {
      setFieldError(input, options.message || `Enter a whole number from ${min} to ${max}.`); input.focus(); return false;
    }
    input.value = String(value);
    setCalculatorPreview(input, "", "");
    return setFieldError(input, "");
  }
  
  function insertCalculatorOperator(input, operator) {
    if (!input) return;
    let start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
    let end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : input.value.length;
    if (start === 0 && end === input.value.length && input.value.trim() && ["+", "−", "×", "÷", ")"].includes(operator)) start = end = input.value.length;
    input.value = `${input.value.slice(0, start)}${operator}${input.value.slice(end)}`;
    const caret = start + operator.length;
    input.focus();
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event("input", { bubbles:true }));
  }
  
  function ensureCalculatorShell(input, kind = "money") {
    let shell = input.closest(".calculator-input-shell");
    if (!shell) {
      shell = document.createElement("div");
      shell.className = `calculator-input-shell ${kind}-input-shell`;
      input.parentNode.insertBefore(shell, input);
      shell.appendChild(input);
      if (kind === "money" && !input.closest(".dialog-form")) {
        const prefix = document.createElement("span");
        prefix.className = "money-prefix";
        prefix.setAttribute("aria-hidden", "true");
        prefix.textContent = "₱";
        shell.insertBefore(prefix, input);
      }
    }
    calculatorPreviewElement(input);
    if (!shell.querySelector(".calculator-operator-row")) {
      const row = document.createElement("div");
      row.className = "calculator-operator-row";
      row.setAttribute("aria-label", "Calculator operators");
      [["+","Add"],["−","Subtract"],["×","Multiply"],["÷","Divide"],["(","Open parenthesis"],[")","Close parenthesis"]].forEach(([operator, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.tabIndex = -1;
        button.textContent = operator;
        button.setAttribute("aria-label", label);
        button.addEventListener("pointerdown", event => event.preventDefault());
        button.addEventListener("click", () => insertCalculatorOperator(input, operator));
        row.appendChild(button);
      });
      shell.appendChild(row);
    }
    return shell;
  }
  
  function bindCalculatorInput(input, kind) {
    if (input.dataset.numericBound === "true") return;
    input.dataset.numericBound = "true";
    input.maxLength = CALCULATOR_MAX_LENGTH;
    const shell = ensureCalculatorShell(input, kind);
    const update = kind === "money" ? updateMoneyCalculatorPreview : updateIntegerCalculatorPreview;
    const format = kind === "money" ? formatMoneyInput : formatIntegerInput;
    input.addEventListener("input", () => update(input, false));
    input.addEventListener("focus", () => {
      shell.classList.add("calculator-active");
      setTimeout(() => input.select(), 0);
      update(input, false);
    });
    input.addEventListener("blur", () => {
      format(input, true);
      setTimeout(() => shell.classList.remove("calculator-active"), 80);
    });
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (format(input, true)) input.select();
    });
    input.addEventListener("wheel", event => { if (document.activeElement === input) { event.preventDefault(); input.blur(); } }, { passive:false });
    format(input, false);
  }
  
  function setupNumericInputs(root = document) {
    root.querySelectorAll?.("[data-money-input]").forEach(input => {
      ensureCalculatorShell(input, "money");
      bindCalculatorInput(input, "money");
    });
    root.querySelectorAll?.("[data-integer-input]").forEach(input => {
      ensureCalculatorShell(input, "integer");
      bindCalculatorInput(input, "integer");
    });
  }

  Object.assign(root, { CALCULATOR_MAX_LENGTH, CALCULATOR_MAX_RESULT, calculatorError, normalizeCalculatorExpression, tokenizeCalculatorExpression, evaluateArithmeticExpression, roundCurrency, parseMoneyValue, moneyInputText, calculatorPreviewElement, setCalculatorPreview, setFieldError, expressionUsesOperators, updateMoneyCalculatorPreview, updateIntegerCalculatorPreview, formatMoneyInput, formatIntegerInput, setMoneyInputValue, moneyInputValue, integerInputValue, validateMoneyInput, validateIntegerInput, insertCalculatorOperator, ensureCalculatorShell, bindCalculatorInput, setupNumericInputs });
})(window);
