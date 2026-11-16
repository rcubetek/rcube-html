// dist/browser/rcube-site.js: draws a website from rcube-html schema kept in data files — plain HTML pages, no build
// needed (the `rcube-html render` command can draw them ahead of time; see src/site/core.js for the render modes).
// Load it after rcube-html.js, before the data files:
//
//   <div data-rcube-region="header"></div>
//   <div data-rcube-region="main"><noscript>…</noscript></div>
//   <div data-rcube-region="footer"></div>
//   <script src="rcube-html.js" defer></script>
//   <script src="rcube-site.js" defer></script>
//   <script src="data/site.js" defer></script>          RcubeSite.site({ regions: { header: {…}, footer: {…} }, … })
//   <script src="data/pages/about.js" defer></script>   RcubeSite.page({ regions: { main: { schema: [ … ] } }, … })
//   <script src="js/site.js" defer></script>            optional: RcubeSite.onSubmit(…), RcubeSite.component(…)
//
// The page is drawn when they have all run (DOMContentLoaded). Each region:
//   drawn ahead of time as "server"  its <rcube-form hydrate> takes the drawn HTML over (already, on its own)
//   drawn ahead of time as "static"  left as it is
//   anything else                    drawn now from the data (its "render" doesn't matter in the browser)
// Older pages with one <div id="page"> instead of regions get header + <main id="main"> + footer drawn into it.
//
// RcubeSite.site({ … })   shared by every page: regions (or header / footer), render, themeKey, fallbackHtml, env
// RcubeSite.page({ … })   this page: regions (or schema = the "main" region), render, values, fromUrl
// RcubeSite.component(name, fn, options)   a component of your own (RcubeHtml.registerComponent)
// RcubeSite.onSubmit(fn)  fn(values, form, event) after a form's runValidation() passes (form.api: setNodeProps, …)
// RcubeSite.onReady(fn)   fn(form, regionName) for each region's form once the page is drawn
// Built in: class "theme-toggle" switches light / dark (data-rc-theme on <html>, kept under themeKey), class
// "menu-toggle" opens the header menu (class "is-open" on .site-header), links to a part of the page (#id) land there.
import { pageFile, prepareSchema, siteRegions, valuesFromUrl } from "./core";

(function () {
  if (typeof window === "undefined") return;
  let siteConfig = {};
  let pageConfig = null;
  const submitHandlers = [];
  const readyHandlers = [];
  const root = document.documentElement;

  window.RcubeSite = {
    site(config) { siteConfig = config || {}; },
    page(config) { pageConfig = config || {}; },
    component(name, fn, options) { window.RcubeHtml?.registerComponent(name, fn, options); },
    onSubmit(fn) { submitHandlers.push(fn); },
    onReady(fn) { readyHandlers.push(fn); },
    // what the page has been given (for tools and tests)
    get config() { return { site: siteConfig, page: pageConfig }; },
  };

  const fail = (box, why) => {
    console.error(`rcube-site: ${why}`);
    if (box) box.innerHTML = siteConfig.fallbackHtml || "<p>This page could not be shown. Please reload it.</p>";
  };

  const attach = (form, name, values) => {
    form.addEventListener("rcube-submit", (e) => submitHandlers.forEach((fn) => fn(e.detail.values || {}, form, e)));
    form.ready.then(() => {
      if (values && Object.keys(values).length) form.values = values;
      readyHandlers.forEach((fn) => fn(form, name));
    });
  };

  const draw = () => {
    const R = window.RcubeHtml;
    const boxes = [...document.querySelectorAll("[data-rcube-region]")];
    const legacy = boxes.length ? null : document.getElementById("page");
    if (!boxes.length && !legacy) return;
    const facts = { page: pageFile(location.pathname), lang: root.getAttribute("lang") || undefined, env: siteConfig.env };
    const regions = siteRegions(siteConfig, pageConfig || {});
    const values = { ...(pageConfig?.values || {}), ...valuesFromUrl(pageConfig?.fromUrl, location.search) };
    const mainBox = legacy || boxes.find((b) => b.getAttribute("data-rcube-region") === "main") || boxes[0];

    if (!R) return fail(mainBox, "rcube-html.js did not load");
    if (legacy) {
      if (!pageConfig) return fail(legacy, "no page data (data/pages/<page>.js did not load)");
      const schema = [
        ...(regions.header?.schema || []),
        { type: "El", id: "main", props: { tag: "main", id: "main" }, children: regions.main?.schema || [] },
        ...(regions.footer?.schema || []),
      ];
      try {
        attach(R.mount(legacy, { schema: prepareSchema(schema, facts) }), "page", values);
      } catch (e) {
        fail(legacy, e?.message);
      }
      return;
    }
    boxes.forEach((box) => {
      const name = box.getAttribute("data-rcube-region");
      const drawn = box.getAttribute("data-rcube-rendered");
      if (drawn === "static") return;
      if (drawn === "server") {
        const form = box.querySelector("rcube-form");
        if (form) return attach(form, name, values);
      }
      const region = regions[name];
      if (!region) {
        if (name === "main" && !pageConfig) fail(box, "no page data (data/pages/<page>.js did not load)");
        return;
      }
      try {
        attach(R.mount(box, { schema: prepareSchema(region.schema, facts), values: { ...(region.values || {}), ...values } }), name, {});
      } catch (e) {
        fail(box, `region "${name}": ${e?.message}`);
      }
    });
  };

  const jumpToHash = () => {
    if (location.hash.length < 2) return;
    let target = null;
    try {
      target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    } catch (e) { /* not an id */ }
    target?.scrollIntoView({ behavior: "instant" });
  };

  // ---------- light / dark and the header menu ----------
  const showTheme = () => {
    const dark = root.getAttribute("data-rc-theme") === "dark";
    document.querySelectorAll(".theme-toggle").forEach((b) => b.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode"));
  };
  const setMenu = (open) => {
    document.querySelector(".site-header")?.classList.toggle("is-open", open);
    document.querySelector(".menu-toggle")?.setAttribute("aria-expanded", open ? "true" : "false");
  };
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t?.closest) return;
    if (t.closest(".theme-toggle")) {
      const next = root.getAttribute("data-rc-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-rc-theme", next);
      try {
        if (siteConfig.themeKey) localStorage.setItem(siteConfig.themeKey, next);
      } catch (err) { /* private window */ }
      showTheme();
    } else if (t.closest(".menu-toggle")) {
      setMenu(!document.querySelector(".site-header")?.classList.contains("is-open"));
    } else if (t.closest(".site-header nav a")) {
      setMenu(false);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setMenu(false);
  });

  // Deferred scripts run before DOMContentLoaded (readyState is already "interactive" then), so the data files after
  // this one are in when it fires; "load" covers a page that added this script later.
  let done = false;
  const start = () => {
    if (done) return;
    done = true;
    draw();
    showTheme();
    jumpToHash();
    // again once fonts and images are in (they move things), unless the visitor has scrolled already
    window.addEventListener("load", () => {
      if (window.scrollY === 0) jumpToHash();
    });
  };
  document.addEventListener("DOMContentLoaded", start);
  window.addEventListener("load", start);
  if (document.readyState === "complete") setTimeout(start, 0);
})();
