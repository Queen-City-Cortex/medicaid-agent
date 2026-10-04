# Statute access handoff

The normal fetcher and isolated Railway requests returned HTTP 200 maintenance pages for both subchapters. Fresh Firecrawl raw-HTML requests also found maintenance pages for the alternate Medicaid path, an individual section and the downloads page. The developer supplied a matching House maintenance screenshot; its URL is not visible. No response is admitted as statutory content.

- [Medicaid subchapter XIX](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title42-chapter7-subchapter19&edition=prelim)
- [CHIP subchapter XXI](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title42-chapter7-subchapter21&edition=prelim)
- [Alternate official Medicaid path](https://uscode.house.gov/view.xhtml?path=/prelim@title42/chapter7/subchapter19&edition=prelim)
- [Official download index](https://uscode.house.gov/download/download.shtml)
- [Individual USC §1396a](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title42-section1396a&num=0&edition=prelim)

A research lead is the [official GovInfo Title XIX compilation](https://www.govinfo.gov/app/details/COMPS-8765), which reports amendments through Public Law 119-75, enacted February 3, 2026. We have not established its exact equivalence to the current USC subchapter or implemented a validated parser adapter. Its availability is not a qualified replacement for both missing fetches.

A usable current download must retain its official retrieval URL and release/applicability metadata, supply the complete relevant statutory text, and pass the normal parser and anchor checks. Medicaid requires substantive SSA sections 1902, 1905 and 1915; CHIP requires 2101, 2103 and 2110. An older edition, cached search excerpt or isolated section cannot silently replace either subchapter. Recheck normal endpoints after maintenance; investigate any alternate format before changing canonical identities or cache admission.

Research stopped within the ten-credit ordinary Firecrawl budget. No Firecrawl Agent job or agency contact was used.
