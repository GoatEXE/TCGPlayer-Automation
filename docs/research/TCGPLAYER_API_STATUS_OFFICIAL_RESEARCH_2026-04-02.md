# TCGplayer API status — official research (2026-04-02)

## Executive answer

- **Current official status:** TCGplayer’s docs explicitly say they are **not granting new API access**. Exact quote: **“We are no longer granting new API access at this time.”** Source: TCGplayer Getting Started docs. https://docs.tcgplayer.com/docs/getting-started
- **Public access still exists only for existing/approved users**: the docs and terms continue to describe authenticated API usage, application keys, and store authorization flows. Source: https://docs.tcgplayer.com/docs/getting-started and https://docs.tcgplayer.com/docs/store-authorization-workflow
- **No official reopen plan or ETA was found** in TCGplayer docs/help pages or eBay announcements. I found **no published timeline** for restoring public signup or reopening API access.
- **Official reasons for closure/limitation:** TCGplayer states changes were made to **improve systems/service** and **improve security**; the terms also say API use must not undermine TCGplayer’s business interests or the unique value of TCG Content. Source: https://docs.tcgplayer.com/docs/announcements and https://help.tcgplayer.com/hc/en-us/articles/360061115874-TCGplayer-API-Terms-Conditions
- **Important distinction:** the April/August 2023 notice is a **version deprecation** notice (“previous API versions” removed after Aug 1, 2023), not an official statement that the API itself was permanently shut off for all existing users. Source: https://docs.tcgplayer.com/docs/announcements

## Evidence timeline

| Date | Source | What it says | Status |
|---|---|---|---|
| 2017-12-19 (historic article) | https://help.tcgplayer.com/hc/en-us/articles/115015805027-Version-2-2-12 | “The latest version of TCGplayer API (v1.6.0) provides the most up-to-date data.” | Historical evidence that API was actively maintained |
| 2022-06-08 | https://help.tcgplayer.com/hc/en-us/articles/360061115874-TCGplayer-API-Terms-Conditions | Terms say access is by request/approval, TCGplayer may revoke keys, and API is limited to approved purposes | Official policy showing controlled access |
| ~2023 (docs page, updated about 2 years ago) | https://docs.tcgplayer.com/docs/getting-started | “We are no longer granting new API access at this time.” and API version noted as v1.39.0 | Strongest official status statement on new access |
| 2023-03-30 | https://docs.tcgplayer.com/docs/announcements | “We will be deprecating our previous API versions in August 2023.” | Official version deprecation notice |
| 2023-05-25 (repeat notice) | https://docs.tcgplayer.com/docs/announcements | “By August 1, 2023, you need to update to the new API 1.39 version… Following August 1, 2023, you will no longer have access to previous versions.” | Official deadline for older versions |
| 2023-09-27 | https://help.tcgplayer.com/hc/en-us/articles/205004918-Terms-of-Service | Terms still say: “TCGplayer provides APIs for the development of apps using our data…” and direct users to the Developer Portal | Confirms API-related workflow still existed for approved/recognized use cases |
| 2024-02-27 / 2024-05-01 / 2024-07-31 | eBay investor releases | eBay publicly discusses ongoing collectibles strategy and TCGplayer as an acquired asset; no API reopening timeline stated | Context only; no direct API-access policy |

## Why it was closed

### Confirmed, official reasons

1. **To improve systems / service** — TCGplayer’s 2023 notice says: **“As we continue to improve our systems and provide you with the best service, we will be deprecating our previous API versions…”**
   - Source: https://docs.tcgplayer.com/docs/announcements
   - Confidence: **High** for version deprecation motive.

2. **Security hardening** — the same notice says: **“In order to to improve security, TLS 1.0 and 1.1 will be disabled for API access…”**
   - Source: https://docs.tcgplayer.com/docs/announcements
   - Confidence: **High** for security-related change.

3. **Business-interest / value protection** — the API Terms say the API may not be used in ways that **“undermine TCGplayer’s business interests or the unique value of TCG Content”** without consent.
   - Source: https://help.tcgplayer.com/hc/en-us/articles/360061115874-TCGplayer-API-Terms-Conditions
   - Confidence: **High** that this is an official governing principle; **moderate** that it explains the access restriction.

### Inferred / unconfirmed reasons

- **Operational burden / abuse prevention / strategic narrowing** are plausible interpretations, but I did **not** find an explicit official statement tying the new-access closure to those reasons.
- **eBay acquisition as the cause** is **not confirmed** by the official sources I found. The acquisition is real, but I found no official statement saying it caused API closure.

## Reopen plans / ETA

- **Confirmed official plan:** none found.
- **Confirmed ETA/timeline for reopening public access:** none found.
- **Best-supported conclusion:** as of the official docs I reviewed, TCGplayer has announced only that **new API access is not being granted**; there is no public commitment or date for reopening.
- Confidence: **High**.

## Open questions / what to monitor

- Whether TCGplayer publishes a new announcement that reverses **“no longer granting new API access”**.
- Whether the developer portal changes from general marketing text to a clear public signup flow.
- Any updates to:
  - https://docs.tcgplayer.com/docs/getting-started
  - https://docs.tcgplayer.com/docs/announcements
  - https://help.tcgplayer.com/hc/en-us/articles/360061115874-TCGplayer-API-Terms-Conditions
  - https://help.tcgplayer.com/hc/en-us/articles/205004918-Terms-of-Service
- Whether eBay publishes any API-specific policy or partner-access announcement for TCGplayer.

## Source list

1. **TCGplayer Getting Started with TCGplayer API** — official docs; contains the clearest statement that new access is not being granted.
   - https://docs.tcgplayer.com/docs/getting-started

2. **TCGplayer FAQ / Announcements** — official docs; contains the 2023 deprecation notice and TLS security change.
   - https://docs.tcgplayer.com/docs/announcements

3. **TCGplayer API Terms & Conditions** — official policy; explains approval-based access, revocation, and use restrictions.
   - https://help.tcgplayer.com/hc/en-us/articles/360061115874-TCGplayer-API-Terms-Conditions

4. **TCGplayer Terms of Service** — official policy; still references APIs and directs users to the Developer Portal.
   - https://help.tcgplayer.com/hc/en-us/articles/205004918-Terms-of-Service

5. **TCGplayer developer portal** — official portal landing page; still advertises API endpoints but does not provide an explicit reopen date.
   - https://developer.tcgplayer.com/

6. **eBay acquisition announcement** — official eBay press release; useful context only, not proof of API-access policy.
   - https://investors.ebayinc.com/investor-news/press-release-details/2022/eBay-Acquires-TCGplayer/default.aspx
