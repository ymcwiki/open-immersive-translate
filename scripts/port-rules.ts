import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { format } from "prettier";

import type { Rule } from "../src/shared/types";

type Category =
  | "academic"
  | "ai-productivity"
  | "commerce"
  | "developer"
  | "news"
  | "search"
  | "social"
  | "video";

interface CuratedSite {
  id: string;
  category: Category;
  matches: string[];
  referenceIds?: string[];
}

interface ReferenceRule extends Record<string, unknown> {
  id?: unknown;
  matches?: unknown;
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, "..");
const defaultReferencePath =
  "~/Library/Application Support/Google/Chrome/<Profile>/Extensions/bpoadfkcbjbfhfodiogcnhhhpibjhbnh/1.32.7_0/default_config.json";
const defaultOutputDirectory = join(
  projectRoot,
  "src/background/rules/builtin-rules",
);

function patterns(...hosts: string[]): string[] {
  return hosts.map((host) =>
    host.includes("://")
      ? host
      : host.includes("/")
        ? `*://${host}`
        : `*://${host}/*`,
  );
}

/** High-traffic sites kept from the reference rule corpus. */
export const CURATED_SITES: readonly CuratedSite[] = [
  // Search
  {
    id: "google",
    category: "search",
    matches: patterns("*.google.*"),
    referenceIds: ["googleIndex", "otherGoogle"],
  },
  { id: "bing", category: "search", matches: patterns("*.bing.com") },
  {
    id: "duckduckgo",
    category: "search",
    matches: patterns("duckduckgo.com", "*.duckduckgo.com"),
  },
  {
    id: "google-scholar",
    category: "search",
    matches: patterns("scholar.google.*"),
    referenceIds: ["googleScholar"],
  },
  {
    id: "brave-search",
    category: "search",
    matches: patterns("search.brave.com"),
  },
  {
    id: "you-search",
    category: "search",
    matches: patterns("you.com/search*"),
    referenceIds: ["autoHeight"],
  },
  { id: "kagi", category: "search", matches: patterns("kagi.com") },
  { id: "baidu", category: "search", matches: patterns("www.baidu.com") },

  // Developer and documentation
  {
    id: "github",
    category: "developer",
    matches: patterns("github.com", "*.github.com"),
  },
  {
    id: "github-blog",
    category: "developer",
    matches: patterns("github.blog"),
    referenceIds: ["github-blog"],
  },
  {
    id: "stackoverflow",
    category: "developer",
    matches: patterns("stackoverflow.com", "*.stackoverflow.com"),
    referenceIds: ["stackoverflow"],
  },
  {
    id: "stackexchange",
    category: "developer",
    matches: patterns(
      "*.stackexchange.com",
      "superuser.com",
      "askubuntu.com",
      "serverfault.com",
    ),
    referenceIds: ["stackoverflow"],
  },
  {
    id: "hacker-news",
    category: "developer",
    matches: patterns("news.ycombinator.com"),
  },
  {
    id: "mdn",
    category: "developer",
    matches: patterns("developer.mozilla.org"),
  },
  {
    id: "python-docs",
    category: "developer",
    matches: patterns("docs.python.org"),
  },
  {
    id: "npm",
    category: "developer",
    matches: patterns("www.npmjs.com", "npmjs.com"),
  },
  { id: "pypi", category: "developer", matches: patterns("pypi.org") },
  {
    id: "huggingface",
    category: "developer",
    matches: patterns("huggingface.co"),
  },
  {
    id: "openai-docs",
    category: "developer",
    matches: patterns("platform.openai.com/docs*"),
    referenceIds: ["urlChangeDelay"],
  },
  {
    id: "anthropic-docs",
    category: "developer",
    matches: patterns("docs.anthropic.com"),
  },
  {
    id: "android-developers",
    category: "developer",
    matches: patterns("developer.android.com", "developer.android.google.cn"),
    referenceIds: ["android"],
  },
  {
    id: "microsoft-learn",
    category: "developer",
    matches: patterns("learn.microsoft.com"),
    referenceIds: ["masterclass"],
  },
  {
    id: "epic-developers",
    category: "developer",
    matches: patterns("dev.epicgames.com"),
    referenceIds: ["devEpicGames"],
  },
  {
    id: "freecodecamp",
    category: "developer",
    matches: patterns("www.freecodecamp.org"),
    referenceIds: ["freecodecamp"],
  },
  {
    id: "git-scm",
    category: "developer",
    matches: patterns("git-scm.com"),
    referenceIds: ["remove_em"],
  },
  {
    id: "vercel",
    category: "developer",
    matches: patterns("vercel.com", "*.vercel.com"),
    referenceIds: ["vercel"],
  },
  {
    id: "tanstack",
    category: "developer",
    matches: patterns("tanstack.com", "*.tanstack.com"),
    referenceIds: ["tanstack"],
  },
  {
    id: "radix-ui",
    category: "developer",
    matches: patterns("www.radix-ui.com"),
    referenceIds: ["radix-ui"],
  },
  {
    id: "stripe-docs",
    category: "developer",
    matches: patterns("docs.stripe.com"),
    referenceIds: ["floatSites"],
  },
  {
    id: "cloudflare-docs",
    category: "developer",
    matches: patterns("developers.cloudflare.com"),
  },
  {
    id: "aws-docs",
    category: "developer",
    matches: patterns("docs.aws.amazon.com"),
  },
  {
    id: "azure-docs",
    category: "developer",
    matches: patterns("learn.microsoft.com/azure/*"),
  },
  {
    id: "kubernetes-docs",
    category: "developer",
    matches: patterns("kubernetes.io/docs/*"),
  },
  {
    id: "docker-docs",
    category: "developer",
    matches: patterns("docs.docker.com"),
  },
  {
    id: "rust-docs",
    category: "developer",
    matches: patterns("doc.rust-lang.org"),
  },
  {
    id: "go-docs",
    category: "developer",
    matches: patterns("go.dev/doc*", "pkg.go.dev"),
  },
  { id: "react-docs", category: "developer", matches: patterns("react.dev") },
  {
    id: "vue-docs",
    category: "developer",
    matches: patterns("vuejs.org", "*.vuejs.org"),
  },
  { id: "svelte-docs", category: "developer", matches: patterns("svelte.dev") },
  {
    id: "nextjs-docs",
    category: "developer",
    matches: patterns("nextjs.org/docs*", "nextjs.org/learn*"),
  },
  {
    id: "vite-docs",
    category: "developer",
    matches: patterns("vite.dev", "vitejs.dev"),
  },
  {
    id: "node-docs",
    category: "developer",
    matches: patterns("nodejs.org/docs*", "nodejs.org/api/*"),
  },

  // Social and forums
  {
    id: "twitter",
    category: "social",
    matches: patterns("twitter.com", "*.twitter.com", "x.com", "*.x.com"),
    referenceIds: ["twitter"],
  },
  {
    id: "reddit",
    category: "social",
    matches: patterns("reddit.com", "*.reddit.com"),
    referenceIds: ["redditList", "oldReddit"],
  },
  {
    id: "quora",
    category: "social",
    matches: patterns("quora.com", "*.quora.com"),
    referenceIds: ["quora"],
  },
  {
    id: "discord",
    category: "social",
    matches: patterns("discord.com", "*.discord.com"),
  },
  {
    id: "slack",
    category: "social",
    matches: patterns("app.slack.com", "*.slack.com"),
  },
  {
    id: "telegram-web",
    category: "social",
    matches: patterns("web.telegram.org"),
    referenceIds: ["telegram"],
  },
  {
    id: "linkedin",
    category: "social",
    matches: patterns("www.linkedin.com", "linkedin.com"),
  },
  {
    id: "facebook",
    category: "social",
    matches: patterns("www.facebook.com", "facebook.com"),
  },
  {
    id: "instagram",
    category: "social",
    matches: patterns("www.instagram.com", "instagram.com"),
    referenceIds: ["instagramPost", "instagramMessage"],
  },
  {
    id: "threads",
    category: "social",
    matches: patterns("www.threads.net", "www.threads.com"),
    referenceIds: ["threads"],
  },
  {
    id: "mastodon",
    category: "social",
    matches: patterns("mastodon.social", "mastodon.online", "mastodon.world"),
    referenceIds: ["mastodon"],
  },
  { id: "bluesky", category: "social", matches: patterns("bsky.app") },
  {
    id: "v2ex",
    category: "social",
    matches: patterns("www.v2ex.com", "v2ex.com"),
  },
  {
    id: "zhihu",
    category: "social",
    matches: patterns("www.zhihu.com", "zhihu.com"),
  },
  { id: "juejin", category: "social", matches: patterns("juejin.cn") },
  {
    id: "csdn",
    category: "social",
    matches: patterns("blog.csdn.net", "www.csdn.net"),
  },
  {
    id: "weibo",
    category: "social",
    matches: patterns("weibo.com", "*.weibo.com"),
    referenceIds: ["weibo"],
  },
  {
    id: "xiaohongshu",
    category: "social",
    matches: patterns("www.xiaohongshu.com"),
    referenceIds: ["xiaohongshu.com"],
  },
  {
    id: "douban",
    category: "social",
    matches: patterns("www.douban.com", "*.douban.com"),
  },
  {
    id: "tumblr",
    category: "social",
    matches: patterns("www.tumblr.com", "*.tumblr.com"),
    referenceIds: ["tumblr"],
  },

  // News and publishing
  {
    id: "medium",
    category: "news",
    matches: patterns("medium.com", "*.medium.com"),
    referenceIds: ["medium"],
  },
  {
    id: "substack",
    category: "news",
    matches: patterns("*.substack.com"),
    referenceIds: ["substack"],
  },
  {
    id: "nytimes",
    category: "news",
    matches: patterns("www.nytimes.com", "nytimes.com"),
  },
  {
    id: "bbc",
    category: "news",
    matches: patterns("*.bbc.com", "*.bbc.co.uk"),
    referenceIds: ["bbc"],
  },
  {
    id: "guardian",
    category: "news",
    matches: patterns("www.theguardian.com", "theguardian.com"),
  },
  {
    id: "reuters",
    category: "news",
    matches: patterns("www.reuters.com", "reuters.com"),
  },
  {
    id: "bloomberg",
    category: "news",
    matches: patterns("www.bloomberg.com", "bloomberg.com"),
  },
  {
    id: "economist",
    category: "news",
    matches: patterns("www.economist.com", "economist.com"),
  },
  { id: "techcrunch", category: "news", matches: patterns("techcrunch.com") },
  {
    id: "the-verge",
    category: "news",
    matches: patterns("www.theverge.com", "theverge.com"),
  },
  {
    id: "wired",
    category: "news",
    matches: patterns("www.wired.com", "wired.com"),
  },
  {
    id: "ars-technica",
    category: "news",
    matches: patterns("arstechnica.com"),
  },
  {
    id: "ap-news",
    category: "news",
    matches: patterns("apnews.com"),
    referenceIds: ["apnews"],
  },
  {
    id: "the-atlantic",
    category: "news",
    matches: patterns("www.theatlantic.com"),
    referenceIds: ["theatlantic"],
  },
  {
    id: "wsj",
    category: "news",
    matches: patterns("www.wsj.com", "cn.wsj.com"),
    referenceIds: ["wsj"],
  },
  {
    id: "washington-post",
    category: "news",
    matches: patterns("www.washingtonpost.com"),
  },
  { id: "forbes", category: "news", matches: patterns("www.forbes.com") },
  { id: "time", category: "news", matches: patterns("time.com") },
  { id: "cnet", category: "news", matches: patterns("www.cnet.com") },
  { id: "nikkei", category: "news", matches: patterns("www.nikkei.com") },
  {
    id: "coindesk",
    category: "news",
    matches: patterns("www.coindesk.com"),
    referenceIds: ["coindesk"],
  },
  {
    id: "seeking-alpha",
    category: "news",
    matches: patterns("seekingalpha.com"),
    referenceIds: ["seekingalpha"],
  },

  // Academic
  {
    id: "wikipedia",
    category: "academic",
    matches: patterns("*.wikipedia.org"),
  },
  {
    id: "arxiv",
    category: "academic",
    matches: patterns("arxiv.org", "*.arxiv.org"),
    referenceIds: ["arxiv", "finalCommon.pdfWebPage"],
  },
  {
    id: "nature",
    category: "academic",
    matches: patterns("www.nature.com", "nature.com"),
  },
  {
    id: "science",
    category: "academic",
    matches: patterns("www.science.org", "science.org"),
  },
  {
    id: "pubmed",
    category: "academic",
    matches: patterns("pubmed.ncbi.nlm.nih.gov", "*.ncbi.nlm.nih.gov"),
    referenceIds: ["pubmed"],
  },
  {
    id: "science-direct",
    category: "academic",
    matches: patterns("www.sciencedirect.com", "sciencedirect.com"),
  },
  {
    id: "springer",
    category: "academic",
    matches: patterns("link.springer.com", "*.springer.com"),
  },
  {
    id: "ieee",
    category: "academic",
    matches: patterns("ieeexplore.ieee.org"),
  },
  { id: "acm", category: "academic", matches: patterns("dl.acm.org") },
  {
    id: "semantic-scholar",
    category: "academic",
    matches: patterns("www.semanticscholar.org", "semanticscholar.org"),
  },
  {
    id: "web-of-science",
    category: "academic",
    matches: patterns("www.webofscience.com", "webofscience.clarivate.com"),
    referenceIds: ["webofscience"],
  },
  {
    id: "jmir",
    category: "academic",
    matches: patterns("*.jmir.org"),
    referenceIds: ["jmir"],
  },
  {
    id: "wiley",
    category: "academic",
    matches: patterns("onlinelibrary.wiley.com"),
    referenceIds: ["finalCommon.pdfWebPage"],
  },
  {
    id: "researchgate",
    category: "academic",
    matches: patterns("www.researchgate.net"),
  },
  {
    id: "academia",
    category: "academic",
    matches: patterns("www.academia.edu"),
  },
  {
    id: "connected-papers",
    category: "academic",
    matches: patterns("www.connectedpapers.com"),
  },
  { id: "x-mol", category: "academic", matches: patterns("www.x-mol.com") },
  {
    id: "rfc-editor",
    category: "academic",
    matches: patterns("www.rfc-editor.org"),
    referenceIds: ["rfcEditor"],
  },

  // Commerce
  {
    id: "amazon",
    category: "commerce",
    matches: patterns(
      "www.amazon.com",
      "*.amazon.com",
      "*.amazon.co.uk",
      "*.amazon.co.jp",
    ),
  },
  {
    id: "ebay",
    category: "commerce",
    matches: patterns("www.ebay.com", "*.ebay.com"),
  },
  {
    id: "aliexpress",
    category: "commerce",
    matches: patterns("www.aliexpress.com", "*.aliexpress.com"),
  },
  {
    id: "shopee",
    category: "commerce",
    matches: patterns("shopee.*", "*.shopee.*"),
    referenceIds: ["shopee"],
  },
  {
    id: "steam",
    category: "commerce",
    matches: patterns("store.steampowered.com", "steamcommunity.com"),
  },
  {
    id: "epic-games",
    category: "commerce",
    matches: patterns("store.epicgames.com", "www.epicgames.com"),
  },
  {
    id: "fiverr",
    category: "commerce",
    matches: patterns("www.fiverr.com", "*.fiverr.com"),
  },
  {
    id: "tripadvisor",
    category: "commerce",
    matches: patterns("www.tripadvisor.com", "*.tripadvisor.com"),
  },

  // Video and learning
  {
    id: "youtube",
    category: "video",
    matches: patterns("youtube.com", "*.youtube.com"),
    referenceIds: ["youtubeMobile", "youtube-subtitle"],
  },
  {
    id: "bilibili",
    category: "video",
    matches: patterns("www.bilibili.com", "*.bilibili.com"),
  },
  {
    id: "pixiv",
    category: "video",
    matches: patterns("www.pixiv.net"),
    referenceIds: ["pixiv"],
  },
  {
    id: "imdb",
    category: "video",
    matches: patterns("www.imdb.com", "m.imdb.com"),
    referenceIds: ["imdb"],
  },
  {
    id: "netflix",
    category: "video",
    matches: patterns("www.netflix.com/browse*", "www.netflix.com/title*"),
    referenceIds: ["netflix"],
  },
  {
    id: "prime-video",
    category: "video",
    matches: patterns("www.primevideo.com", "*.amazon.com/*video*"),
    referenceIds: ["primevideo"],
  },
  {
    id: "coursera",
    category: "video",
    matches: patterns("www.coursera.org", "*.coursera.org"),
  },
  {
    id: "udemy",
    category: "video",
    matches: patterns("*.udemy.com"),
    referenceIds: ["udemy"],
  },
  {
    id: "edx",
    category: "video",
    matches: patterns("*.edx.org"),
    referenceIds: ["edx"],
  },
  {
    id: "khan-academy",
    category: "video",
    matches: patterns("*.khanacademy.org"),
    referenceIds: ["khanacademy"],
  },
  {
    id: "ted",
    category: "video",
    matches: patterns("www.ted.com"),
    referenceIds: ["ted"],
  },
  {
    id: "vimeo",
    category: "video",
    matches: patterns("vimeo.com", "*.vimeo.com"),
    referenceIds: ["vimeo", "player.vimeo"],
  },
  {
    id: "dailymotion",
    category: "video",
    matches: patterns("*.dailymotion.com"),
    referenceIds: ["dailymotion"],
  },
  {
    id: "disney-plus",
    category: "video",
    matches: patterns("www.disneyplus.com"),
    referenceIds: ["disneyplus"],
  },
  {
    id: "hulu",
    category: "video",
    matches: patterns("*.hulu.com"),
    referenceIds: ["hulu"],
  },
  {
    id: "max",
    category: "video",
    matches: patterns("play.max.com", "play.hbomax.com"),
    referenceIds: ["hbomax"],
  },

  // AI and productivity
  {
    id: "gmail",
    category: "ai-productivity",
    matches: patterns("mail.google.com"),
  },
  {
    id: "outlook",
    category: "ai-productivity",
    matches: patterns("outlook.live.com", "outlook.office.com"),
  },
  {
    id: "notion",
    category: "ai-productivity",
    matches: patterns("www.notion.so", "*.notion.site"),
    referenceIds: ["notionSite"],
  },
  {
    id: "figma",
    category: "ai-productivity",
    matches: patterns("www.figma.com", "help.figma.com"),
  },
  {
    id: "chatgpt",
    category: "ai-productivity",
    matches: patterns("chatgpt.com", "chat.openai.com"),
    referenceIds: ["chatOpenai"],
  },
  { id: "claude", category: "ai-productivity", matches: patterns("claude.ai") },
  {
    id: "gemini",
    category: "ai-productivity",
    matches: patterns("gemini.google.com"),
  },
  {
    id: "perplexity",
    category: "ai-productivity",
    matches: patterns("www.perplexity.ai", "perplexity.ai"),
  },
  {
    id: "phind",
    category: "ai-productivity",
    matches: patterns("www.phind.com", "phind.com"),
  },
  {
    id: "poe",
    category: "ai-productivity",
    matches: patterns("poe.com"),
    referenceIds: ["poe"],
  },
  {
    id: "microsoft-teams",
    category: "ai-productivity",
    matches: patterns("teams.microsoft.com", "teams.live.com"),
    referenceIds: ["team"],
  },
  {
    id: "google-meet",
    category: "ai-productivity",
    matches: patterns("meet.google.com"),
    referenceIds: ["googleMeet"],
  },
  {
    id: "zoom",
    category: "ai-productivity",
    matches: patterns("*.zoom.us"),
    referenceIds: ["zoom"],
  },
  {
    id: "feishu-lark",
    category: "ai-productivity",
    matches: patterns("*.feishu.cn", "*.larksuite.com", "*.larkoffice.com"),
    referenceIds: ["feishu"],
  },
  {
    id: "jira",
    category: "ai-productivity",
    matches: patterns("*.atlassian.net", "jira.*.com"),
    referenceIds: ["jira"],
  },
  {
    id: "confluence",
    category: "ai-productivity",
    matches: patterns("*.atlassian.net/wiki/*"),
  },
  {
    id: "element",
    category: "ai-productivity",
    matches: patterns("app.element.io"),
    referenceIds: ["app.element.io"],
  },
  {
    id: "inoreader",
    category: "ai-productivity",
    matches: patterns("www.inoreader.com", "*.inoreader.com"),
    referenceIds: ["inoreader"],
  },
] as const;

