// Website tests (run after a build: node scripts/site.mjs):
//   1. render settings: modes, by environment, "when" conditions, region / page / site precedence
//   2. prepareSchema: {year}, the current page in the menu, "render": "client" nodes -> ClientOnly
//   3. renderPage: server / static / client regions, placeholders, mode override, the same page when run again
//   4. the command: rcube-html render (in place, --out, --check, --mode client)
//   5. the browser: rcube-site.js takes a pre-rendered page over (same DOM nodes, no warnings), draws client regions,
//      leaves static ones, shows ClientOnly content, fills fields from the address, runs onSubmit
import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const require = createRequire(import.meta.url);
const server = require(join(pkg, "dist", "server.cjs"));
const { resolveRender, siteRegions, prepareSchema, renderPage, valuesFromUrl } = server;

// ---------------------------------------------------------------- 1. render settings
assert.equal(resolveRender(undefined), "server");
assert.equal(resolveRender("static"), "static");
assert.throws(() => resolveRender("later"), /unknown render mode/);
assert.equal(resolveRender({ default: "client", prod: "server" }, { env: "prod" }), "server");
assert.equal(resolveRender({ default: "client", prod: "server" }, { env: "dev" }), "client");
assert.equal(resolveRender({ when: { lang: ["en", "fr"] }, then: "server", else: "client" }, { lang: "en" }), "server");
assert.equal(resolveRender({ when: { lang: "en", env: "prod" }, then: "server", else: "client" }, { lang: "en", env: "dev" }), "client");
assert.equal(resolveRender({ when: { page: "faq.html" }, then: { default: "static" } }, { page: "faq.html" }), "static");
const regions = siteRegions(
  { render: "server", header: [{ type: "P" }], regions: { footer: { render: "static", schema: [] } } },
  { render: "client", schema: [{ type: "H1" }], regions: { aside: { render: "server", schema: [] } } },
);
assert.deepEqual(Object.keys(regions).sort(), ["aside", "footer", "header", "main"]);
assert.equal(regions.footer.render, "static", "a region's own render wins");
assert.equal(regions.header.render, "client", "then the page's");
assert.equal(regions.aside.render, "server");
assert.equal(siteRegions({ render: "static", header: [] }, {}).header.render, "static", "then the site's");
assert.deepEqual(valuesFromUrl({ topic: { school: "School Office" }, q: true }, "?topic=school&q=hi&x=1"), { topic: "School Office", q: "hi" });
assert.deepEqual(valuesFromUrl({ topic: { school: "S" } }, "?topic=nope"), {});
console.log("render settings: ok (modes, environments, conditions, region > page > site)");

// ---------------------------------------------------------------- 2. prepareSchema
const nav = { type: "El", props: { tag: "nav" }, children: [
  { type: "A", props: { href: "about.html", text: "About" } },
  { type: "A", props: { href: "faq.html", text: "FAQ" } },
] };
const prepared = prepareSchema([
  nav,
  { type: "P", props: { text: "© {year} RCube" } },
  { type: "El", id: "form", render: { default: "server", dev: "client" }, placeholder: [{ type: "P", props: { text: "Loading" } }], props: { tag: "div" } },
], { page: "/site/About.html", year: 2031, env: "dev" });
assert.equal(prepared[0].children[0].props["aria-current"], "page");
assert.equal(prepared[0].children[1].props["aria-current"], undefined);
assert.equal(prepared[1].props.text, "© 2031 RCube");
assert.equal(prepared[2].type, "ClientOnly");
assert.equal(prepared[2].items[0].children[0].render, undefined, "render / placeholder are taken off the node");
assert.equal(prepared[2].items[1].children[0].props.text, "Loading");
assert.equal(prepareSchema([{ type: "El", render: "server", props: {} }])[0].type, "El", "server nodes stay as they are");
console.log("prepareSchema: ok ({year}, aria-current, client nodes -> ClientOnly)");

