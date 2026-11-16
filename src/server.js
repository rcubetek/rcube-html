// rcube-html/server: write a <rcube-form> into a page made on the server.
//
// Node servers (Express, Fastify, Nest, Nuxt / Angular server routes, …) can also draw the form, so it shows before
// any JavaScript runs:
//   import { renderFormHtml } from "rcube-html/server";
//   res.send(`<html>…${renderFormHtml({ schema, values }, { attributes: { id: "signup", actions: "signupActions" } })}…
//     <script src="/rcube-html/rcube-html.js"></script>`);
// The page's <rcube-form> element then takes over (the drawn markup is replaced by the live form).
//
// Servers in other languages (Java / JSP, PHP, .NET, Python) write the same thing themselves: the element with its
// options as JSON — formConfigScript() shows the format, and integrations/jsp/rcube-form.tag does it for JSP.
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { DynamicTag } from "./DynamicTag";
import { useDynamicTag } from "./useDynamicTag";
import "./index";
import { prepareSchema, resolveRender, siteRegions } from "./site/core";
import { replaceRegions } from "./site/regions";

const escapeAttr = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const JSON_OPTIONS = ["schema", "buttons", "messages", "languages", "language", "data", "repeatable", "values"];

/** JSON that is safe inside a <script> element ("</script>" and line separators can't end it early). */
export const jsonForScript = (value) => JSON.stringify(value ?? null)
  .replace(/</g, "\\u003c")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");

const pick = (options = {}) => Object.fromEntries(JSON_OPTIONS.filter((key) => options[key] !== undefined).map((key) => [key, options[key]]));

/** The options as the JSON <rcube-form> reads: <script type="application/json" data-rcube="config">{…}</script> */
export const formConfigScript = (options) => `<script type="application/json" data-rcube="config">${jsonForScript(pick(options))}</script>`;

function ServerForm({ options }) {
  const { values, ...rest } = options;
  const form = useDynamicTag(rest);
  return h(DynamicTag, { form });
}

/**
 * The <rcube-form> element as HTML: its options as JSON, and (prerender, the default) the form drawn on the server.
 *   options     schema, buttons, messages, languages, language, data, repeatable, values (JSON only: actions are
 *               given in the browser — the "actions" attribute, el.actions or the rcube-action event)
 *   attributes  the element's attributes: { id, class, actions, language, … }
 *   prerender   false: only the element and its JSON (the form is drawn in the browser)
 *   hydrate     true: the browser takes the drawn form over (React hydration) instead of drawing it again — no flash;
 *               the element gets the attribute "hydrate"
 * Values are filled in when the form starts in the browser; the drawn form shows the schema's own defaults.
 */
export const renderFormHtml = (options = {}, { tag = "rcube-form", attributes = {}, prerender = true, hydrate = false } = {}) => {
  const config = pick(options);
  const attrs = Object.entries(hydrate && prerender ? { ...attributes, hydrate: true } : attributes)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`))
    .join("");
  const box = hydrate ? '<div data-rcube-ssr style="display:contents">' : "<div data-rcube-ssr>";
  const drawn = prerender ? `${box}${renderToString(h(ServerForm, { options: config }))}</div>` : "";
  return `<${tag}${attrs}>${formConfigScript(config)}${drawn}</${tag}>`;
};

/** A schema drawn as plain HTML (no element, no JSON, nothing for the browser to take over) */
export const renderSchemaHtml = (schema, options = {}) => renderToString(h(ServerForm, { options: { ...pick(options), schema } }));

// ---------------------------------------------------------------------------------------------- whole pages (sites)
// A page with regions (<div data-rcube-region="main"></div>) and its data (RcubeSite.site / RcubeSite.page settings,
// see rcube-html/src/site/core.js) -> the page with each region drawn as its render mode says:
//   "server"  <rcube-form hydrate> with its JSON and the drawn form (the browser takes it over)
//   "static"  the drawn HTML only
//   "client"  its "placeholder" drawn (if any) and its "noscript" HTML; the browser draws the region
// Each region's element gets data-rcube-rendered="server|static|client", which rcube-site.js reads. Running it again on
// its own output gives the same page (regions are replaced, not added to).
//   renderPage(html, { site, page, facts: { page: "about.html", env: "prod", lang: "en", year }, mode })
//   mode: "auto" (default: each region's render), or "server" / "static" / "client" for every region
// Returns { html, regions: [{ name, render }] }.
export const renderPage = (html, { site = {}, page = {}, facts = {}, mode = "auto" } = {}) => {
  const regions = siteRegions(site, page || {});
  const done = [];
  const out = replaceRegions(html, (box) => {
    const region = regions[box.name];
    if (!region) return null;
    const render = mode && mode !== "auto" ? resolveRender(mode, facts) : resolveRender(region.render, facts, "server");
    const schema = prepareSchema(region.schema, facts);
    done.push({ name: box.name, render });
    if (render === "server") return { html: renderFormHtml({ schema }, { hydrate: true }), attributes: { "data-rcube-rendered": "server" } };
    if (render === "static") return { html: renderSchemaHtml(schema), attributes: { "data-rcube-rendered": "static" } };
    const noscript = region.noscript ?? (box.name === "main" ? site.noscript : undefined);
    const placeholder = region.placeholder ? renderSchemaHtml(prepareSchema(region.placeholder, facts)) : "";
    return { html: (noscript ? `<noscript>${noscript}</noscript>` : "") + placeholder, attributes: { "data-rcube-rendered": "client" } };
  });
  return { html: out, regions: done };
};

export { resolveRender, siteRegions, prepareSchema, valuesFromUrl, pageFile } from "./site/core";
export { findRegions } from "./site/regions";