const arrayFields = new Set<keyof Rule>([
  "matches",
  "excludeMatches",
  "selectorMatches",
  "selectors",
  "excludeSelectors",
  "additionalExcludeSelectors",
  "stayOriginalSelectors",
  "additionalStayOriginalSelectors",
  "atomicBlockSelectors",
  "additionalAtomicBlockSelectors",
  "extraInlineSelectors",
  "additionalExtraInlineSelectors",
  "extraBlockSelectors",
  "additionalExtraBlockSelectors",
  "shadowRootSelectors",
  "additionalShadowRootSelectors",
  "mutationExcludeSelectors",
  "additionalMutationExcludeSelectors",
  "injectedCss",
  "additionalInjectedCss",
  "excludeTags",
  "stayOriginalTags",
  "inlineTags",
  "allBlockTags",
]);

const scalarFields = new Set<keyof Rule>([
  "isTranslateTitle",
  "paragraphMinTextCount",
  "blockMinTextCount",
  "lineBreakMaxTextCount",
  "targetWrapperTag",
  "wrapperPrefix",
  "wrapperSuffix",
  "sameLangCheck",
  "enableRichTranslate",
  "translationMode",
  "theme",
  "service",
  "autoTranslate",
]);

const additionalFieldByBase: Partial<Record<keyof Rule, keyof Rule>> = {
  excludeSelectors: "additionalExcludeSelectors",
  additionalExcludeSelectors: "additionalExcludeSelectors",
  stayOriginalSelectors: "additionalStayOriginalSelectors",
  additionalStayOriginalSelectors: "additionalStayOriginalSelectors",
  atomicBlockSelectors: "additionalAtomicBlockSelectors",
  additionalAtomicBlockSelectors: "additionalAtomicBlockSelectors",
  extraInlineSelectors: "additionalExtraInlineSelectors",
  additionalExtraInlineSelectors: "additionalExtraInlineSelectors",
  extraBlockSelectors: "additionalExtraBlockSelectors",
  additionalExtraBlockSelectors: "additionalExtraBlockSelectors",
  shadowRootSelectors: "additionalShadowRootSelectors",
  additionalShadowRootSelectors: "additionalShadowRootSelectors",
  mutationExcludeSelectors: "additionalMutationExcludeSelectors",
  additionalMutationExcludeSelectors: "additionalMutationExcludeSelectors",
  injectedCss: "additionalInjectedCss",
  additionalInjectedCss: "additionalInjectedCss",
};

