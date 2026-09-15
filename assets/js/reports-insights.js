"use strict";

/* Talaan V12.23.0 · reports and financial insights.
   All insights are derived locally from existing finance records, ledger history,
   saved monthly reports, budget plans, and project payments. */
(function reportsInsightsBootstrap() {
  const INSIGHTS_VERSION = 1;
  const FILTER_KEY = "simple-finance-report-insights-filter-v1";
  const originalRenderReports = renderReports;
  const originalRenderAll = renderAll;
  const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  const pad = value => String(value).padStart(2, "0");
  const safeText = (value, max = 120) => String(value || "").trim().slice(0, max);
  const html = value => typeof escapeHtml === "function" ? escapeHtml(String(value ?? "")) : String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const formatMoney = value => typeof money === "function" ? money(Number(value || 0)) : new Intl.NumberFormat("en-PH", { style:"currency", currency:"PHP" }).format(Number(value || 0));
  const monthName = month => typeof monthLabel === "function" ? monthLabel(month) : month;
  const monthShift = (month, offset) => typeof shiftMonth === "function" ? shiftMonth(month, offset) : (() => {
    const [year, monthNumber] = String(month).split("-").map(Number);
    const date = new Date(year, monthNumber - 1 + offset, 1);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  })();
  const firstDay = month => `${month}-01`;
  const lastDay = month => {
    const [year, monthNumber] = String(month).split("-").map(Number);
    return `${month}-${pad(new Date(year, monthNumber, 0).getDate())}`;
  };
  const itemMonth = item => String(item?.date || "").slice(0, 7);
  const expenseIncluded = item => typeof expenseIncludedInTotals === "function" ? expenseIncludedInTotals(item) : item?.includeInTotals !== false;
  const incomeIncluded = item => typeof incomeIncludedInTotals === "function" ? incomeIncludedInTotals(item) : item?.includeInTotals !== false && item?.category !== "Transfer from savings";
  const expensePlannedAmount = item => roundMoney(typeof monthlyExpenseAmount === "function" ? monthlyExpenseAmount(item) : Number(item?.amount || 0));
  const expensePaidAmount = item => roundMoney(typeof settledExpenseAmount === "function" ? settledExpenseAmount(item) : Number(item?.paidAmount || item?.amount || 0));
  const expenseComponentAmount = (item, amount) => roundMoney(globalThis.FinanceHouseholdSplits?.personalAmount?.(item, Number(amount || 0)) ?? Number(amount || 0));
  const projectIsIncluded = project => typeof projectIsFinancial === "function" ? projectIsFinancial(project) : project?.workSource !== "salary" || project?.compensationType === "extra-paid";
  const isUtility = item => typeof isUtilityExpense === "function" ? isUtilityExpense(item) : item?.expenseType === "utility" || item?.electricBillAmount != null || item?.waterBillAmount != null;
  const isGym = item => typeof isGymExpense === "function" ? isGymExpense(item) : item?.expenseType === "gym";

  function readStoredFilter() {
    try {
      const parsed = JSON.parse(localStorage.getItem(FILTER_KEY) || "null");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeStoredFilter(value) {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(value)); } catch (error) {}
  }

  function normalizeFilter(value = {}, anchorMonth = selectedMonth()) {
    const preset = ["month", "last3", "last6", "last12", "ytd", "year-compare", "custom"].includes(value.preset) ? value.preset : "last6";
    return {
      preset,
      startDate:/^\d{4}-\d{2}-\d{2}$/.test(value.startDate || "") ? value.startDate : firstDay(monthShift(anchorMonth, -5)),
      endDate:/^\d{4}-\d{2}-\d{2}$/.test(value.endDate || "") ? value.endDate : lastDay(anchorMonth),
      account:safeText(value.account, 80),
      category:safeText(value.category, 80)
    };
  }

  let filterState = normalizeFilter(readStoredFilter());

  function resolveRange(filter = filterState, anchorMonth = selectedMonth()) {
    const normalized = normalizeFilter(filter, anchorMonth);
    let startDate = normalized.startDate;
    let endDate = normalized.endDate;
    if (normalized.preset === "month") {
      startDate = firstDay(anchorMonth); endDate = lastDay(anchorMonth);
    } else if (normalized.preset === "last3") {
      startDate = firstDay(monthShift(anchorMonth, -2)); endDate = lastDay(anchorMonth);
    } else if (normalized.preset === "last6") {
      startDate = firstDay(monthShift(anchorMonth, -5)); endDate = lastDay(anchorMonth);
    } else if (normalized.preset === "last12") {
      startDate = firstDay(monthShift(anchorMonth, -11)); endDate = lastDay(anchorMonth);
    } else if (normalized.preset === "ytd" || normalized.preset === "year-compare") {
      startDate = `${anchorMonth.slice(0,4)}-01-01`; endDate = lastDay(anchorMonth);
    }
    if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
    return { ...normalized, startDate, endDate, startMonth:startDate.slice(0,7), endMonth:endDate.slice(0,7) };
  }

  function monthsBetween(startMonth, endMonth) {
    if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth) || startMonth > endMonth) return [];
    const result = [];
    let cursor = startMonth;
    let guard = 0;
    while (cursor <= endMonth && guard < 240) {
      result.push(cursor);
      cursor = monthShift(cursor, 1);
      guard += 1;
    }
    return result;
  }

  function dateWithin(date, startDate, endDate) {
    const value = String(date || "").slice(0,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= startDate && value <= endDate;
  }

  function accountMatches(item, account, paid = false) {
    if (!account) return true;
    const itemAccount = paid ? String(item?.paidFromAccount || item?.account || "") : String(item?.account || "");
    return itemAccount === account;
  }

  function categoryMatches(item, category) {
    return !category || String(item?.category || "Other") === category;
  }

  function projectPaymentsInRange(startDate, endDate) {
    const rows = [];
    (data.projects || []).filter(projectIsIncluded).forEach(project => {
      const history = Array.isArray(project.paymentHistory) ? project.paymentHistory : [];
      if (history.length) {
        history.forEach(payment => {
          if (!dateWithin(payment.date, startDate, endDate)) return;
          rows.push({ id:payment.id || `${project.id}-${payment.date}`, projectId:project.id, projectName:project.name, date:payment.date, amount:roundMoney(payment.amount), type:payment.type || "Payment" });
        });
      } else if (dateWithin(project.paymentDate, startDate, endDate) && Number(project.paid || 0)) {
        rows.push({ id:`${project.id}-${project.paymentDate}`, projectId:project.id, projectName:project.name, date:project.paymentDate, amount:roundMoney(project.paid), type:"Recorded payment" });
      }
    });
    return rows;
  }

  function actualPaidExpenses(range, account = "", category = "") {
    return (data.expenses || []).filter(item => item?.paid && expenseIncluded(item) && dateWithin(item.paidDate || item.date, range.startDate, range.endDate) && accountMatches(item, account, true) && categoryMatches(item, category));
  }

  function plannedExpenses(range, account = "", category = "") {
    return (data.expenses || []).filter(item => expenseIncluded(item) && dateWithin(item.date, range.startDate, range.endDate) && accountMatches(item, account, false) && categoryMatches(item, category));
  }

  function incomeRecordsInRange(range, account = "") {
    return (data.incomeRecords || []).filter(item => incomeIncluded(item) && dateWithin(item.date, range.startDate, range.endDate) && accountMatches(item, account, false));
  }

  function savedReportFor(month) {
    const saved = data.monthlyReports?.[month];
    if (saved && typeof saved === "object") return saved;
    try { return typeof reportForMonth === "function" ? reportForMonth(month) : null; } catch (error) { return null; }
  }

  function savingsValueForMonth(month) {
    const report = savedReportFor(month);
    const direct = Number(report?.savingsTotal);
    if (Number.isFinite(direct)) return direct;
    const accounts = report?.accountBalances || {};
    const types = report?.accountTypes || {};
    return roundMoney(Object.entries(accounts).filter(([name]) => types[name] === "Savings").reduce((sum,[,balance]) => sum + Number(balance || 0),0));
  }

  function ledgerBalanceAt(date, account = "") {
    const entries = (data.accountLedger || []).filter(entry => !entry?.voided && String(entry?.date || "") <= date && (!account || String(entry.account || "") === account));
    if (!entries.length) return null;
    return roundMoney(entries.reduce((sum,entry) => sum + Number(entry.amount || 0),0));
  }

  function accountBalanceForMonth(month, account = "") {
    const saved = data.monthlyReports?.[month];
    if (saved?.accountBalances && typeof saved.accountBalances === "object") {
      if (account) return roundMoney(saved.accountBalances[account] || 0);
      return roundMoney(Object.values(saved.accountBalances).reduce((sum,value) => sum + Number(value || 0),0));
    }
    const ledger = ledgerBalanceAt(lastDay(month), account);
    if (ledger !== null) return ledger;
    const balances = savedReportFor(month)?.accountBalances || data.accounts || {};
    if (account) return roundMoney(balances[account] || 0);
    return roundMoney(Object.values(balances).reduce((sum,value) => sum + Number(value || 0),0));
  }

  function plannedBudgetForMonth(month, category = "") {
    const plan = data.monthlyBudgets?.[month];
    if (!plan || !Array.isArray(plan.items)) return 0;
    return roundMoney(plan.items.filter(item => !category || item.category === category).reduce((sum,item) => sum + Number(item.plannedAmount || 0),0));
  }

  function monthlyMetrics(month, filter = filterState) {
    const range = { startDate:firstDay(month), endDate:lastDay(month) };
    const account = filter.account || "";
    const category = filter.category || "";
    const paid = actualPaidExpenses(range, account, category);
    const planned = plannedExpenses(range, account, category);
    const manualIncome = incomeRecordsInRange(range, account);
    const projectPayments = account ? [] : projectPaymentsInRange(range.startDate, range.endDate);
    const income = roundMoney(manualIncome.reduce((sum,item) => sum + Number(item.amount || 0),0) + projectPayments.reduce((sum,item) => sum + Number(item.amount || 0),0));
    const actualExpenses = roundMoney(paid.reduce((sum,item) => sum + expensePaidAmount(item),0));
    const plannedExpensesTotal = roundMoney(planned.reduce((sum,item) => sum + expensePlannedAmount(item),0));
    const budgetPlanned = plannedBudgetForMonth(month, category);
    const electric = roundMoney(planned.filter(isUtility).reduce((sum,item) => sum + expenseComponentAmount(item, item.electricBillAmount),0));
    const water = roundMoney(planned.filter(isUtility).reduce((sum,item) => sum + expenseComponentAmount(item, item.waterBillAmount),0));
    const gymItems = planned.filter(isGym);
    const gymVisits = gymItems.reduce((sum,item) => {
      if (Number.isFinite(Number(item.gymVisitCount)) && Number(item.gymVisitCount) > 0) return sum + Number(item.gymVisitCount);
      try { return sum + (typeof gymScheduledDatesForMonth === "function" ? gymScheduledDatesForMonth(item, month).length : 0); } catch (error) { return sum; }
    },0);
    const gymCost = roundMoney(gymItems.reduce((sum,item) => sum + expensePlannedAmount(item),0));
    const projectCosts = roundMoney(paid.filter(item => String(item.category || "") === "Project Costs").reduce((sum,item) => sum + expensePaidAmount(item),0));
    const projectIncome = roundMoney(projectPayments.reduce((sum,item) => sum + Number(item.amount || 0),0));
    return {
      month, income, actualExpenses, plannedExpenses:plannedExpensesTotal, budgetPlanned,
      netCashFlow:roundMoney(income - actualExpenses), savings:savingsValueForMonth(month),
      accountBalance:accountBalanceForMonth(month, account), electric, water, gymVisits, gymCost,
      projectIncome, projectCosts, projectMargin:roundMoney(projectIncome - projectCosts)
    };
  }

  function recurringExpenseChanges(months, category = "") {
    if (months.length < 2) return [];
    const recurring = (data.expenses || []).filter(item => expenseIncluded(item) && (item.recurring === "Monthly" || item.seriesId) && (!category || item.category === category));
    const byMonth = new Map(months.map(month => [month,new Map()]));
    recurring.forEach(item => {
      const month = itemMonth(item);
      if (!byMonth.has(month)) return;
      const key = String(item.seriesId || `${item.name}|${item.category}|${item.account}`).trim();
      byMonth.get(month).set(key,{ key, name:item.name || "Recurring expense", category:item.category || "Other", amount:expensePlannedAmount(item) });
    });
    const changes = [];
    for (let index = 1; index < months.length; index += 1) {
      const previousMonth = months[index-1], currentMonth = months[index];
      const before = byMonth.get(previousMonth), after = byMonth.get(currentMonth);
      const keys = new Set([...before.keys(),...after.keys()]);
      keys.forEach(key => {
        const oldItem = before.get(key), newItem = after.get(key);
        const previousAmount = Number(oldItem?.amount || 0), currentAmount = Number(newItem?.amount || 0);
        if (oldItem && newItem && roundMoney(previousAmount) === roundMoney(currentAmount)) return;
        const type = !oldItem ? "started" : !newItem ? "stopped" : currentAmount > previousAmount ? "increased" : "decreased";
        changes.push({ key, name:newItem?.name || oldItem?.name || "Recurring expense", category:newItem?.category || oldItem?.category || "Other", previousMonth, currentMonth, previousAmount, currentAmount, difference:roundMoney(currentAmount - previousAmount), type });
      });
    }
    return changes.sort((a,b) => Math.abs(b.difference) - Math.abs(a.difference) || b.currentMonth.localeCompare(a.currentMonth)).slice(0,30);
  }

  function categorySpending(range, account = "", category = "") {
    const totals = {};
    actualPaidExpenses(range, account, category).forEach(item => {
      const name = String(item.category || "Other");
      totals[name] = roundMoney((totals[name] || 0) + expensePaidAmount(item));
    });
    return Object.entries(totals).map(([name,amount]) => ({ name, amount })).sort((a,b) => b.amount - a.amount);
  }

  function savingsGoalsProgress() {
    return (data.savingsGoals || []).map(goal => {
      let current = Number(goal.currentAmount || 0);
      try { if (typeof savingsGoalCurrent === "function") current = Number(savingsGoalCurrent(goal) || 0); } catch (error) {}
      const target = Math.max(0,Number(goal.targetAmount || 0));
      return { id:goal.id, name:goal.name || "Savings goal", current:roundMoney(current), target:roundMoney(target), remaining:roundMoney(Math.max(0,target-current)), percent:target > 0 ? Math.max(0,Math.min(100,current/target*100)) : 0, targetDate:goal.targetDate || "" };
    }).sort((a,b) => b.percent - a.percent);
  }

  function rangeMetrics(inputFilter = filterState, anchorMonth = selectedMonth()) {
    const range = resolveRange(inputFilter, anchorMonth);
    const months = monthsBetween(range.startMonth, range.endMonth);
    const monthly = months.map(month => monthlyMetrics(month, range));
    const paid = actualPaidExpenses(range, range.account, range.category);
    const planned = plannedExpenses(range, range.account, range.category);
    const manualIncome = incomeRecordsInRange(range, range.account);
    const projectPayments = range.account ? [] : projectPaymentsInRange(range.startDate, range.endDate);
    const totalIncome = roundMoney(manualIncome.reduce((sum,item) => sum + Number(item.amount || 0),0) + projectPayments.reduce((sum,item) => sum + Number(item.amount || 0),0));
    const totalExpenses = roundMoney(paid.reduce((sum,item) => sum + expensePaidAmount(item),0));
    const totalPlannedExpenses = roundMoney(planned.reduce((sum,item) => sum + expensePlannedAmount(item),0));
    const totalBudget = roundMoney(monthly.reduce((sum,item) => sum + Number(item.budgetPlanned || 0),0));
    const firstSavings = monthly.length ? Number(monthly[0].savings || 0) : 0;
    const lastSavings = monthly.length ? Number(monthly.at(-1).savings || 0) : 0;
    const utility = monthly.map(item => ({ month:item.month, electric:item.electric, water:item.water, total:roundMoney(item.electric+item.water) }));
    const gymVisits = monthly.reduce((sum,item) => sum + Number(item.gymVisits || 0),0);
    const gymCost = roundMoney(monthly.reduce((sum,item) => sum + Number(item.gymCost || 0),0));
    const projectIncome = roundMoney(projectPayments.reduce((sum,item) => sum + Number(item.amount || 0),0));
    const projectCosts = roundMoney(paid.filter(item => String(item.category || "") === "Project Costs").reduce((sum,item) => sum + expensePaidAmount(item),0));
    return {
      range, months, monthly, totalIncome, totalExpenses, totalPlannedExpenses, totalBudget,
      netCashFlow:roundMoney(totalIncome-totalExpenses), categories:categorySpending(range,range.account,range.category),
      utility, gymVisits, gymCost, gymCostPerVisit:gymVisits ? roundMoney(gymCost/gymVisits) : 0,
      recurringChanges:recurringExpenseChanges(months,range.category), savingsGoals:savingsGoalsProgress(),
      savingsStart:firstSavings, savingsEnd:lastSavings, savingsChange:roundMoney(lastSavings-firstSavings),
      projectIncome, projectCosts, projectMargin:roundMoney(projectIncome-projectCosts),
      accountFilterNote:range.account ? "Project payments are not tied to an account and are excluded while an account filter is active." : "",
      generatedAt:new Date().toISOString()
    };
  }

  function comparisonMetrics(anchorMonth = selectedMonth(), filter = filterState) {
    const year = Number(anchorMonth.slice(0,4));
    const monthNumber = Number(anchorMonth.slice(5,7));
    const current = rangeMetrics({ ...filter, preset:"custom", startDate:`${year}-01-01`, endDate:lastDay(anchorMonth) }, anchorMonth);
    const priorMonth = `${year-1}-${pad(monthNumber)}`;
    const previous = rangeMetrics({ ...filter, preset:"custom", startDate:`${year-1}-01-01`, endDate:lastDay(priorMonth) }, priorMonth);
    return {
      label:`${year} YTD versus ${year-1} YTD`, current, previous,
      incomeDifference:roundMoney(current.totalIncome-previous.totalIncome),
      expenseDifference:roundMoney(current.totalExpenses-previous.totalExpenses),
      netDifference:roundMoney(current.netCashFlow-previous.netCashFlow),
      savingsDifference:roundMoney(current.savingsEnd-previous.savingsEnd)
    };
  }

  function percentChange(current, previous) {
    if (!Number(previous)) return null;
    return (Number(current)-Number(previous))/Math.abs(Number(previous))*100;
  }

  window.FinanceReportInsightsInternals = {
    INSIGHTS_VERSION, normalizeFilter, resolveRange, monthsBetween, dateWithin, monthlyMetrics,
    rangeMetrics, comparisonMetrics, recurringExpenseChanges, categorySpending, accountBalanceForMonth,
    savingsGoalsProgress, percentChange
  };
  if (window.__FINANCE_REPORT_INSIGHTS_TEST__) return;

  function emptyState(title, detail) {
    return `<div class="report-insights-empty"><strong>${html(title)}</strong><span>${html(detail)}</span></div>`;
  }

  function injectUi() {
    const reports = document.getElementById("reports");
    if (!reports || document.getElementById("reportInsightsWorkspace")) return;
    const nav = reports.querySelector(".report-section-nav");
    if (nav && !nav.querySelector('[data-report-target="report-insights-section"]')) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.reportTarget = "report-insights-section";
      button.textContent = "Insights";
      nav.insertBefore(button, nav.children[1] || null);
    }
    const comparison = reports.querySelector(".report-comparison-card");
    const heading = document.createElement("div");
    heading.className = "report-section-heading";
    heading.id = "report-insights-section";
    heading.innerHTML = '<span>INS</span><div><strong>Financial insights</strong><small>Cash flow, spending trends, balances, budgets, utilities, Gym, Savings, and projects</small></div>';
    const card = document.createElement("article");
    card.className = "card report-insights-card";
    card.id = "reportInsightsWorkspace";
    card.innerHTML = `
      <div class="report-insights-heading">
        <div><h3>Reports & financial insights</h3><p id="insightsRangeSummary">Selected reporting range</p></div>
        <div class="report-insights-actions no-print"><button class="button button-secondary button-small" id="exportInsightsCsv" type="button">Export insights CSV</button><button class="button button-primary button-small" id="printInsightsButton" type="button">Print / Save PDF</button></div>
      </div>
      <div class="report-insights-filters no-print">
        <div class="field"><label for="insightsRangePreset">Report range</label><select class="select" id="insightsRangePreset"><option value="month">Selected month</option><option value="last3">Last 3 months</option><option value="last6">Last 6 months</option><option value="last12">Last 12 months</option><option value="ytd">Year to date</option><option value="year-compare">Year-to-date comparison</option><option value="custom">Custom date range</option></select></div>
        <div class="field insights-custom-date"><label for="insightsStartDate">Start date</label><input class="input" id="insightsStartDate" type="date"></div>
        <div class="field insights-custom-date"><label for="insightsEndDate">End date</label><input class="input" id="insightsEndDate" type="date"></div>
        <div class="field"><label for="insightsAccountFilter">Account</label><select class="select" id="insightsAccountFilter"><option value="">All accounts</option></select></div>
        <div class="field"><label for="insightsCategoryFilter">Expense category</label><select class="select" id="insightsCategoryFilter"><option value="">All categories</option></select></div>
        <div class="report-insights-filter-actions"><button class="button button-primary" id="applyInsightsFilters" type="button">Apply</button><button class="button button-secondary" id="resetInsightsFilters" type="button">Reset</button></div>
      </div>
      <p class="report-insights-note" id="insightsFilterNote">Actual spending uses paid included expenses. Project payments are included unless an account filter is active.</p>
      <div class="report-insights-kpis">
        <div><span>Total income</span><strong class="text-green" id="insightsTotalIncome">₱0.00</strong><small>Included income and project payments</small></div>
        <div><span>Actual spending</span><strong class="text-red" id="insightsTotalExpenses">₱0.00</strong><small>Paid included expenses</small></div>
        <div><span>Net cash flow</span><strong id="insightsNetCashFlow">₱0.00</strong><small>Income minus actual spending</small></div>
        <div><span>Savings change</span><strong id="insightsSavingsChange">₱0.00</strong><small>First versus latest month</small></div>
        <div><span>Project margin</span><strong id="insightsProjectMargin">₱0.00</strong><small>Project income minus paid project costs</small></div>
      </div>
      <div class="report-insights-grid">
        <section class="report-insight-panel report-insight-wide"><div class="report-insight-panel-heading"><div><h4>Monthly cash-flow trend</h4><p>Income, actual spending, and net cash flow</p></div></div><div id="insightsCashFlowChart"></div></section>
        <section class="report-insight-panel"><div class="report-insight-panel-heading"><div><h4>Spending by category</h4><p>Paid included expenses in this range</p></div></div><div id="insightsCategoryChart"></div></section>
        <section class="report-insight-panel"><div class="report-insight-panel-heading"><div><h4>Account-balance history</h4><p>Saved month-end snapshots with ledger fallback</p></div></div><div id="insightsAccountHistory"></div></section>
        <section class="report-insight-panel report-insight-wide"><div class="report-insight-panel-heading"><div><h4>Planned versus actual</h4><p>Monthly budget plan and paid spending</p></div></div><div id="insightsBudgetChart"></div></section>
        <section class="report-insight-panel"><div class="report-insight-panel-heading"><div><h4>Utility-bill trend</h4><p>Electric and Water amounts by expense month</p></div></div><div id="insightsUtilityTrend"></div></section>
        <section class="report-insight-panel"><div class="report-insight-panel-heading"><div><h4>Gym insights</h4><p>Scheduled visits and cost per visit</p></div></div><div id="insightsGymSummary"></div></section>
        <section class="report-insight-panel"><div class="report-insight-panel-heading"><div><h4>Recurring-expense changes</h4><p>Started, stopped, increased, and decreased series</p></div></div><div id="insightsRecurringChanges"></div></section>
        <section class="report-insight-panel"><div class="report-insight-panel-heading"><div><h4>Savings progress</h4><p>Goal progress and savings-account trend</p></div></div><div id="insightsSavingsProgress"></div></section>
        <section class="report-insight-panel"><div class="report-insight-panel-heading"><div><h4>Project profitability</h4><p>Cash-basis project income and paid Project Costs</p></div></div><div id="insightsProjectProfitability"></div></section>
        <section class="report-insight-panel"><div class="report-insight-panel-heading"><div><h4>Year-to-date comparison</h4><p>Selected year through the selected month versus prior year</p></div></div><div id="insightsYearComparison"></div></section>
      </div>`;
    if (comparison) {
      comparison.insertAdjacentElement("afterend", card);
      comparison.insertAdjacentElement("afterend", heading);
    } else {
      reports.append(heading,card);
    }
    syncFilterControls();
  }

  function syncFilterControls() {
    const preset = document.getElementById("insightsRangePreset");
    if (!preset) return;
    const resolved = resolveRange(filterState);
    preset.value = resolved.preset;
    const start = document.getElementById("insightsStartDate"), end = document.getElementById("insightsEndDate");
    start.value = resolved.startDate; end.value = resolved.endDate;
    document.querySelectorAll(".insights-custom-date").forEach(field => field.hidden = resolved.preset !== "custom");
    const accountSelect = document.getElementById("insightsAccountFilter");
    const accounts = [...new Set([...Object.keys(data.accounts || {}),...(data.accountLedger || []).map(item => item.account).filter(Boolean)])].sort((a,b)=>a.localeCompare(b));
    accountSelect.innerHTML = '<option value="">All accounts</option>' + accounts.map(account => `<option value="${html(account)}">${html(account)}</option>`).join("");
    accountSelect.value = accounts.includes(resolved.account) ? resolved.account : "";
    const categorySelect = document.getElementById("insightsCategoryFilter");
    const categories = [...new Set((data.expenses || []).map(item => String(item.category || "Other")))].sort((a,b)=>a.localeCompare(b));
    categorySelect.innerHTML = '<option value="">All categories</option>' + categories.map(category => `<option value="${html(category)}">${html(category)}</option>`).join("");
    categorySelect.value = categories.includes(resolved.category) ? resolved.category : "";
  }

  function barPercent(value, max) { return max > 0 ? Math.max(0,Math.min(100,Math.abs(Number(value || 0))/max*100)) : 0; }

  function renderCashFlowChart(metrics) {
    const target = document.getElementById("insightsCashFlowChart");
    if (!target) return;
    if (!metrics.monthly.length) { target.innerHTML = emptyState("No monthly data", "Choose a reporting range containing finance records."); return; }
    const max = Math.max(1,...metrics.monthly.flatMap(item => [Math.abs(item.income),Math.abs(item.actualExpenses),Math.abs(item.netCashFlow)]));
    target.innerHTML = `<div class="insight-legend"><span class="income">Income</span><span class="expense">Actual spending</span><span class="net">Net cash flow</span></div><div class="insight-monthly-bars">${metrics.monthly.map(item => `<div class="insight-month-row"><strong>${html(monthName(item.month).replace(/\s+\d{4}$/,""))}</strong><div class="insight-bar-stack"><div class="insight-bar-line"><span>Income</span><i class="income" style="width:${barPercent(item.income,max)}%"></i><b>${formatMoney(item.income)}</b></div><div class="insight-bar-line"><span>Spent</span><i class="expense" style="width:${barPercent(item.actualExpenses,max)}%"></i><b>${formatMoney(item.actualExpenses)}</b></div><div class="insight-bar-line"><span>Net</span><i class="net ${item.netCashFlow<0?"negative":""}" style="width:${barPercent(item.netCashFlow,max)}%"></i><b class="${item.netCashFlow<0?"text-red":"text-green"}">${formatMoney(item.netCashFlow)}</b></div></div></div>`).join("")}</div>`;
  }

  function renderCategoryChart(metrics) {
    const target = document.getElementById("insightsCategoryChart");
    if (!target) return;
    if (!metrics.categories.length) { target.innerHTML = emptyState("No paid category spending", "Paid included expenses will appear here."); return; }
    const max = Math.max(...metrics.categories.map(item => item.amount),1);
    target.innerHTML = `<div class="insight-ranked-list">${metrics.categories.slice(0,10).map(item => `<div><div><span>${html(item.name)}</span><strong>${formatMoney(item.amount)}</strong></div><i><b style="width:${barPercent(item.amount,max)}%"></b></i></div>`).join("")}</div>`;
  }

  function lineChartSvg(values) {
    const width=560,height=170,padding=24;
    if (!values.length) return "";
    const min=Math.min(...values.map(item=>item.value),0),max=Math.max(...values.map(item=>item.value),1),span=max-min||1;
    const points=values.map((item,index)=>{const x=padding+(values.length===1?0:(width-padding*2)*index/(values.length-1));const y=height-padding-(height-padding*2)*(item.value-min)/span;return {x,y,...item};});
    const polyline=points.map(point=>`${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    return `<svg class="insight-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Account balance history"><line x1="${padding}" y1="${height-padding}" x2="${width-padding}" y2="${height-padding}" class="axis"></line><polyline points="${polyline}" class="balance-line"></polyline>${points.map(point=>`<circle cx="${point.x}" cy="${point.y}" r="4"><title>${html(monthName(point.month))}: ${html(formatMoney(point.value))}</title></circle>`).join("")}</svg>`;
  }

  function renderAccountHistory(metrics) {
    const target=document.getElementById("insightsAccountHistory"); if(!target)return;
    const values=metrics.monthly.map(item=>({month:item.month,value:item.accountBalance}));
    if(!values.length){target.innerHTML=emptyState("No account history","Save monthly reports or use the account ledger to build history.");return;}
    target.innerHTML=`${lineChartSvg(values)}<div class="insight-history-values">${values.map(item=>`<div><span>${html(monthName(item.month).replace(/\s+\d{4}$/,""))}</span><strong>${formatMoney(item.value)}</strong></div>`).join("")}</div>`;
  }

  function renderBudgetChart(metrics) {
    const target=document.getElementById("insightsBudgetChart"); if(!target)return;
    if(!metrics.monthly.length){target.innerHTML=emptyState("No monthly budget comparison","Create a monthly budget plan to compare planned and actual spending.");return;}
    const max=Math.max(1,...metrics.monthly.flatMap(item=>[item.budgetPlanned,item.actualExpenses]));
    target.innerHTML=`<div class="insight-budget-table"><div class="insight-budget-header"><span>Month</span><span>Budget plan</span><span>Actual paid</span><span>Variance</span></div>${metrics.monthly.map(item=>{const variance=roundMoney(item.budgetPlanned-item.actualExpenses);return `<div class="insight-budget-row"><strong>${html(monthName(item.month))}</strong><div><i><b class="planned" style="width:${barPercent(item.budgetPlanned,max)}%"></b></i><span>${formatMoney(item.budgetPlanned)}</span></div><div><i><b class="actual" style="width:${barPercent(item.actualExpenses,max)}%"></b></i><span>${formatMoney(item.actualExpenses)}</span></div><b class="${variance<0?"text-red":"text-green"}">${variance>=0?"+":""}${formatMoney(variance)}</b></div>`;}).join("")}</div>`;
  }

  function renderUtilityTrend(metrics) {
    const target=document.getElementById("insightsUtilityTrend");if(!target)return;
    const active=metrics.utility.filter(item=>item.total>0);
    if(!active.length){target.innerHTML=emptyState("No Utility Bill records","Electric and Water amounts from Utility Bill expenses will appear here.");return;}
    target.innerHTML=`<div class="insight-utility-list">${active.map(item=>`<div><strong>${html(monthName(item.month))}</strong><span>Electric ${formatMoney(item.electric)}</span><span>Water ${formatMoney(item.water)}</span><b>${formatMoney(item.total)}</b></div>`).join("")}</div>`;
  }

  function renderGymSummary(metrics) {
    const target=document.getElementById("insightsGymSummary");if(!target)return;
    target.innerHTML=`<div class="insight-mini-kpis"><div><span>Scheduled visits</span><strong>${metrics.gymVisits}</strong></div><div><span>Planned Gym cost</span><strong>${formatMoney(metrics.gymCost)}</strong></div><div><span>Cost per visit</span><strong>${metrics.gymVisits?formatMoney(metrics.gymCostPerVisit):"N/A"}</strong></div></div>${metrics.gymVisits?"":'<p class="insight-muted">Add Gym expense records to calculate visits and cost per visit.</p>'}`;
  }

  function renderRecurringChanges(metrics) {
    const target=document.getElementById("insightsRecurringChanges");if(!target)return;
    if(!metrics.recurringChanges.length){target.innerHTML=emptyState("No recurring changes","Monthly recurring amounts stayed the same, or the range contains fewer than two months.");return;}
    target.innerHTML=`<div class="insight-change-list">${metrics.recurringChanges.slice(0,10).map(item=>`<div><span class="insight-change-chip ${item.type}">${html(item.type)}</span><div><strong>${html(item.name)}</strong><small>${html(monthName(item.previousMonth))} → ${html(monthName(item.currentMonth))}</small></div><b class="${item.difference>0?"text-red":"text-green"}">${item.type==="started"?formatMoney(item.currentAmount):item.type==="stopped"?`−${formatMoney(item.previousAmount)}`:`${item.difference>0?"+":""}${formatMoney(item.difference)}`}</b></div>`).join("")}</div>`;
  }

  function renderSavingsProgress(metrics) {
    const target=document.getElementById("insightsSavingsProgress");if(!target)return;
    const goals=metrics.savingsGoals;
    target.innerHTML=`<div class="insight-savings-change"><span>Range savings change</span><strong class="${metrics.savingsChange<0?"text-red":"text-green"}">${metrics.savingsChange>=0?"+":""}${formatMoney(metrics.savingsChange)}</strong><small>${formatMoney(metrics.savingsStart)} → ${formatMoney(metrics.savingsEnd)}</small></div>${goals.length?`<div class="insight-goal-list">${goals.slice(0,8).map(goal=>`<div><div><strong>${html(goal.name)}</strong><span>${formatMoney(goal.current)} of ${formatMoney(goal.target)}</span></div><i><b style="width:${goal.percent}%"></b></i><small>${goal.percent.toFixed(0)}% · ${formatMoney(goal.remaining)} remaining</small></div>`).join("")}</div>`:emptyState("No savings goals","Create a Savings Goal to track progress here.")}`;
  }

  function renderProjectProfitability(metrics) {
    const target=document.getElementById("insightsProjectProfitability");if(!target)return;
    const marginPercent=metrics.projectIncome?metrics.projectMargin/Math.abs(metrics.projectIncome)*100:null;
    target.innerHTML=`<div class="insight-mini-kpis"><div><span>Project income</span><strong class="text-green">${formatMoney(metrics.projectIncome)}</strong></div><div><span>Paid Project Costs</span><strong class="text-red">${formatMoney(metrics.projectCosts)}</strong></div><div><span>Cash margin</span><strong class="${metrics.projectMargin<0?"text-red":"text-green"}">${formatMoney(metrics.projectMargin)}</strong></div></div><p class="insight-muted">${marginPercent===null?"Add project payments to calculate a margin percentage.":`${marginPercent.toFixed(1)}% cash margin for this range.`} Project Costs are grouped across all projects because expense records are not currently linked to an individual project.</p>`;
  }

  function comparisonLine(label,current,previous,lowerIsBetter=false){const difference=roundMoney(current-previous);const good=lowerIsBetter?difference<0:difference>0;const bad=lowerIsBetter?difference>0:difference<0;const pct=percentChange(current,previous);return `<div><span>${html(label)}</span><strong>${formatMoney(current)}</strong><small class="${good?"comparison-good":bad?"comparison-bad":"comparison-neutral"}">${difference>=0?"+":""}${formatMoney(difference)}${pct===null?"":` · ${pct>=0?"+":""}${pct.toFixed(1)}%`}</small><em>Previous ${formatMoney(previous)}</em></div>`;}

  function renderYearComparison(metrics) {
    const target=document.getElementById("insightsYearComparison");if(!target)return;
    const comparison=comparisonMetrics(selectedMonth(),metrics.range);
    target.innerHTML=`<p class="insight-comparison-label">${html(comparison.label)}</p><div class="insight-ytd-grid">${comparisonLine("Income",comparison.current.totalIncome,comparison.previous.totalIncome)}${comparisonLine("Actual spending",comparison.current.totalExpenses,comparison.previous.totalExpenses,true)}${comparisonLine("Net cash flow",comparison.current.netCashFlow,comparison.previous.netCashFlow)}${comparisonLine("Savings balance",comparison.current.savingsEnd,comparison.previous.savingsEnd)}</div>`;
  }

  function renderInsights() {
    injectUi();
    const metrics=rangeMetrics(filterState,selectedMonth());
    const rangeLabel=`${new Date(`${metrics.range.startDate}T00:00:00`).toLocaleDateString("en-PH",{dateStyle:"medium"})} – ${new Date(`${metrics.range.endDate}T00:00:00`).toLocaleDateString("en-PH",{dateStyle:"medium"})}`;
    document.getElementById("insightsRangeSummary").textContent=`${rangeLabel}${metrics.range.account?` · ${metrics.range.account}`:""}${metrics.range.category?` · ${metrics.range.category}`:""}`;
    document.getElementById("insightsFilterNote").textContent=`Actual spending uses paid included expenses. Budget plans are category-based.${metrics.accountFilterNote?` ${metrics.accountFilterNote}`:""}`;
    document.getElementById("insightsTotalIncome").textContent=formatMoney(metrics.totalIncome);
    document.getElementById("insightsTotalExpenses").textContent=formatMoney(metrics.totalExpenses);
    const net=document.getElementById("insightsNetCashFlow"); net.textContent=formatMoney(metrics.netCashFlow); net.className=metrics.netCashFlow<0?"text-red":"text-green";
    const savings=document.getElementById("insightsSavingsChange"); savings.textContent=`${metrics.savingsChange>=0?"+":""}${formatMoney(metrics.savingsChange)}`; savings.className=metrics.savingsChange<0?"text-red":"text-green";
    const margin=document.getElementById("insightsProjectMargin"); margin.textContent=formatMoney(metrics.projectMargin); margin.className=metrics.projectMargin<0?"text-red":"text-green";
    renderCashFlowChart(metrics);renderCategoryChart(metrics);renderAccountHistory(metrics);renderBudgetChart(metrics);renderUtilityTrend(metrics);renderGymSummary(metrics);renderRecurringChanges(metrics);renderSavingsProgress(metrics);renderProjectProfitability(metrics);renderYearComparison(metrics);
    syncFilterControls();
  }

  function applyFilterFromControls() {
    filterState=normalizeFilter({
      preset:document.getElementById("insightsRangePreset").value,
      startDate:document.getElementById("insightsStartDate").value,
      endDate:document.getElementById("insightsEndDate").value,
      account:document.getElementById("insightsAccountFilter").value,
      category:document.getElementById("insightsCategoryFilter").value
    });
    writeStoredFilter(filterState);renderInsights();
  }

  function exportInsights(metrics=rangeMetrics(filterState,selectedMonth())) {
    const rows=[
      ["Talaan","Reports & Financial Insights"],
      ["Generated",metrics.generatedAt],["Start date",metrics.range.startDate],["End date",metrics.range.endDate],["Account filter",metrics.range.account||"All accounts"],["Expense category filter",metrics.range.category||"All categories"],[],
      ["SUMMARY"],["Total income",metrics.totalIncome],["Actual spending",metrics.totalExpenses],["Net cash flow",metrics.netCashFlow],["Planned expenses",metrics.totalPlannedExpenses],["Budget plan",metrics.totalBudget],["Savings start",metrics.savingsStart],["Savings end",metrics.savingsEnd],["Savings change",metrics.savingsChange],["Project income",metrics.projectIncome],["Paid Project Costs",metrics.projectCosts],["Project margin",metrics.projectMargin],["Gym visits",metrics.gymVisits],["Gym cost",metrics.gymCost],["Gym cost per visit",metrics.gymCostPerVisit],[],
      ["MONTHLY TREND"],["Month","Income","Actual spending","Net cash flow","Budget plan","Planned expenses","Account balance","Savings","Electric","Water","Gym visits","Gym cost","Project income","Project costs","Project margin"],
      ...metrics.monthly.map(item=>[item.month,item.income,item.actualExpenses,item.netCashFlow,item.budgetPlanned,item.plannedExpenses,item.accountBalance,item.savings,item.electric,item.water,item.gymVisits,item.gymCost,item.projectIncome,item.projectCosts,item.projectMargin]),[],
      ["SPENDING BY CATEGORY"],["Category","Actual paid amount"],...metrics.categories.map(item=>[item.name,item.amount]),[],
      ["RECURRING EXPENSE CHANGES"],["Expense","Category","Previous month","Current month","Previous amount","Current amount","Difference","Change type"],...metrics.recurringChanges.map(item=>[item.name,item.category,item.previousMonth,item.currentMonth,item.previousAmount,item.currentAmount,item.difference,item.type]),[],
      ["SAVINGS GOALS"],["Goal","Current","Target","Remaining","Progress percent","Target date"],...metrics.savingsGoals.map(goal=>[goal.name,goal.current,goal.target,goal.remaining,goal.percent.toFixed(1),goal.targetDate])
    ];
    if(typeof exportCsv==="function") exportCsv(`financial-insights-${metrics.range.startDate}-to-${metrics.range.endDate}.csv`,rows);
  }

  function bindEvents() {
    if (document.documentElement.dataset.reportInsightsBound === "1") return;
    document.documentElement.dataset.reportInsightsBound="1";
    document.addEventListener("change",event=>{
      if(event.target.id==="insightsRangePreset"){
        const custom=event.target.value==="custom";document.querySelectorAll(".insights-custom-date").forEach(field=>field.hidden=!custom);
        if(!custom){filterState={...filterState,preset:event.target.value};writeStoredFilter(filterState);renderInsights();}
      }
      if(event.target.id==="insightsAccountFilter"||event.target.id==="insightsCategoryFilter"){applyFilterFromControls();}
    });
    document.addEventListener("click",event=>{
      if(event.target.closest("#applyInsightsFilters")){applyFilterFromControls();return;}
      if(event.target.closest("#resetInsightsFilters")){filterState=normalizeFilter({preset:"last6",account:"",category:""});writeStoredFilter(filterState);renderInsights();return;}
      if(event.target.closest("#exportInsightsCsv")){exportInsights();return;}
      if(event.target.closest("#printInsightsButton")){window.print();}
    });
  }

  renderReports=function insightsRenderReports(...args){const result=originalRenderReports(...args);injectUi();renderInsights();return result;};
  PAGE_RENDERERS.reports=renderReports;
  renderAll=function insightsRenderAll(...args){const result=originalRenderAll(...args);injectUi();if(typeof activePageId!=="function"||activePageId()==="reports")renderInsights();return result;};

  injectUi();bindEvents();renderInsights();
})();