// ---------------------------------------------------------------- 3. renderPage
const site = {
  render: "server",
  noscript: "Please turn JavaScript on.",
  regions: {
    header: { schema: [{ type: "El", props: { tag: "header", className: "site-header" }, children: [nav] }] },
    footer: { render: "static", schema: [{ type: "El", props: { tag: "footer" }, children: ["© {year}"] }] },
  },
};
const page = {
  fromUrl: { topic: { school: "School Office" } },
  regions: {
    main: { schema: [
      { type: "H1", props: { text: "About us" } },
      { type: "El", id: "contact", render: "client", placeholder: [{ type: "P", props: { text: "Loading the form…" } }], props: { tag: "div", className: "box" }, children: [
        { type: "InputField", props: { name: "name", label: "Name", required: true } },
        { type: "SelectField", props: { name: "topic", label: "Topic", options: ["Other", "School Office"] } },
        { type: "ButtonField", props: { text: "Send", onClick: "runValidation()" } },
      ] },
    ] },
    quote: { render: "client", placeholder: [{ type: "P", props: { text: "Prices load in a moment" } }], schema: [{ type: "P", props: { text: "Price: $10" } }] },
  },
};
const frame = `<!doctype html><html lang="en"><head><title>About</title></head><body>
<div data-rcube-region="header"></div>
<div data-rcube-region="main"><noscript>old</noscript></div>
<div data-rcube-region="quote"></div>
<div data-rcube-region="footer"></div>
<div data-rcube-region="unknown"><p>kept</p></div>
</body></html>`;
const facts = { page: "about.html", year: 2031 };
const once = renderPage(frame, { site, page, facts });
assert.deepEqual(once.regions.map((r) => `${r.name}:${r.render}`), ["header:server", "main:server", "quote:client", "footer:static"]);
assert.match(once.html, /data-rcube-region="header" data-rcube-rendered="server"><rcube-form hydrate><script type="application\/json" data-rcube="config">/);
assert.match(once.html, /<h1>About us<\/h1>/, "the main text is in the page");
assert.match(once.html, /Loading the form…/, "a client node's placeholder is drawn");
assert.doesNotMatch(once.html, /name="name"/, "a client node's fields are not drawn ahead of time");
assert.match(once.html, /data-rcube-region="quote" data-rcube-rendered="client"><p>Prices load in a moment<\/p><\/div>/);
assert.match(once.html, /data-rcube-rendered="static"><footer>© 2031<\/footer><\/div>/, "static: plain HTML, no element");
assert.match(once.html, /aria-current="page"/);
assert.match(once.html, /<div data-rcube-region="unknown"><p>kept<\/p><\/div>/, "regions without data are left alone");
assert.equal(renderPage(once.html, { site, page, facts }).html, once.html, "running it again gives the same page");
const allClient = renderPage(once.html, { site, page, facts, mode: "client" });
assert.match(allClient.html, /data-rcube-region="main" data-rcube-rendered="client"><noscript>Please turn JavaScript on.<\/noscript><\/div>/);
assert.doesNotMatch(allClient.html, /<rcube-form/, "mode client takes every drawn region back");
const prodOnly = renderPage(frame, { site: { ...site, render: { default: "client", prod: "server" } }, page, facts: { ...facts, env: "prod" } });
assert.equal(prodOnly.regions.find((r) => r.name === "header").render, "server");
console.log("renderPage: ok (server / static / client regions, placeholders, mode override, same page again)");

