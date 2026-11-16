// Finding the regions of an HTML page as text (for the build: no DOM needed): <tag … data-rcube-region="name" …>…</tag>

const REGION = /<([a-zA-Z][\w-]*)\b([^>]*?)\sdata-rcube-region\s*=\s*(["'])([^"']+)\3([^>]*)>/g;

/** The region elements of a page: [{ name, tag, start, openEnd, closeStart, end, openTag }] (positions in the text) */
export const findRegions = (html) => {
  const found = [];
  REGION.lastIndex = 0;
  let m;
  while ((m = REGION.exec(html))) {
    const tag = m[1].toLowerCase();
    const openEnd = m.index + m[0].length;
    if (/\/\s*>$/.test(m[0])) throw new Error(`rcube-html: region "${m[4]}" is written <${tag} … />; write <${tag} …></${tag}>`);
    // the matching end tag: count the same tag opening and closing after it
    const any = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
    any.lastIndex = openEnd;
    let depth = 1;
    let t;
    while ((t = any.exec(html))) {
      if (t[1]) depth -= 1;
      else if (!/\/\s*>$/.test(t[0])) depth += 1;
      if (depth === 0) break;
    }
    if (!t) throw new Error(`rcube-html: region "${m[4]}" (<${tag}>) has no end tag`);
    found.push({ name: m[4], tag, start: m.index, openEnd, closeStart: t.index, end: t.index + t[0].length, openTag: m[0] });
    REGION.lastIndex = t.index + t[0].length;
  }
  return found;
};

/** An opening tag with an attribute set (value null: removed) */
export const setAttribute = (openTag, name, value) => {
  const without = openTag.replace(new RegExp(`\\s${name}(\\s*=\\s*(["'])[^"']*\\2)?(?=[\\s/>])`, "g"), "");
  if (value == null) return without;
  const v = String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return without.replace(/\s*(\/?)>$/, ` ${name}="${v}"$1>`);
};

/**
 * The page with each region's content replaced: fill(region) -> { html, attributes } or null (left as it is).
 * attributes: set on the region's element ({ "data-rcube-rendered": "server" }; null removes one).
 */
export const replaceRegions = (html, fill) => {
  let out = "";
  let at = 0;
  for (const region of findRegions(html)) {
    const next = fill(region, html.slice(region.openEnd, region.closeStart));
    if (!next) continue;
    let open = region.openTag;
    Object.entries(next.attributes || {}).forEach(([name, value]) => {
      open = setAttribute(open, name, value);
    });
    out += html.slice(at, region.start) + open + next.html + html.slice(region.closeStart, region.end);
    at = region.end;
  }
  return out + html.slice(at);
};
