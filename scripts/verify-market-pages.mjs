import { access, readFile } from "node:fs/promises";

const data = JSON.parse(await readFile("data/market.json", "utf8"));
const SITE = "https://www.beanmonitor.coffee";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function text(path) {
  return readFile(path, "utf8");
}

function validBidLots(lots) {
  return (lots || []).filter((l) => Number.isFinite(l.bidPerLb) && l.bidPerLb > 0);
}

const required = [
  "index.html",
  "coffee-prices/index.html",
  "coffee-weather/index.html",
  "cup-of-excellence/index.html",
  "cup-of-excellence/2026/index.html",
  "coffee-market-brief/index.html",
  "methodology/index.html",
  "sitemap.xml",
];
for (const path of required) assert(await exists(path), `${path} missing`);

const weatherPaths = [
  ["Minas Gerais", "coffee-weather/brazil/minas-gerais/index.html"],
  ["Huila", "coffee-weather/colombia/huila/index.html"],
  ["Sidama/Gedeo", "coffee-weather/ethiopia/sidama-gedeo/index.html"],
  ["Dak Lak", "coffee-weather/vietnam/dak-lak/index.html"],
];
for (const [region, path] of weatherPaths) {
  if (data.weather.some((r) => r.region.includes(region))) {
    assert(await exists(path), `${path} missing`);
    const html = await text(path);
    assert(html.includes("/coffee-market-brief/"), `${path} missing market brief link`);
    assert(html.includes("/methodology/"), `${path} missing methodology link`);
    assert(html.includes(`${SITE}/coffee-weather/`), `${path} missing www canonical`);
  }
}

const minas = data.weather.find((r) => r.region.includes("Minas Gerais"));
if (minas) {
  const html = await text("coffee-weather/brazil/minas-gerais/index.html");
  assert(html.includes(`${Number(minas.rain7d).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm`), "Minas current rain missing");
  assert(html.includes(`${Number(minas.normal7d).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm`), "Minas seasonal normal missing");
  if (Number(minas.normal7d) < 5) assert(html.includes("seasonal baseline is small"), "small-denominator context missing");
}

const homepage = await text("index.html");
assert(homepage.includes(`${SITE}/`), "homepage www canonical missing");
assert(!homepage.includes("335.9¢/lb"), "stale homepage Arabica snapshot still present");
assert(homepage.includes("/coffee-prices/"), "homepage price link missing");
assert(homepage.includes("/coffee-weather/brazil/minas-gerais/"), "homepage Minas link missing");
assert(homepage.includes("/cup-of-excellence/2026/"), "homepage COE season link missing");

const brief = await text("coffee-market-brief/index.html");
assert(brief.includes("https://buttondown.com/api/emails/embed-subscribe/beanmonitor"), "Buttondown form missing from market brief");
const methodology = await text("methodology/index.html");
assert(methodology.includes("2019-2025"), "weather normals period missing from methodology");

const countrySlug = {
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
for (const p of data.auctionPrograms || []) {
  if (p.year !== 2026 || !countrySlug[p.country]) continue;
  const qualifying = validBidLots(p.lots).length >= 5;
  const path = `cup-of-excellence/${countrySlug[p.country]}/2026/index.html`;
  if (qualifying) {
    assert(await exists(path), `qualifying country page missing: ${p.country}`);
    const html = await text(path);
    assert(html.includes("/coffee-market-brief/"), `${p.country} page missing market brief link`);
    assert(html.includes("/methodology/"), `${p.country} page missing methodology link`);
  }
}

const sitemap = await text("sitemap.xml");
assert(!sitemap.includes("?lang="), "unsupported language-query hreflang remains in sitemap");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
assert(locs.length >= 10, "sitemap unexpectedly small");
for (const loc of locs) {
  assert(loc.startsWith(`${SITE}/`), `non-www sitemap URL: ${loc}`);
  const url = new URL(loc);
  const local = url.pathname === "/" ? "index.html" : `${url.pathname.slice(1)}index.html`;
  assert(await exists(local), `sitemap target missing: ${local}`);
}

console.log(`SEO V2 verification passed: ${locs.length} sitemap URLs checked.`);