// ---------------------------------------------------------------- 4. the command
const work = mkdtempSync(join(tmpdir(), "rcube-site-"));
const cli = join(pkg, "bin", "rcube-html.js");
const runCli = (...args) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
};
try {
  const siteDir = join(work, "site");
  mkdirSync(join(siteDir, "data", "pages"), { recursive: true });
  writeFileSync(join(siteDir, "data", "site.js"), `RcubeSite.site(${JSON.stringify(site)});`);
  writeFileSync(join(siteDir, "data", "pages", "about.js"), `RcubeSite.page(${JSON.stringify(page)});`);
  const scripts = `<script src="rcube-html.js" defer></script><script src="rcube-site.js" defer></script><script src="data/site.js" defer></script><script src="data/pages/about.js" defer></script>`;
  writeFileSync(join(siteDir, "about.html"), frame.replace("</body>", `${scripts}</body>`));
  writeFileSync(join(siteDir, "plain.html"), "<!doctype html><p>no regions</p>");
  assert.equal(runCli("render", siteDir, "--check").code, 1, "--check: not rendered yet");
  const outDir = join(work, "out");
  const copied = runCli("render", siteDir, "--out", outDir, "--year", "2031");
  assert.equal(copied.code, 0, copied.out);
  assert.match(readFileSync(join(outDir, "about.html"), "utf8"), /<h1>About us<\/h1>/);
  assert.doesNotMatch(readFileSync(join(siteDir, "about.html"), "utf8"), /<h1>/, "--out leaves the source as it was");
  const inPlace = runCli("render", siteDir, "--year", "2031");
  assert.match(inPlace.out, /rendered {2}about\.html {2}\(header:server main:server quote:client footer:static\)/);
  assert.match(inPlace.out, /1 page\(s\), 1 written/);
  assert.equal(runCli("render", siteDir, "--check", "--year", "2031").code, 0, "--check: rendered");
  assert.equal(runCli("render", siteDir, "--mode", "client").code, 0);
  assert.doesNotMatch(readFileSync(join(siteDir, "about.html"), "utf8"), /<rcube-form/);
  assert.equal(runCli("render", siteDir, "--mode", "later").code, 2);
  assert.match(runCli().out, /rcube-html render <folder>/);
  console.log("command: ok (render in place, --out, --check, --mode client, errors)");
} finally {
  rmSync(work, { recursive: true, force: true });
}

// ---------------------------------------------------------------- 5. the browser takes the page over
const warnings = [];
const dom = new JSDOM(once.html, { url: "http://localhost/about.html?topic=school", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
window.console.warn = (...a) => warnings.push(a.join(" "));
window.console.error = (...a) => warnings.push(a.join(" "));
const h1 = window.document.querySelector("h1");
const footer = window.document.querySelector("footer");
window.eval(readFileSync(join(pkg, "dist", "browser", "rcube-html.js"), "utf8"));
window.eval(readFileSync(join(pkg, "dist", "browser", "rcube-site.js"), "utf8"));
window.eval(`RcubeSite.site(${JSON.stringify(site)}); RcubeSite.page(${JSON.stringify(page)});`);
const submitted = [];
window.RcubeSite.onSubmit((values) => submitted.push(values));
window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
await tick(50);
const doc = window.document;
assert.equal(doc.querySelector("h1"), h1, "the drawn heading is the same node: taken over, not drawn again");
assert.equal(doc.querySelector("footer"), footer, "the static footer is left as it is");
assert.equal(doc.querySelectorAll("rcube-form").length, 3, "header, main (taken over) and quote (drawn)");
assert.match(doc.querySelector('[data-rcube-region="quote"]').textContent, /Price: \$10/, "the client region is drawn");
assert.ok(doc.querySelector('input[name="name"]'), "the ClientOnly form is drawn in the browser");
assert.doesNotMatch(doc.querySelector('[data-rcube-region="main"] [data-rcube-ssr]').textContent, /Loading the form…/, "the placeholder is gone");
assert.equal(doc.querySelector('select[name="topic"]').value, "School Office", "?topic=school fills the field");
assert.equal(doc.querySelector('nav a[aria-current="page"]').textContent, "About");
assert.deepEqual(warnings.filter((w) => !/act\(|not wrapped in act/.test(w)), [], "no hydration warnings or errors");
const input = doc.querySelector('input[name="name"]');
Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, "Ann");
input.dispatchEvent(new window.Event("input", { bubbles: true }));
[...doc.querySelectorAll("button")].find((b) => b.textContent.trim() === "Send").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await tick(20);
assert.equal(submitted.length, 1, "onSubmit runs");
assert.equal(submitted[0].name, "Ann");
assert.equal(submitted[0].topic, "School Office");
console.log("browser: ok (taken over without redrawing, static left, client region and ClientOnly drawn, ?topic, onSubmit)");
window.close();
