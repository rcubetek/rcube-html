// Types for rcube-html/server
import type { FormOptions } from "./element";

/** JSON that is safe inside a <script> element */
export declare function jsonForScript(value: unknown): string;
/** The options as the JSON <rcube-form> reads: <script type="application/json" data-rcube="config">…</script> */
export declare function formConfigScript(options: Omit<FormOptions, "actions">): string;
/** The <rcube-form> element as HTML: its JSON and (prerender, the default) the form drawn on the server */
export declare function renderFormHtml(
  options: Omit<FormOptions, "actions">,
  settings?: { tag?: string; attributes?: Record<string, string | number | boolean | null | undefined>; prerender?: boolean; hydrate?: boolean },
): string;

/** A schema drawn as plain HTML (nothing for the browser to take over) */
export declare function renderSchemaHtml(schema: unknown[], options?: Omit<FormOptions, "actions" | "schema">): string;

/** How a region is drawn: ahead of time and taken over, ahead of time as plain HTML, or in the browser only */
export type RenderMode = "server" | "static" | "client";
/** A render mode, or one chosen by what the build knows: { default, <env>: mode } or { when: { env, lang, page }, then, else } */
export type RenderSetting =
  | RenderMode
  | { default?: RenderSetting; [env: string]: RenderSetting | undefined }
  | { when: Partial<Record<"env" | "lang" | "page", string | string[]>>; then?: RenderSetting; else?: RenderSetting };
/** What the build knows about a page */
export interface PageFacts { page?: string; env?: string; lang?: string; year?: string | number }
export interface SiteRegion { render?: RenderSetting; schema: unknown[]; placeholder?: unknown[]; noscript?: string; values?: Record<string, unknown> }
export interface SiteSettings {
  render?: RenderSetting; regions?: Record<string, SiteRegion | unknown[]>; header?: unknown[]; footer?: unknown[];
  noscript?: string; themeKey?: string; fallbackHtml?: string; env?: string;
}
export interface PageSettings {
  render?: RenderSetting; regions?: Record<string, SiteRegion | unknown[]>; schema?: unknown[];
  values?: Record<string, unknown>; fromUrl?: Record<string, true | Record<string, string>>;
}
/** A page with its regions (<div data-rcube-region="…">) drawn as their render modes say */
export declare function renderPage(
  html: string,
  settings?: { site?: SiteSettings; page?: PageSettings; facts?: PageFacts; mode?: "auto" | RenderMode },
): { html: string; regions: { name: string; render: RenderMode }[] };
export declare function resolveRender(setting: RenderSetting | null | undefined, facts?: PageFacts, fallback?: RenderMode): RenderMode;
export declare function siteRegions(site?: SiteSettings, page?: PageSettings): Record<string, SiteRegion>;
export declare function prepareSchema(schema: unknown[], facts?: PageFacts): unknown[];
export declare function valuesFromUrl(map: PageSettings["fromUrl"], search?: string): Record<string, string>;
export declare function pageFile(path?: string): string;
export declare function findRegions(html: string): { name: string; tag: string; start: number; end: number }[];
