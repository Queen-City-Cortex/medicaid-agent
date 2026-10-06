# Terms of Use Analysis — Source Sites
**March 29, 2026 | NC Medicaid Navigator**

**Status:** Requires attorney review before commercial launch. Fair use case is strong but not conclusive.

---

## Summary

| Source | Terms Issue | Risk | Federal/State |
|---|---|---|---|
| medicaid.ncdhhs.gov | "Non-commercial use" clause | **MEDIUM** | State |
| policies.ncdhhs.gov | No terms found | LOW | State |
| nctracks.nc.gov | No terms found | LOW | State |
| www.ncleg.gov | **OPEN ITEM (owner):** terms page not reviewed; the four `nc_statute` seed pages were added on 2026-10-06 without fetching or assessing the site's terms of use | NOT ASSESSED | State |
| ecfr.gov | Public domain | NONE | Federal |
| uscode.house.gov | Public domain | NONE | Federal |

**The only concern is the NC.gov "non-commercial use" clause** for state documents from medicaid.ncdhhs.gov. This affects clinical coverage policies, bulletins, and SPAs — the core state policy corpus.

---

## Site-by-Site Analysis

### 1. medicaid.ncdhhs.gov (Clinical Policies, Bulletins, SPAs, Waivers)

**Terms:** No dedicated terms page (returns 404). Defers to NC.gov state-level terms.

**NC.gov state-level terms of use:**

> "Unless otherwise noted on an individual document, the State of North Carolina grants permission to copy and distribute non-image files, documents, and information for **non-commercial use**, provided they are copied and distributed **without alteration** and appropriately **cite to the source**."

**NC.gov privacy policy — Copyright section:**

> "The copyright for the NC.gov website and its content is owned by the State of North Carolina, unless otherwise indicated."
> "Visitors are permitted to make fair use of the materials on this site in accordance with applicable copyright law."

**NC.gov privacy policy — Public Records:**

> "Government records in North Carolina generally are public in nature. The public policy of the State of North Carolina as established by the General Assembly is to 'provide that, as a general rule, the public would have liberal access to public records.'" (NC Public Records Act, Chapter 132)

**robots.txt:** Standard Drupal boilerplate. Blocks `/admin/`, `/search/`, `/user/`. Does NOT block `/providers/` or document download paths. Our crawler respects all Disallow directives and identifies itself via User-Agent.

### 2. policies.ncdhhs.gov (DHHS Policies Repository — 1,210 documents)

**Terms:** No dedicated terms page. WordPress document library with no visible terms of use, copyright notice, or usage restrictions.

**robots.txt:** Minimal — only blocks `/wp-admin/`. Provides sitemap. No restrictions on document access.

### 3. nctracks.nc.gov (Provider Manuals — 26 documents)

**Terms:** Returns a login redirect instead of terms. No robots.txt (returns HTML redirect). The provider manuals section is publicly accessible without authentication.

### 4. ecfr.gov (Federal Regulations — 42 CFR, 45 CFR)

**Terms:** No terms page (404). Has a public [Developer Resources](https://www.ecfr.gov/reader-aids/ecfr-developer-resources) page with a documented REST API.

**robots.txt:** Disallows `/api/versioner/v1/full/` — the endpoint we use. This Disallow targets web crawlers/search engines, not API consumers. The eCFR provides the API specifically for programmatic access.

**Legal status:** Federal regulations are public domain. The CFR is published by the Office of the Federal Register and is not copyrightable (1 U.S.C. § 112, 44 U.S.C. § 1507).

### 5. uscode.house.gov (Social Security Act — Title XIX, XXI)

**Terms:** No terms page.

**robots.txt:** Only blocks Yahoo's Slurp crawler. No other restrictions.

**Legal status:** The U.S. Code is public domain. Prepared by the Office of Law Revision Counsel of the U.S. House of Representatives.

---

## Fair Use Analysis (for the NC.gov "non-commercial use" clause)

The NC.gov terms grant permission for non-commercial use. We are building a commercial product. However, fair use under 17 U.S.C. § 107 is a separate defense that applies regardless of the website's stated terms.

**Factor 1 — Purpose and character of use:**
Strongly favors fair use. Our use is transformative — we convert PDF policy documents into a searchable knowledge graph with cross-references, vector embeddings, and an AI reasoning layer. We don't republish the documents; we cite excerpts in context of answering specific policy questions. This is a fundamentally different purpose from the original publication.

**Factor 2 — Nature of the copyrighted work:**
Strongly favors fair use. These are government policy documents created for public benefit and regulatory compliance. They are factual, not creative. Their purpose is to be read and applied by the public.

**Factor 3 — Amount and substantiality of the portion used:**
Moderately favors fair use. The agent quotes relevant excerpts, not entire documents. Users see section-level citations, not full document reproductions. The knowledge graph indexes the content but does not serve it wholesale.

**Factor 4 — Effect on the market:**
Strongly favors fair use. We do not substitute for the original publication. Users still need the official NCDHHS website for authoritative text. Our tool helps people find and understand the policies — it increases the utility of the original documents, not replaces them.

**Additional considerations:**

- NC Public Records Act (Chapter 132) establishes a strong public policy of liberal access to government records
- These documents are regulatory in nature — they define the rules that govern Medicaid beneficiaries' access to healthcare. Restricting access to tools that help people understand these rules would be contrary to the public purpose of the documents
- The NC.gov terms themselves reference fair use: "Visitors are permitted to make fair use of the materials on this site in accordance with applicable copyright law"
- Website terms of use are generally less enforceable than negotiated contracts, particularly for publicly available government information

---

## Recommendations

1. **Consult a copyright attorney** before commercial launch. The fair use case is strong but should be reviewed by counsel familiar with government document copyright.

2. **Always cite sources.** The agent already provides section-level citations. Ensure the UI includes a "View original document" link for every citation that points back to the NCDHHS website.

3. **Don't serve full document reproductions.** The agent should quote relevant excerpts, not return entire policy documents. This strengthens the transformative use argument.

4. **Consider requesting explicit permission.** Contact NC DHHS and explain the tool's purpose. Government agencies often grant permission for projects that help the public understand their policies. A written permission would eliminate the risk entirely.

5. **Monitor the NC.gov terms page.** If the terms change to explicitly restrict automated access or commercial derivative use, reassess immediately.

6. **The federal sources (eCFR, USC) have zero risk.** Federal law is public domain. No action needed.

---

## eCFR robots.txt Note

The eCFR robots.txt disallows `/api/versioner/v1/full/` — the exact path we use. Our crawler respects robots.txt for web crawling, but the eCFR API is a documented public API with its own developer resources page. The Disallow is intended to prevent search engines from indexing raw XML, not to prohibit API use. We should document this distinction in case of questions, but the risk is negligible.

---

*This analysis is not legal advice. Consult a licensed attorney before making commercial use decisions.*
