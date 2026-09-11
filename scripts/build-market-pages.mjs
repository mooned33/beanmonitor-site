import { readFile, writeFile, mkdir } from "node:fs/promises";

const SITE = "https://www.beanmonitor.coffee";
const data = JSON.parse(await readFile("data/market.json", "utf8"));

if (!data?.generatedAt || !data?.prices?.arabica || !Array.isArray(data?.weather) || !data?.auctions) {
  throw new Error("Invalid market snapshot: generatedAt, arabica price, weather and auctions are required");
}

const auctionPrograms = Array.isArray(data.auctionPrograms) ? data.auctionPrograms : [];
const updated = new Date(data.generatedAt);
const dateIso = updated.toISOString().slice(0, 10);
const dateHuman = updated.toLocaleDateString("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const esc = (v) => String(v ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");
const num = (v, digits = 1) => Number(v).toLocaleString("en-US", {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});
const signed = (v, digits = 1) => {
  const n = Number(v);
  return (n > 0 ? "+" : "") + num(n, digits) + "%";
};

const STYLE = `body{margin:0;background:#0E1310;color:#ECE8DD;font-family:system-ui,-apple-system,sans-serif;line-height:1.65}main{max-width:960px;margin:auto;padding:56px 24px 80px}a{color:#9CC77A}nav{font-size:14px;margin-bottom:56px;display:flex;gap:14px;flex-wrap:wrap}h1{font-size:clamp(38px,7vw,68px);line-height:1.02;margin:.2em 0}h2{margin-top:42px}.k{font-family:monospace;color:#9CC77A;text-transform:uppercase;letter-spacing:.14em;font-size:12px}.card{border:1px solid #344237;border-radius:12px;padding:22px;background:#121A15}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin:30px 0}.value{font-size:42px;font-weight:800}.big{font-size:34px;font-weight:800}.muted{color:#9AA096}.alert{color:#E1A55C}.cta{display:inline-block;background:#79A15C;color:#0E1310;padding:12px 18px;border-radius:7px;text-decoration:none;font-weight:700;margin-top:12px}.source{font-size:13px;color:#9AA096;margin-top:34px}.detail{display:inline-block;margin-top:8px;font-size:14px}.table-wrap{overflow-x:auto;margin:24px 0}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:11px 10px;border-bottom:1px solid #344237}th{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#9AA096}.note{border-left:3px solid #C98A3D;padding:12px 16px;background:#151A16}.form{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.form input{flex:1;min-width:220px;padding:12px}.form button{padding:12px 18px;background:#79A15C;border:0;border-radius:6px;font-weight:700}`;

