import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("assets/js/finance-integrity.js", "utf8");
const storage = new Map();
const context = vm.createContext({
  console,
  structuredClone,
  Date,
  JSON,
  Number,
  Math,
  Object,
  Array,
  Set,
  Map,
  window:{
    localStorage:{ getItem:key => storage.has(key) ? storage.get(key) : null, setItem:(key,value)=>storage.set(key,String(value)) },
    FinanceProfileArchitecture:{ activeProfileId:()=>"profile-personal" }
  }
});
vm.runInContext(source, context);
const integrity = context.window.FinanceIntegrity;
assert.equal(integrity.version, 1);

const valid = {
  accounts:{ Cash:700, Bank:300 }, ledgerSettings:{version:1},
  accountLedger:[
    {id:"open-cash",operationId:"open-cash",transactionId:"open-cash",account:"Cash",type:"opening-balance",amount:1000},
    {id:"open-bank",operationId:"open-bank",transactionId:"open-bank",account:"Bank",type:"opening-balance",amount:0},
    {id:"transfer-out",operationId:"transfer-out",transactionId:"transfer-1",requestId:"request-transfer-1",transferId:"transfer-1",account:"Cash",counterpartAccount:"Bank",type:"transfer-out",amount:-300},
    {id:"transfer-in",operationId:"transfer-in",transactionId:"transfer-1",requestId:"request-transfer-1",transferId:"transfer-1",account:"Bank",counterpartAccount:"Cash",type:"transfer-in",amount:300}
  ],
  accountReconciliations:[], expenses:[], incomeRecords:[]
};
assert.equal(integrity.scan(valid).counts.critical, 0, "valid transfer history must pass");

const archivedHistory = structuredClone(valid);
archivedHistory.accounts = { Cash:700 };
archivedHistory.accountLedger = [
  {id:"open-cash-archived-test",operationId:"open-cash-archived-test",transactionId:"open-cash-archived-test",account:"Cash",type:"opening-balance",amount:700},
  {id:"open-old-wallet",operationId:"open-old-wallet",transactionId:"open-old-wallet",account:"Old Wallet",type:"opening-balance",amount:0}
];
archivedHistory.ledgerSettings = { version:1, archivedAccounts:{ "Old Wallet":{ source:"account-deletion" } } };
assert.equal(integrity.scan(archivedHistory).counts.critical, 0, "archived ledger account references must remain valid audit history");

const unmarkedArchivedHistory = structuredClone(archivedHistory);
delete unmarkedArchivedHistory.ledgerSettings.archivedAccounts;
assert.ok(integrity.scan(unmarkedArchivedHistory).issues.some(item => item.code === "ledger-account-missing"), "unmarked orphan account references must still be diagnosed");

const halfTransfer = structuredClone(valid);
halfTransfer.accountLedger = halfTransfer.accountLedger.filter(entry => entry.id !== "transfer-in");
halfTransfer.accounts.Bank = 0;
assert.ok(integrity.scan(halfTransfer).issues.some(item => item.code === "transfer-pair-incomplete" && item.severity === "critical"));

const duplicate = structuredClone(valid);
duplicate.accountLedger.push({...duplicate.accountLedger[0],id:"duplicate-open",amount:0});
assert.ok(integrity.scan(duplicate).issues.some(item => item.code === "duplicate-operation-id" && item.severity === "critical"));

const brokenPayment = structuredClone(valid);
brokenPayment.expenses=[{id:"expense-1",name:"Rent",paid:true,accountDeducted:true,paidFromAccount:"Cash",paidAmount:100,paymentTransactionId:"missing-payment"}];
assert.ok(integrity.scan(brokenPayment).issues.some(item => item.code === "expense-payment-ledger-missing"));

const externalPayment = structuredClone(valid);
externalPayment.expenses=[{id:"expense-ext",name:"Shared bill",paid:true,accountDeducted:false,paidFromAccount:"",paidAmount:0,paymentTransactionId:""}];
assert.equal(integrity.scan(externalPayment).counts.critical, 0, "external household payment must not create a false critical issue");

const brokenIncome = structuredClone(valid);
brokenIncome.incomeRecords=[{id:"income-1",name:"Salary",account:"Cash",amount:500,postToLedger:true,ledgerTransactionId:"income-tx"}];
assert.ok(integrity.scan(brokenIncome).issues.some(item => item.code === "income-deposit-ledger-missing"));

const safeMismatch = structuredClone(valid);
safeMismatch.accounts.Cash = 999;
const mismatchReport = integrity.scan(safeMismatch);
assert.ok(mismatchReport.issues.some(item => item.code === "ledger-balance-mismatch" && item.severity === "safe-repair"));
const repaired = integrity.repairSafe(safeMismatch);
assert.equal(repaired.ok, true);
assert.equal(repaired.data.accounts.Cash, 700);
assert.ok(repaired.changes.some(item => item.type === "recalculate-account"));

const relink = structuredClone(valid);
relink.accountLedger.push({id:"rec-ledger",operationId:"rec-op",transactionId:"rec-tx",reconciliationId:"rec-1",account:"Cash",type:"reconciliation-adjustment",amount:0});
relink.accountReconciliations=[{id:"rec-1",account:"Cash",previousBalance:700,statementBalance:700,difference:0,ledgerEntryId:""}];
const relinkReport=integrity.scan(relink);
assert.ok(relinkReport.issues.some(item => item.code === "reconciliation-link-missing" && item.severity === "safe-repair"));
assert.equal(integrity.repairSafe(relink).data.accountReconciliations[0].ledgerEntryId,"rec-ledger");

storage.set("simple-finance-project-records-v2", JSON.stringify(valid));
const profileCopy = structuredClone(valid); profileCopy.accounts.Cash = 701;
storage.set("simple-finance-profile-data-v1:profile-personal", JSON.stringify(profileCopy));
assert.ok(integrity.scan(valid,{includeStorage:true}).issues.some(item => item.code === "storage-profile-mismatch"));

console.log("Financial integrity scanner and deterministic repair validation passed.");
