# BeanMonitor SEO V2 Design

## Purpose

Turn BeanMonitor's existing daily market data into a small set of high-value, indexable public pages that can earn qualified search impressions without creating thin or generic AI content.

The current product already has working daily collection for prices, origin weather and Cup of Excellence auctions, plus a static site and a daily page builder. SEO V2 extends that existing flow instead of introducing a CMS or a new application stack.

## Scope

SEO V2 includes:

1. A dynamic homepage market snapshot sourced from the same public snapshot as the SEO pages.
2. Canonical URL normalization on `https://www.beanmonitor.coffee/`.
3. Four origin weather pages:
   - `/coffee-weather/brazil/minas-gerais/`
   - `/coffee-weather/colombia/huila/`
   - `/coffee-weather/ethiopia/sidama-gedeo/`
   - `/coffee-weather/vietnam/dak-lak/`
4. A Cup of Excellence season hub:
   - `/cup-of-excellence/2026/`
5. Ten Cup of Excellence country-season pages for the programs already tracked in `beanmonitor`:
   - Nicaragua
   - El Salvador
   - Costa Rica
   - Honduras
   - Guatemala
   - Mexico
   - Thailand
   - Indonesia
   - Brazil
   - Peru
6. A permanent commercial/search landing page:
   - `/coffee-market-brief/`
7. A methodology/source-transparency page:
   - `/methodology/`
8. Internal linking between the homepage, core hubs, origin pages and auction pages.
9. Sitemap expansion for every generated indexable page.
10. English-only generated SEO pages for this phase. Existing in-page language switching on the homepage remains untouched except for canonical cleanup.

Out of scope:

- Stripe, billing and subscription entitlement logic.
- Buttondown subscriber delivery changes.
- API/MCP implementation.
- Matcha or cacao verticals.
- Hundreds of per-lot, per-day, per-news or per-GPS-point pages.
- Programmatic pages without enough data to be useful.
- Rebuilding the site in WordPress or another framework.

## Architecture

`beanmonitor` remains the private data/collection repository. It will publish a richer `public-market.json` containing the same existing price and weather snapshot plus the auction fields needed to generate country-season analysis pages.

`beanmonitor-site` remains a static GitHub Pages repository. `scripts/build-market-pages.mjs` will be extended so a single build converts `data/market.json` into all public market pages, homepage snapshot values and the sitemap.

No server-side runtime is introduced. All indexable content is rendered into static HTML before deployment.

## Data flow

```text
beanmonitor daily workflow
  ├── daily.json
  ├── weather.json
  ├── auctions.json
  └── auctions-summary.json
          │
          ▼
  make-public-snapshot.mjs
          │
          ▼
  public-market.json
          │ copied to site
          ▼
beanmonitor-site/data/market.json
          │
          ▼
  scripts/build-market-pages.mjs
          ├── homepage market snapshot
          ├── core market pages
          ├── 4 weather origin pages
          ├── COE 2026 season hub
          ├── 10 country-season pages
          ├── coffee market brief page
          ├── methodology page
          └── sitemap.xml
```

## Public snapshot contract

The existing top-level fields remain backward-compatible:

- `generatedAt`
- `prices`
- `weather`
- `auctions`

The snapshot gains an `auctionPrograms` array. Each program contains only public, non-sensitive structured facts required by the static site:

```json
{
  "slug": "guatemala-2026",
  "country": "Guatemala",
  "year": 2026,
  "lots": [
    {
      "category": "General",
      "rank": "1",
      "farm": "El Injerto I",
      "score": 91.86,
      "weightLb": 66.14,
      "bidPerLb": 449.1,
      "totalValue": 29703.47,
      "buyer": "Enwan Coffee"
    }
  ]
}
```

The site builder computes aggregates such as lot count, weighted average bid, median bid, top bid, average score and top buyers from this array. Derived values are not duplicated in the private collector and public builder unless needed for backwards compatibility.

## Homepage

The current visual design remains. SEO V2 replaces the stale hard-coded market readings with values generated from `data/market.json`.

The homepage will surface and link to:

- Arabica current price and 52-week context → `/coffee-prices/`
- Minas Gerais current weather anomaly → `/coffee-weather/brazil/minas-gerais/`
- COE database count and current season summary → `/cup-of-excellence/2026/`

The homepage canonical becomes exactly:

`https://www.beanmonitor.coffee/`

Open Graph URL and structured WebSite URLs use the same host.

## Weather origin pages

Each of the four origin pages contains:

- Region and coffee type.
- Latest 7-day rainfall.
- Seasonal normal for the same window.
- Percentage of normal.
- Forecast minimum temperature.
- Current alert state.
- Explicit small-denominator context when the seasonal normal is low.
- Short deterministic explanation of what the reading means operationally, without inventing crop impacts.
- Links back to the weather hub and relevant price/brief pages.
- Source and update timestamp.

No separate page is created for individual GPS points in this phase.

### Weather alert presentation

The page never presents a large ratio alone. If the seasonal normal is below 5 mm, the copy must show both the ratio and the absolute values in the same visible block.

Example:

`3,205% of seasonal normal, based on 67.3 mm observed versus a very low 2.1 mm seasonal normal.`

This preserves the existing skill rule that small denominators can make technically correct percentages look more dramatic than the absolute amount.