function head({ title, description, canonical, about = [] }) {
  const ld = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title.replace(" | BeanMonitor", ""),
    url: canonical,
    dateModified: dateIso,
    isPartOf: { "@type": "WebSite", name: "BeanMonitor", url: SITE + "/" },
    about,
  });
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${esc(title)}</title>\n<meta name="description" content="${esc(description)}">\n<link rel="canonical" href="${canonical}">\n<meta property="og:title" content="${esc(title)}">\n<meta property="og:description" content="${esc(description)}">\n<meta property="og:type" content="website">\n<meta property="og:url" content="${canonical}">\n<script type="application/ld+json">${ld}</script>\n<style>${STYLE}</style>\n</head>`;
}

function nav() {
  return `<nav><a href="/">← BeanMonitor</a><a href="/coffee-prices/">Coffee prices</a><a href="/coffee-weather/">Origin weather</a><a href="/cup-of-excellence/">COE auctions</a><a href="/coffee-market-brief/">Market brief</a><a href="/methodology/">Methodology</a></nav>`;
}

function validBidLots(lots) {
  return (lots || []).filter((l) => Number.isFinite(l.bidPerLb) && l.bidPerLb > 0);
}

function median(values) {
  const xs = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

function auctionStats(lots) {
  const xs = validBidLots(lots);
  if (!xs.length) return null;
  const weighted = xs.filter((l) => Number.isFinite(l.weightLb) && l.weightLb > 0);
  const weightedAvg = weighted.length
    ? weighted.reduce((s, l) => s + l.bidPerLb * l.weightLb, 0) / weighted.reduce((s, l) => s + l.weightLb, 0)
    : xs.reduce((s, l) => s + l.bidPerLb, 0) / xs.length;
  const scores = xs.map((l) => l.score).filter(Number.isFinite);
  const top = [...xs].sort((a, b) => b.bidPerLb - a.bidPerLb)[0];
  return {
    lots: xs.length,
    weightedAvg,
    medianBid: median(xs.map((l) => l.bidPerLb)),
    topBid: top.bidPerLb,
    topFarm: top.farm || "Unknown farm",
    avgScore: scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : null,
  };
}

function topBuyers(lots, limit = 5) {
  const counts = new Map();
  for (const lot of lots || []) {
    const buyer = String(lot.buyer || "").trim();
    if (!buyer) continue;
    counts.set(buyer, (counts.get(buyer) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

const WEATHER_ORIGINS = [
  { match: "Minas Gerais", country: "Brazil", slug: "brazil/minas-gerais", title: "Minas Gerais Coffee Weather" },
  { match: "Huila", country: "Colombia", slug: "colombia/huila", title: "Huila Coffee Weather" },
  { match: "Sidama/Gedeo", country: "Ethiopia", slug: "ethiopia/sidama-gedeo", title: "Sidama & Gedeo Coffee Weather" },
  { match: "Dak Lak", country: "Vietnam", slug: "vietnam/dak-lak", title: "Dak Lak Coffee Weather" },
];

const COUNTRY_SLUG = {
  Nicaragua: "nicaragua",
  "El Salvador": "el-salvador",
  "Costa Rica": "costa-rica",
  Honduras: "honduras",
  Guatemala: "guatemala",
  Mexico: "mexico",
  Thailand: "thailand",
  Indonesia: "indonesia",
  Brazil: "brazil",
  Peru: "peru",
};

function weatherMetaFor(region) {
  return WEATHER_ORIGINS.find((m) => region.region.includes(m.match));
}

function weatherContext(r) {
  if (!Number.isFinite(r.pctOfNormal)) return "Seasonal comparison is unavailable for this snapshot.";
  if (Number(r.normal7d) < 5) {
    return `${num(r.pctOfNormal, 0)}% of seasonal normal, based on ${num(r.rain7d)} mm observed versus a very low ${num(r.normal7d)} mm seasonal normal. The ratio is visually large because the seasonal baseline is small.`;
  }
  if (r.pctOfNormal >= 160) return "Rainfall was materially above the seasonal normal for this seven-day window.";
  if (r.pctOfNormal <= 50) return "Rainfall was materially below the seasonal normal for this seven-day window.";
  return "Rainfall was broadly within the seasonal range for this seven-day window.";
}

const generatedPages = new Set();
async function writePage(path, html, urlPath) {
  await mkdir(path.replace(/\/index\.html$/, ""), { recursive: true });
  await writeFile(path, html);
  generatedPages.add(urlPath);
}

const arabica = data.prices.arabica;
const pricesPage = `${head({
  title: "Arabica Coffee Price Today & 52-Week Context | BeanMonitor",
  description: "Track ICE Arabica coffee prices with 24-hour, 30-day and 52-week context for green coffee buyers.",
  canonical: SITE + "/coffee-prices/",
  about: ["Arabica coffee price", "ICE Coffee C futures", "green coffee buying"],
})}\n<body><main>\n${nav()}\n<div class="k">Coffee market intelligence</div>\n<h1>Arabica coffee price today, in buyer context.</h1>\n<p class="muted">A raw futures quote is only half the story. BeanMonitor tracks ICE Arabica together with its daily move, 30-day move and position inside the 52-week range.</p>\n<div class="card"><div class="k">Latest collected snapshot · ${dateHuman}</div><div class="value">${num(arabica.price, 2)}¢/lb</div><p>24-hour move: <strong>${signed(arabica.changePct24h)}</strong> · 30-day move: <strong>${signed(arabica.change30d)}</strong> · 52-week percentile: <strong>${esc(arabica.percentile52w)}</strong>.</p><p>52-week range: ${num(arabica.low52, 2)}¢ to ${num(arabica.high52, 2)}¢/lb.</p></div>\n<h2>Why the 52-week position matters</h2><p>The percentile gives buyers a fast reference point without pretending futures are the same as physical coffee differentials.</p>\n<h2>Price is one signal, not the whole market</h2><p>BeanMonitor reads price alongside origin weather, USD/BRL, Cup of Excellence auction results and industry news.</p>\n<a class="cta" href="/coffee-market-brief/">Get the free market brief</a>\n<p class="source">Source: indicative exchange price feed collected by BeanMonitor. Verify live quotes before purchasing or trading decisions. <a href="/methodology/">Methodology</a>.</p>\n</main></body></html>\n`;
await writePage("coffee-prices/index.html", pricesPage, "/coffee-prices/");

const regionCards = data.weather.map((r) => {
  const unusual = Number(r.pctOfNormal) >= 160 || Number(r.pctOfNormal) <= 50;
  const meta = weatherMetaFor(r);
  const detail = meta ? `<a class="detail" href="/coffee-weather/${meta.slug}/">View ${esc(meta.match)} detail →</a>` : "";
  return `<div class="card"><div class="k">${esc(r.region)}</div><div class="big${unusual ? " alert" : ""}">${Number.isFinite(r.pctOfNormal) ? num(r.pctOfNormal, 0) + "%" : "n/a"}</div><p>of seasonal normal · ${num(r.rain7d)} mm over 7 days vs ${num(r.normal7d)} mm normal.</p>${r.alerts?.length ? `<p class="alert">${esc(r.alerts[0])}</p>` : ""}${detail}</div>`;
}).join("\n");

const weatherPage = `${head({
  title: "Coffee Weather: Brazil, Colombia, Ethiopia & Vietnam | BeanMonitor",
  description: "Coffee origin rainfall compared with seasonal normals for key producing regions, updated from BeanMonitor's daily monitoring.",
  canonical: SITE + "/coffee-weather/",
  about: ["coffee weather", "Brazil coffee weather", "Colombia coffee weather", "Ethiopia coffee weather", "Vietnam coffee weather"],
})}\n<body><main>\n${nav()}\n<div class="k">Origin risk monitor</div>\n<h1>Coffee weather, measured against what is normal.</h1>\n<p class="muted">Raw rainfall totals can mislead without seasonality. BeanMonitor compares the latest seven-day rainfall with historical seasonal normals at monitored coffee origins.</p>\n<div class="grid">${regionCards}</div>\n<p class="muted">Latest collected snapshot: ${dateHuman}. Forecast and model data are indicative and should be checked against local sources.</p>\n<h2>Why coffee buyers should care</h2><p>Weather matters differently by crop stage. BeanMonitor does not turn one anomaly into a buying recommendation. It makes unusual conditions visible beside price and market signals.</p>\n<a class="cta" href="/coffee-market-brief/">Get the free market brief</a>\n<p class="source">Source: Open-Meteo model data and BeanMonitor seasonal normals. <a href="/methodology/">Methodology</a>.</p>\n</main></body></html>\n`;
await writePage("coffee-weather/index.html", weatherPage, "/coffee-weather/");

for (const meta of WEATHER_ORIGINS) {
  const r = data.weather.find((x) => x.region.includes(meta.match));
  if (!r) {
    console.warn(`Weather region missing: ${meta.match}`);
    continue;
  }
  const canonical = `${SITE}/coffee-weather/${meta.slug}/`;
  const alertHtml = (r.alerts || []).map((a) => `<p class="alert">${esc(a)}</p>`).join("");
  const page = `${head({
    title: `${meta.title} | BeanMonitor`,
    description: `${meta.title}: seven-day rainfall versus seasonal normal, forecast minimum temperature and current coffee-origin risk context.`,
    canonical,
    about: [`${meta.country} coffee weather`, meta.title, "coffee crop weather"],
  })}\n<body><main>\n${nav()}\n<div class="k">${esc(meta.country)} · coffee origin weather</div>\n<h1>${esc(meta.title)}</h1>\n<p class="muted">Latest collected snapshot: ${dateHuman}. Measurements below are monitoring signals, not crop-yield forecasts.</p>\n<div class="grid"><div class="card"><div class="k">Rain · last 7 days</div><div class="big">${num(r.rain7d)} mm</div></div><div class="card"><div class="k">Seasonal normal</div><div class="big">${num(r.normal7d)} mm</div></div><div class="card"><div class="k">Percent of normal</div><div class="big">${Number.isFinite(r.pctOfNormal) ? num(r.pctOfNormal, 0) + "%" : "n/a"}</div></div><div class="card"><div class="k">7-day forecast minimum</div><div class="big">${Number.isFinite(r.minForecast7d) ? num(r.minForecast7d) + "°C" : "n/a"}</div></div></div>\n${alertHtml}\n<h2>How to read this snapshot</h2><p class="note">${esc(weatherContext(r))}</p>\n<p>BeanMonitor compares rainfall with the seasonal baseline for the same calendar window. A single anomaly is a reason to investigate conditions, not a standalone buying instruction.</p>\n<a class="cta" href="/coffee-market-brief/">Get the free market brief</a>\n<p class="source">Source: Open-Meteo forecast/archive data and BeanMonitor seasonal normals. <a href="/methodology/">Read the methodology</a>.</p>\n</main></body></html>`;
  await writePage(`coffee-weather/${meta.slug}/index.html`, page, `/coffee-weather/${meta.slug}/`);
}

const a = data.auctions;
const auctionPage = `${head({
  title: "Cup of Excellence Auction Results & Price Database | BeanMonitor",
  description: "Track structured Cup of Excellence auction data including lots, average winning bid and top price per pound.",
  canonical: SITE + "/cup-of-excellence/",
  about: ["Cup of Excellence", "coffee auction results", "specialty coffee prices"],
})}\n<body><main>\n${nav()}\n<div class="k">Specialty coffee auctions</div>\n<h1>Cup of Excellence results, structured as data.</h1>\n<p class="muted">BeanMonitor monitors public Alliance for Coffee Excellence result pages and turns published auction results into a growing structured reference for buyers.</p>\n<div class="grid"><div class="card"><div class="k">Lots in database</div><div class="big">${num(a.lots, 0)}</div></div><div class="card"><div class="k">Programs tracked</div><div class="big">${num(a.programsTracked, 0)}</div></div><div class="card"><div class="k">Average winning bid</div><div class="big">$${num(a.avgBidPerLb, 2)}/lb</div></div><div class="card"><div class="k">Top bid in database</div><div class="big">$${num(a.topBidPerLb, 2)}/lb</div><p>${esc(a.topFarm)}</p></div></div>\n<a class="cta" href="/cup-of-excellence/2026/">Explore 2026 country comparisons</a>\n<p class="source">Source: public Alliance for Coffee Excellence auction result pages collected by BeanMonitor. <a href="/methodology/">Methodology</a>.</p>\n</main></body></html>\n`;
await writePage("cup-of-excellence/index.html", auctionPage, "/cup-of-excellence/");

const programs2026 = auctionPrograms
  .filter((p) => p.year === 2026 && COUNTRY_SLUG[p.country])
  .map((p) => ({ ...p, stats: auctionStats(p.lots) }))
  .filter((p) => p.stats && p.stats.lots >= 5);

const rows2026 = programs2026.length
  ? programs2026.map((p) => `<tr><td><a href="/cup-of-excellence/${COUNTRY_SLUG[p.country]}/2026/">${esc(p.country)}</a></td><td>${p.stats.lots}</td><td>$${num(p.stats.weightedAvg, 2)}</td><td>$${num(p.stats.medianBid, 2)}</td><td>$${num(p.stats.topBid, 2)}</td><td>${esc(p.stats.topFarm)}</td><td>${p.stats.avgScore == null ? "n/a" : num(p.stats.avgScore, 2)}</td></tr>`).join("\n")
  : `<tr><td colspan="7">Country-level 2026 analysis will appear as soon as the enriched auction snapshot is published.</td></tr>`;

const seasonPage = `${head({
  title: "Cup of Excellence 2026 Results by Country | BeanMonitor",
  description: "Compare Cup of Excellence 2026 auction results across tracked countries: winning bids, medians, top farms and scores.",
  canonical: SITE + "/cup-of-excellence/2026/",
  about: ["Cup of Excellence 2026", "coffee auction results", "specialty coffee auction prices"],
})}\n<body><main>\n${nav()}\n<div class="k">2026 auction season</div><h1>Cup of Excellence 2026, compared across countries.</h1><p class="muted">A cross-program view of public auction results. Only countries with at least five valid winning-bid lots receive an indexable country page.</p><div class="table-wrap"><table><thead><tr><th>Country</th><th>Lots</th><th>Weighted avg</th><th>Median</th><th>Top bid</th><th>Top farm</th><th>Avg score</th></tr></thead><tbody>${rows2026}</tbody></table></div><p class="source">Source: public Alliance for Coffee Excellence results. <a href="/methodology/">Methodology</a>.</p></main></body></html>`;
await writePage("cup-of-excellence/2026/index.html", seasonPage, "/cup-of-excellence/2026/");

for (const p of programs2026) {
  const slug = COUNTRY_SLUG[p.country];
  const buyers = topBuyers(p.lots).map(([buyer, count]) => `<li>${esc(buyer)} — ${count} lot${count === 1 ? "" : "s"}</li>`).join("") || "<li>No buyer data available.</li>";
  const topLots = validBidLots(p.lots).sort((x, y) => y.bidPerLb - x.bidPerLb).slice(0, 10)
    .map((l) => `<tr><td>${esc(l.rank)}</td><td>${esc(l.farm)}</td><td>${l.score == null ? "n/a" : num(l.score, 2)}</td><td>$${num(l.bidPerLb, 2)}</td><td>${esc(l.buyer || "")}</td></tr>`).join("");
  const canonical = `${SITE}/cup-of-excellence/${slug}/2026/`;
  const page = `${head({
    title: `${p.country} Cup of Excellence 2026 Results & Analysis | BeanMonitor`,
    description: `${p.country} Cup of Excellence 2026 auction results: average and median winning bids, top farm, scores and leading buyers.`,
    canonical,
    about: [`${p.country} Cup of Excellence 2026`, "coffee auction results"],
  })}\n<body><main>\n${nav()}\n<div class="k">${esc(p.country)} · Cup of Excellence 2026</div><h1>${esc(p.country)} Cup of Excellence 2026 results.</h1><div class="grid"><div class="card"><div class="k">Lots</div><div class="big">${p.stats.lots}</div></div><div class="card"><div class="k">Weighted average bid</div><div class="big">$${num(p.stats.weightedAvg, 2)}/lb</div></div><div class="card"><div class="k">Median bid</div><div class="big">$${num(p.stats.medianBid, 2)}/lb</div></div><div class="card"><div class="k">Top bid</div><div class="big">$${num(p.stats.topBid, 2)}/lb</div><p>${esc(p.stats.topFarm)}</p></div></div></div><h2>Most active buyers</h2><ul>${buyers}</ul><h2>Highest-priced lots</h2><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Farm</th><th>Score</th><th>Bid/lb</th><th>Buyer</th></tr></thead><tbody>${topLots}</tbody></table></div><p><a href="/cup-of-excellence/2026/">← Compare all tracked 2026 programs</a></p><a class="cta" href="/coffee-market-brief/">Get the free market brief</a><p class="source">Source: public Alliance for Coffee Excellence auction result pages. BeanMonitor structures and compares the published results; it is not the auction operator. <a href="/methodology/">Methodology</a>.</p></main></body></html>`;
  await writePage(`cup-of-excellence/${slug}/2026/index.html`, page, `/cup-of-excellence/${slug}/2026/`);
}

const minas = data.weather.find((r) => r.region.includes("Minas Gerais"));
const marketBriefPage = `${head({
  title: "Daily Coffee Market Brief for Roasters & Green Buyers | BeanMonitor",
  description: "A concise coffee market brief connecting Arabica prices, origin weather, Cup of Excellence auctions and industry signals for green coffee buyers.",
  canonical: SITE + "/coffee-market-brief/",
  about: ["coffee market brief", "green coffee buyers", "specialty coffee market"],
})}\n<body><main>\n${nav()}\n<div class="k">Independent coffee market intelligence</div><h1>A coffee market brief built for people who buy green coffee.</h1><p class="muted">BeanMonitor connects price context, origin weather, specialty auction results and industry reporting into one short brief.</p><div class="grid"><div class="card"><div class="k">Arabica today</div><div class="big">${num(arabica.price, 2)}¢/lb</div><p>${signed(arabica.changePct24h)} 24h · ${signed(arabica.change30d)} 30d · ${esc(arabica.percentile52w)}th percentile</p></div>${minas ? `<div class="card"><div class="k">Minas Gerais rain</div><div class="big">${num(minas.pctOfNormal, 0)}%</div><p>${num(minas.rain7d)} mm vs ${num(minas.normal7d)} mm seasonal normal</p></div>` : ""}<div class="card"><div class="k">COE database</div><div class="big">${num(a.lots, 0)} lots</div><p>$${num(a.avgBidPerLb, 2)}/lb weighted average · top $${num(a.topBidPerLb, 2)}/lb</p></div></div><h2>What the brief monitors</h2><p>Every edition puts the market quote in its 52-week context, compares rainfall with the seasonal baseline, flags new public auction results and separates neutral press from importer-published analysis.</p><h2>Get the free weekly edition</h2><form class="form" action="https://buttondown.com/api/emails/embed-subscribe/beanmonitor" method="post" target="_blank"><input type="email" name="email" required placeholder="you@roastery.com" aria-label="Email address"><input type="hidden" name="metadata__language" value="en"><input type="hidden" name="embed" value="1"><button type="submit">Get the free brief</button></form><p class="source">Independent analysis: BeanMonitor does not sell coffee. <a href="/methodology/">Sources and methodology</a>.</p></main></body></html>`;
await writePage("coffee-market-brief/index.html", marketBriefPage, "/coffee-market-brief/");

const methodologyPage = `${head({
  title: "BeanMonitor Methodology & Data Sources",
  description: "How BeanMonitor collects and interprets coffee prices, seasonal weather normals, Cup of Excellence auction results and industry news.",
  canonical: SITE + "/methodology/",
  about: ["coffee market data methodology", "coffee weather data", "coffee auction data"],
})}\n<body><main>\n${nav()}\n<div class="k">Sources & interpretation</div><h1>BeanMonitor methodology.</h1><h2>Prices</h2><p>The current implementation collects indicative Yahoo Finance market data for ICE Arabica, cocoa and USD/BRL. BeanMonitor adds 24-hour and approximately 30-day movement plus position inside the observed 52-week range. Indicative quotes should be verified before purchasing or trading decisions.</p><h2>Origin weather</h2><p>Weather comes from Open-Meteo forecast and archive APIs. Rainfall is compared with seasonal normals built from 2019-2025 archive observations at monitored origin points. Percentages are always interpreted with their absolute millimetres; when the seasonal baseline is very small, a large percentage can look more dramatic than the absolute rainfall amount.</p><h2>Auctions</h2><p>BeanMonitor structures results published on public Alliance for Coffee Excellence pages. It is not the auction operator. Country pages are only published when at least five valid winning-bid lots are available.</p><h2>Industry press</h2><p>Public RSS feeds are classified for market relevance. Importer-published analysis is retained when useful but labelled as an interested source because the publisher also sells coffee.</p><h2>AI narrative</h2><p>AI is used to turn collected facts into concise narrative under standing interpretation rules. The brief is labelled as AI-generated and users are asked to verify material information before a decision.</p><p class="source">Updated from the same monitoring system that generated the ${dateHuman} snapshot.</p></main></body></html>`;
await writePage("methodology/index.html", methodologyPage, "/methodology/");

async function updateHomepage() {
  let html = await readFile("index.html", "utf8");
  html = html
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${SITE}/">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${SITE}/">`)
    .replaceAll('"url":"https://beanmonitor.coffee"', `"url":"${SITE}/"`);

  const ticker = [
    `<a class="tape-item" href="/coffee-prices/">ARABICA ICE-C <b>${num(arabica.price, 2)}¢/lb</b> <span class="${Number(arabica.changePct24h) >= 0 ? "up" : "dn"}">${signed(arabica.changePct24h)} 24h</span> <span class="dim">· 52w pctile ${esc(arabica.percentile52w)}</span></a>`,
    minas ? `<a class="tape-item" href="/coffee-weather/brazil/minas-gerais/">MINAS GERAIS RAIN 7D <b>${num(minas.rain7d)}mm</b> <span class="${Number(minas.pctOfNormal) >= 160 ? "dn" : "dim"}">${num(minas.pctOfNormal, 0)}% of normal</span></a>` : "",
    `<a class="tape-item" href="/cup-of-excellence/2026/">COE AUCTION DB <b>${num(a.lots, 0)} lots</b> <span class="dim">· top $${num(a.topBidPerLb, 2)}/lb</span></a>`,
  ].filter(Boolean).join("\n    ");

  const tickerRe = /<div class="tape-track" id="tape-track">[\s\S]*?<\/div>\n<\/div>\n\n<section class="band-paper" id="signals">/;
  if (!tickerRe.test(html)) throw new Error("Homepage ticker block not found");
  html = html.replace(tickerRe, `<div class="tape-track" id="tape-track">\n    ${ticker}\n  </div>\n</div>\n\n<section class="band-paper" id="signals">`);

  await writeFile("index.html", html);
  generatedPages.add("/");
}
await updateHomepage();

const sitemapEntries = [...generatedPages]
  .sort((x, y) => x === "/" ? -1 : y === "/" ? 1 : x.localeCompare(y))
  .map((path) => `  <url><loc>${SITE}${path}</loc><lastmod>${dateIso}</lastmod><changefreq>${path === "/methodology/" ? "monthly" : "daily"}</changefreq><priority>${path === "/" ? "1.0" : "0.8"}</priority></url>`)
  .join("\n");
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</urlset>\n`;
await writeFile("sitemap.xml", sitemap);

console.log(`SEO V2 rebuilt ${generatedPages.size} pages from data/market.json at ${data.generatedAt}`);
