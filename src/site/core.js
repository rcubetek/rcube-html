// rcube-html sites: the part shared by the browser (rcube-site.js) and the build (rcube-html/server, `rcube-html
// render`). No React here — plain data in, plain data out.
//
// A site is pages made of regions. Each region is a schema drawn into an element of the page:
//   <div data-rcube-region="main"></div>
// and how it is drawn is its "render":
//   "server"  drawn ahead of time (by `rcube-html render`), then taken over in the browser (forms, menus keep working)
//   "static"  drawn ahead of time, left as plain HTML (no JavaScript afterwards)
//   "client"  drawn in the browser only (its "placeholder" schema, if any, is drawn ahead of time in its place)
// A page that was never rendered ahead of time is drawn entirely in the browser, whatever the regions say.
//
// "render" can depend on what the build knows (never on the visitor):
//   "render": { "default": "client", "prod": "server" }                          by environment (--env prod)
//   "render": { "when": { "lang": ["en"], "env": ["prod"] }, "then": "server", "else": "client" }
//                                                     when every listed fact matches (env, lang, page; a value or a list)
// A node inside a schema can say "render": "client" (and "placeholder": [ … ]) to be drawn in the browser only, inside
// a region that is drawn ahead of time — e.g. a form in an otherwise pre-rendered page.
//
// Strings: "{year}" becomes the year (when drawn). Links (A) inside an El with "tag": "nav" to the current page get
// aria-current="page".

export const RENDER_MODES = ["server", "static", "client"];

const matches = (want, have) => (Array.isArray(want) ? want.map(String).includes(String(have)) : String(want) === String(have));

/**
 * The render mode a setting means for these facts ({ env, lang, page }); fallback when the setting gives none.
 *   resolveRender("static")                                          -> "static"
 *   resolveRender({ default: "client", prod: "server" }, { env: "prod" })  -> "server"
 *   resolveRender({ when: { lang: "en" }, then: "server", else: "client" }, { lang: "es" })  -> "client"
 */
export const resolveRender = (setting, facts = {}, fallback = "server") => {
  if (setting == null || setting === "") return fallback;
  if (typeof setting === "string") {
    if (!RENDER_MODES.includes(setting)) throw new Error(`rcube-html: unknown render mode "${setting}" (use ${RENDER_MODES.join(", ")})`);
    return setting;
  }
  if (typeof setting === "object") {
    if (setting.when && typeof setting.when === "object") {
      const ok = Object.entries(setting.when).every(([fact, want]) => matches(want, facts[fact]));
      return resolveRender(ok ? setting.then : setting.else, facts, fallback);
    }
    if (facts.env != null && Object.prototype.hasOwnProperty.call(setting, facts.env)) return resolveRender(setting[facts.env], facts, fallback);
    return resolveRender(setting.default, facts, fallback);
  }
  return fallback;
};

/**
 * The page's regions from its site and page settings: { name: { render, schema, placeholder, values } }.
 *   site: { render, regions: { header: {…}, footer: {…} }, header: [ … ], footer: [ … ] }   (header/footer: shorthand)
 *   page: { render, regions: { main: {…} }, schema: [ … ] }                                   (schema: shorthand for main)
 * A region the page names replaces the site's region of the same name. A region given as a list is its schema.
 * A region without its own "render" takes the page's, then the site's (resolved later with resolveRender).
 */
export const siteRegions = (site = {}, page = {}) => {
  const out = {};
  const add = (name, region) => {
    if (region == null) return;
    out[name] = Array.isArray(region) ? { schema: region } : { ...region };
  };
  if (site.header) add("header", site.header);
  if (site.footer) add("footer", site.footer);
  Object.entries(site.regions || {}).forEach(([name, r]) => add(name, r));
  if (page.schema) add("main", { schema: page.schema });
  Object.entries(page.regions || {}).forEach(([name, r]) => add(name, r));
  Object.values(out).forEach((r) => {
    if (r.render == null) r.render = page.render ?? site.render;
  });
  return out;
};

/** The file name of a page address: "/about.html" -> "about.html", "/" -> "index.html" */
export const pageFile = (path = "") => {
  const name = String(path).split(/[?#]/)[0].split("/").pop();
  return (name || "index.html").toLowerCase();
};

/**
 * A copy of a schema ready to draw:
 *   - "{year}" in every string -> the year
 *   - menu links (A inside an El with tag "nav") to the current page -> aria-current="page"
 *   - nodes with "render": "client" -> wrapped in a ClientOnly node (their "placeholder" drawn ahead of time)
 * facts: { page: "about.html", year, env, lang }
 */
export const prepareSchema = (schema, facts = {}) => {
  const year = String(facts.year ?? new Date().getFullYear());
  const here = facts.page ? pageFile(facts.page) : null;
  let islands = 0;
  const walk = (value, inNav) => {
    if (typeof value === "string") return value.split("{year}").join(year);
    if (Array.isArray(value)) return value.map((v) => walk(v, inNav));
    if (!value || typeof value !== "object") return value;
    const nav = inNav || (value.type === "El" && value.props?.tag === "nav");
    const out = {};
    Object.keys(value).forEach((k) => {
      if (k !== "render" && k !== "placeholder") out[k] = walk(value[k], nav);
    });
    if (nav && value.type === "A" && out.props && here && pageFile(out.props.href) === here) out.props = { ...out.props, "aria-current": "page" };
    if (value.type && value.render != null && resolveRender(value.render, facts, "server") === "client") {
      islands += 1;
      return {
        type: "ClientOnly",
        id: `${value.id || "client"}-${islands}-only`,
        items: [
          { key: "content", children: [out] },
          { key: "placeholder", children: walk(value.placeholder || [], nav) },
        ],
      };
    }
    return out;
  };
  return walk(schema || [], false);
};

/**
 * Field values from the page address: fromUrl { topic: { school: "School Office" } } and "?topic=school" ->
 * { topic: "School Office" }; a field mapped to true takes the parameter's text as it is.
 */
export const valuesFromUrl = (map, search = "") => {
  const values = {};
  if (!map) return values;
  const q = new URLSearchParams(search);
  Object.entries(map).forEach(([name, choices]) => {
    const v = q.get(name);
    if (v === null) return;
    if (choices === true) values[name] = v;
    else if (choices && Object.prototype.hasOwnProperty.call(choices, v)) values[name] = choices[v];
  });
  return values;
};