## Cup of Excellence pages

### Season hub

`/cup-of-excellence/2026/` compares all tracked programs with available auction results.

For each country it shows:

- number of auction lots
- weighted average winning bid/lb
- median winning bid/lb
- top winning bid/lb
- top farm
- average score where available

Rows link to the corresponding country-season page.

### Country-season pages

Each `/cup-of-excellence/{country}/2026/` page shows:

- total auction lots
- weighted average bid/lb
- median bid/lb
- top bid/lb and farm
- average score
- top buyers by number of lots
- a compact table of highest-priced lots
- a source statement pointing to public Alliance for Coffee Excellence result pages
- links to the season hub and other country pages

A country-season page is indexable only when at least 5 auction result lots are present. When fewer than 5 lots exist, the builder does not generate that page and the sitemap does not include it.

No individual lot pages are generated.

## Coffee market brief landing page

`/coffee-market-brief/` targets users looking for an ongoing market brief rather than a market-size research report.

It contains:

- current Arabica snapshot
- current Brazil weather signal
- current COE database/season signal
- explanation of what the daily brief monitors
- a real sample/excerpt using existing site copy
- signup CTA to the existing Buttondown form
- links to the supporting price/weather/auction pages

No new subscription backend is introduced.

## Methodology page

`/methodology/` documents:

- price sources and the indicative-data disclaimer
- 52-week percentile calculation
- Open-Meteo forecast/archive use
- 2019-2025 weather normals
- small-denominator weather caveat
- Cup of Excellence public-source collection
- RSS source-bias labeling
- AI narrative generation and verification disclaimer

This page becomes the stable destination for credibility/source links from generated pages.

## Canonical and URL policy

Canonical host: `https://www.beanmonitor.coffee`.

Every generated page receives a self-referential canonical using `www`.

Internal absolute URLs, structured data and sitemap URLs use `www` consistently.

The existing `CNAME` remains `www.beanmonitor.coffee`.

Apex-to-www redirect behavior is a hosting/DNS concern and is not changed by repository code in this phase unless GitHub Pages exposes a repository-controlled mechanism already in use.

## Multilingual policy for this phase

Generated SEO pages are English only.

The existing homepage language selector continues to work for users, but SEO V2 does not create `/fr/`, `/es/`, `/pt/`, `/ja/` or `/ko/` trees yet. This avoids multiplying near-zero search demand across six language structures before Search Console shows a reason to do so.

The homepage hreflang configuration must not advertise separate language URLs that do not exist as distinct server-rendered pages. Phase V2 removes unsupported alternate-language sitemap entries rather than pretending query-parameter translations are independent static documents.

## Internal linking

Each generated page has navigation back to:

- Home
- Coffee prices
- Origin weather
- Cup of Excellence
- Coffee market brief
- Methodology

The homepage links visibly to all three primary data hubs.

Weather hub links to all four origin pages.

COE hub links to the 2026 season page, and the 2026 season page links to every generated country-season page.

## Sitemap

The sitemap contains only existing generated indexable URLs.

It includes:

- `/`
- `/coffee-prices/`
- `/coffee-weather/`
- four origin weather pages
- `/cup-of-excellence/`
- `/cup-of-excellence/2026/`
- generated country-season pages that meet the 5-lot threshold
- `/coffee-market-brief/`
- `/methodology/`

`lastmod` uses the public snapshot date for data-driven pages and the current build date for static methodology/brief pages.

## Error handling

The site build fails when required core data is missing or malformed instead of publishing empty pages.

Optional country pages are skipped when their lot threshold is not met.

Missing weather regions cause the corresponding origin page to be skipped, while the core weather hub still renders available regions. The build prints a clear warning.

All user-visible strings derived from source data are HTML-escaped.

## Testing and verification

Because the current repository has no automated test framework, SEO V2 adds a lightweight Node verification script rather than a dependency-heavy framework.

The verifier will:

1. run the page builder against the committed `data/market.json` fixture
2. assert expected files exist
3. assert generated pages use `www` canonicals
4. assert homepage no longer contains the stale hard-coded `335.9¢/lb` snapshot
5. assert weather pages contain current snapshot values and small-denominator context where required
6. assert the COE season page contains generated country links only for programs meeting the threshold
7. parse `sitemap.xml` and assert every listed local page exists
8. assert no unsupported `?lang=` hreflang URLs remain in the sitemap

The private `beanmonitor` change is verified by running `node make-public-snapshot.mjs` against the current committed data and checking that `auctionPrograms` is present while existing top-level fields remain intact.

## Branch strategy

All site work is performed on `beanmonitor-site:seo-v2`.

After design approval, a matching `beanmonitor:seo-v2` branch is created for the richer public snapshot.

Neither repository's `main` branch is modified during implementation.

## Success criteria

SEO V2 is ready for review when:

- all intended pages build from the current data snapshot without manual editing
- the homepage displays current snapshot data rather than hard-coded historic values
- all canonicals/sitemap URLs consistently use `www`
- four origin weather pages are generated when their source regions exist
- the 2026 COE hub and all qualifying country-season pages are generated
- no thin per-lot/per-day pages are created
- the market brief and methodology pages exist and are linked internally
- the verification scripts pass
- both repositories remain mergeable through review branches with `main` untouched
