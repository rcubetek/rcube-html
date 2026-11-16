// The rcube-html command (bin/rcube-html.js; built with React inside, so nothing else needs installing):
//
//   rcube-html render <folder> [--out <folder>] [--mode auto|server|static|client] [--env <name>] [--lang <code>]
//                              [--year <yyyy>] [--data <dir>] [--check]
//
// Draws the pages of a static site ahead of time: every .html page with regions (<div data-rcube-region="main">) gets
// its regions drawn from its data files, as each region's "render" says (see src/site/core.js):
//   - the data files are the page's <script src="…"> under the data folder ("data/" by default, --data to change),
//     run as they are (RcubeSite.site({ … }) / RcubeSite.page({ … })); other scripts are left alone
//   - --mode client takes every region back to "drawn in the browser" (the pages then load as before)
//   - --env / --lang are the facts "render" conditions read; --lang defaults to the page's <html lang>
//   - without --out the pages are rewritten where they are (running it again replaces what it drew before)
//   - --check: change nothing, exit 1 if a page would change (for CI: "is what we publish rendered?")
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import vm from "node:vm";
import { renderPage } from "./server";

const USAGE = `rcube-html render <folder> [options]

Draws the pages of a static site ahead of time from their rcube-html data files.

  --out <folder>     write the site there (a copy) instead of rewriting the pages in place
  --mode <mode>      auto (each region's "render", the default), server, static or client (every region)
  --env <name>       the environment "render" conditions read (dev, staging, prod, …)
  --lang <code>      the language "render" conditions read (default: the page's <html lang>)
  --year <yyyy>      the year "{year}" becomes (default: this year)
  --data <dir>       the folder of the data files, relative to the site (default: data)
  --check            change nothing; exit 1 if a page isn't rendered as asked
`;

const SKIP_DIRS = new Set(["node_modules", ".git", "vendors", "vendor"]);

const parse = (argv) => {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--check" || a === "--help" || a === "-h") args[a.replace(/^-+/, "")] = true;
    else if (a.startsWith("--")) {
      const [key, inline] = a.slice(2).split("=");
      args[key] = inline ?? argv[(i += 1)];
      if (args[key] === undefined) throw new Error(`${a} needs a value`);
    } else args._.push(a);
  }
  return args;
};

const pagesIn = (dir, root = dir, list = []) => {
  readdirSync(dir).forEach((name) => {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name) && !name.startsWith(".")) pagesIn(full, root, list);
    } else if (/\.html?$/i.test(name)) list.push(full);
  });
  return list;
};

// The page's data: its <script src> files under the data folder, run with a stand-in RcubeSite that keeps the settings
const pageData = (file, html, root, dataDir) => {
  const got = { site: {}, page: null, scripts: [] };
  const RcubeSite = {
    site: (config) => { got.site = config || {}; },
    page: (config) => { got.page = config || {}; },
    component: () => {}, onSubmit: () => {}, onReady: () => {},
  };
  const dataRoot = resolve(root, dataDir) + sep;
  const SCRIPT = /<script\b[^>]*\ssrc\s*=\s*(["'])([^"']+)\1[^>]*>/gi;
  let m;
  while ((m = SCRIPT.exec(html))) {
    const src = m[2];
    if (/^([a-z]+:)?\/\//i.test(src)) continue; // another site
    const path = src.startsWith("/") ? join(root, src) : resolve(dirname(file), src.split(/[?#]/)[0]);
    if (!path.startsWith(dataRoot)) continue;
    if (!existsSync(path)) throw new Error(`${relative(root, file)}: ${src} not found`);
    const context = vm.createContext({ RcubeSite, console });
    vm.runInContext(readFileSync(path, "utf8"), context, { filename: path, timeout: 5000 });
    got.scripts.push(relative(root, path));
  }
  return got;
};

export const run = (argv) => {
  const args = parse(argv);
  const [command, folder] = args._;
  if (args.help || !command) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (command !== "render") throw new Error(`unknown command "${command}"\n\n${USAGE}`);
  if (!folder) throw new Error(`which folder?\n\n${USAGE}`);
  const source = resolve(folder);
  if (!existsSync(source) || !statSync(source).isDirectory()) throw new Error(`${folder} is not a folder`);
  const mode = args.mode || "auto";
  if (!["auto", "server", "static", "client"].includes(mode)) throw new Error(`--mode ${mode}: use auto, server, static or client`);
  let root = source;
  if (args.out && !args.check) {
    root = resolve(args.out);
    if (root === source) throw new Error("--out is the same folder as the site");
    cpSync(source, root, { recursive: true });
  }
  const dataDir = args.data || "data";
  const year = args.year || String(new Date().getFullYear());
  let changed = 0;
  let pages = 0;
  for (const file of pagesIn(root)) {
    const html = readFileSync(file, "utf8");
    if (!/data-rcube-region\s*=/.test(html)) continue;
    pages += 1;
    const name = relative(root, file).split(sep).join("/");
    const data = pageData(file, html, root, dataDir);
    const lang = args.lang || (/<html\b[^>]*\blang\s*=\s*["']([^"']+)/i.exec(html) || [])[1];
    const facts = { page: file.split(sep).pop(), env: args.env, lang, year };
    const result = renderPage(html, { site: data.site, page: data.page || {}, facts, mode });
    const summary = result.regions.map((r) => `${r.name}:${r.render}`).join(" ") || "no regions with data";
    if (result.html !== html) {
      changed += 1;
      if (!args.check) writeFileSync(file, result.html);
    }
    process.stdout.write(`${result.html !== html ? (args.check ? "would change" : "rendered") : "unchanged"}  ${name}  (${summary})\n`);
  }
  process.stdout.write(`${pages} page(s), ${changed} ${args.check ? "not rendered as asked" : "written"}${args.out && !args.check ? ` to ${args.out}` : ""}\n`);
  return args.check && changed ? 1 : 0;
};
