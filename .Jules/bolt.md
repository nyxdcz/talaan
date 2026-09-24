# Bolt's Journal
## 2026-09-24 - Avoid Redundant Workspace Item Computation in Row Lookups
**Learning:** Calling a filtering/sorting helper function (`visibleIncome()`) inside a loop iterating over DOM rows (`rowEntries()`) resulted in an $O(N^2 \log N)$ bottleneck when mapping DOM rows to data items.
**Action:** Always pass pre-computed/cached lists into item/ID resolution functions inside rendering loops.