function stringArray(value: unknown): string[] | undefined {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];
  const cleaned = values.filter(
    (item): item is string => typeof item === "string",
  );
  return cleaned.length ? cleaned : undefined;
}

function operation(rawKey: string):
  | {
      base: string;
      kind: "add" | "remove";
    }
  | undefined {
  const match = /^(.*)\.(add|remove)(?:[._].*)?$/.exec(rawKey);
  return match?.[1] && match[2]
    ? { base: match[1], kind: match[2] as "add" | "remove" }
    : undefined;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function appendStrings(
  target: Record<string, unknown>,
  key: keyof Rule,
  values: readonly string[],
): void {
  const existing = stringArray(target[key]) ?? [];
  target[key] = unique([...existing, ...values]);
}

function removeStrings(
  target: Record<string, unknown>,
  keys: readonly (keyof Rule)[],
  values: readonly string[],
): void {
  const removals = new Set(values);
  for (const key of keys) {
    const existing = stringArray(target[key]);
    if (existing)
      target[key] = existing.filter((value) => !removals.has(value));
  }
}

/** Map one reference rule onto the deliberately smaller local Rule contract. */
export function mapReferenceRule(reference: ReferenceRule): Partial<Rule> {
  const mapped: Record<string, unknown> = {};

  for (const [rawKey, value] of Object.entries(reference)) {
    const key = rawKey === "translationTheme" ? "theme" : rawKey;
    if (arrayFields.has(key as keyof Rule)) {
      const values = stringArray(value);
      if (values) mapped[key] = unique(values);
      continue;
    }
    if (scalarFields.has(key as keyof Rule)) mapped[key] = value;
  }

  for (const [rawKey, value] of Object.entries(reference)) {
    const parsed = operation(rawKey);
    if (!parsed) continue;
    const base = parsed.base === "translationTheme" ? "theme" : parsed.base;
    if (!arrayFields.has(base as keyof Rule)) continue;
    const values = stringArray(value);
    if (!values) continue;

    const baseKey = base as keyof Rule;
    const additionalKey = additionalFieldByBase[baseKey];
    if (parsed.kind === "add") {
      appendStrings(mapped, additionalKey ?? baseKey, values);
    } else {
      removeStrings(
        mapped,
        additionalKey ? [baseKey, additionalKey] : [baseKey],
        values,
      );
    }
  }

  return mapped as Partial<Rule>;
}

function mergeMappedRules(rules: readonly Partial<Rule>[]): Partial<Rule> {
  const merged: Record<string, unknown> = {};
  for (const rule of rules) {
    for (const [key, value] of Object.entries(rule)) {
      if (key.startsWith("additional") && Array.isArray(value)) {
        appendStrings(merged, key as keyof Rule, value as string[]);
      } else if (value !== undefined) {
        merged[key] = Array.isArray(value) ? [...value] : value;
      }
    }
  }
  return merged as Partial<Rule>;
}

/** Select curated reference records and produce deterministic local rules. */
export function portRules(referenceRules: readonly ReferenceRule[]): Rule[] {
  const byId = new Map<string, ReferenceRule>();
  for (const rule of referenceRules) {
    if (typeof rule.id === "string") byId.set(rule.id, rule);
  }

  return CURATED_SITES.map((site) => {
    const source = (site.referenceIds ?? [site.id])
      .map((id) => byId.get(id))
      .filter((rule): rule is ReferenceRule => rule !== undefined);
    const mapped = mergeMappedRules(source.map(mapReferenceRule));
    delete mapped.id;
    delete mapped.matches;
    return {
      ...mapped,
      id: `ported-${site.id}`,
      matches: [...site.matches],
    } as Rule;
  });
}

function renderCategory(category: Category, rules: readonly Rule[]): string {
  const name = `${category.replaceAll("-", "_")}Rules`;
  return [
    "// Generated by scripts/port-rules.ts from Immersive Translate 1.32.7.",
    "// Do not edit by hand; change the curated list or mapper and rerun the script.",
    'import type { Rule } from "../../../shared/types";',
    "",
    `export const ${name} = ${JSON.stringify(rules, null, 2)} as const satisfies readonly Rule[];`,
    "",
  ].join("\n");
}

function renderIndex(categories: readonly Category[]): string {
  const imports = categories.map((category) => {
    const name = `${category.replaceAll("-", "_")}Rules`;
    return `import { ${name} } from "./${category}";`;
  });
  const spreads = categories.map(
    (category) => `  ...${category.replaceAll("-", "_")}Rules,`,
  );
  return [
    "// Generated by scripts/port-rules.ts.",
    ...imports,
    "",
    "export const generatedRules = [",
    ...spreads,
    "] as const;",
    "",
  ].join("\n");
}

export async function generateRules(
  referencePath = defaultReferencePath,
  outputDirectory = defaultOutputDirectory,
): Promise<Rule[]> {
  const source = JSON.parse(await readFile(referencePath, "utf8")) as {
    rules?: unknown;
  };
  if (!Array.isArray(source.rules)) {
    throw new TypeError("Reference config must contain a rules array.");
  }

  const rules = portRules(source.rules as ReferenceRule[]);
  await mkdir(outputDirectory, { recursive: true });
  const categories = [
    ...new Set(CURATED_SITES.map((site) => site.category)),
  ].sort();
  await Promise.all(
    categories.map(async (category) =>
      writeFile(
        join(outputDirectory, `${category}.ts`),
        await format(
          renderCategory(
            category,
            rules.filter(
              (_, index) => CURATED_SITES[index]?.category === category,
            ),
          ),
          { parser: "typescript" },
        ),
      ),
    ),
  );
  await writeFile(
    join(outputDirectory, "index.ts"),
    await format(renderIndex(categories), { parser: "typescript" }),
  );
  return rules;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const rules = await generateRules(process.argv[2], process.argv[3]);
  process.stdout.write(`Generated ${rules.length} curated rules.\n`);
}
