import type { Rule } from "../../shared/types";
import { generatedRules } from "./builtin-rules/index";

/** GitHub: translate prose surfaces while leaving repository trees, code, and diffs intact. */
const github: Rule = {
  id: "github",
  matches: ["*://github.com/*"],
  selectors: [
    ".js-comment-body",
    "[data-testid='issue-body']",
    "[data-testid='issue-comment-body']",
    "#readme .markdown-body",
  ],
  excludeSelectors: [
    "nav",
    ".AppHeader",
    ".UnderlineNav",
    "[data-testid='tree-view-container']",
    ".react-directory-filename-column",
    ".file-tree",
    ".blob-wrapper",
    ".highlight",
    "pre",
    "code",
    ".diff-table",
    ".js-diff-entry",
    "[data-testid='diff-view']",
  ],
  atomicBlockSelectors: [
    ".js-comment-body > p",
    "[data-testid='issue-body'] p",
    "[data-testid='issue-comment-body'] p",
    "#readme .markdown-body > p",
  ],
  mutationExcludeSelectors: [
    ".js-notification-shelf",
    "[role='tooltip']",
    "[role='menu']",
  ],
};

/** Twitter/X: tweet text is stable prose; trends, controls, media, and live regions are not. */
const twitter: Rule = {
  id: "twitter",
  matches: [
    "*://x.com/*",
    "*://*.x.com/*",
    "*://twitter.com/*",
    "*://*.twitter.com/*",
  ],
  selectors: ["[data-testid='tweetText']"],
  excludeSelectors: [
    "[data-testid='sidebarColumn']",
    "[data-testid='trend']",
    "[aria-label*='Trending']",
    "button",
    "[role='button']",
  ],
  atomicBlockSelectors: ["[data-testid='tweetText']"],
  mutationExcludeSelectors: [
    "[data-testid='videoPlayer']",
    "[data-testid='placementTracking']",
    "[aria-live='polite']",
    "[role='progressbar']",
  ],
  injectedCss: [
    "[data-testid='tweetText'] > .imt-target { display: block; margin-top: 0.35em; }",
  ],
};

/** Reddit: cover post and comment bodies in shreddit, current React, and old Reddit markup. */
const reddit: Rule = {
  id: "reddit",
  matches: ["*://reddit.com/*", "*://*.reddit.com/*"],
  selectors: [
    "shreddit-post [slot='text-body']",
    "shreddit-comment [slot='comment']",
    "[data-testid='post-container'] [data-click-id='text']",
    "[data-testid='comment'] .RichTextJSON-root",
    ".Post .RichTextJSON-root",
    ".Comment .RichTextJSON-root",
    ".thing.link .usertext-body .md",
    ".thing.comment .usertext-body .md",
  ],
  excludeSelectors: [
    ".vote-arrows",
    "[data-click-id='upvote']",
    "[data-click-id='downvote']",
    "[data-testid='post-comment-header']",
    "[data-testid='comment-submission-form']",
    "[aria-label*='Award']",
    "[role='menu']",
    "pre",
    "code",
  ],
  atomicBlockSelectors: [
    "shreddit-post [slot='text-body'] > p",
    "shreddit-comment [slot='comment'] > p",
    ".RichTextJSON-root > p",
    ".usertext-body .md > p",
  ],
  mutationExcludeSelectors: [
    "[data-testid='comment-submission-form']",
    "shreddit-composer",
    "[role='dialog']",
    "video",
  ],
};

/** YouTube: translate watch metadata, descriptions, comments, and recommendation titles, never the player. */
const youtube: Rule = {
  id: "youtube",
  matches: ["*://youtube.com/*", "*://*.youtube.com/*"],
  selectors: [
    "ytd-watch-metadata h1 yt-formatted-string",
    "#description-inline-expander",
    "ytd-comment-thread-renderer #content-text",
    "ytd-comment-view-model #content-text",
    "ytd-compact-video-renderer #video-title",
    "ytd-rich-item-renderer #video-title-link",
  ],
  excludeSelectors: [
    "#movie_player",
    ".html5-video-player",
    ".ytp-chrome-bottom",
    ".ytp-popup",
    "button",
    "[role='button']",
  ],
  atomicBlockSelectors: [
    "#description-inline-expander > yt-attributed-string",
    "ytd-comment-thread-renderer #content-text",
    "ytd-comment-view-model #content-text",
    "#video-title",
    "#video-title-link",
  ],
  mutationExcludeSelectors: [
    "#movie_player",
    "ytd-live-chat-frame",
    "#masthead",
    "tp-yt-paper-toast",
  ],
};

/** Hacker News: titles and comments are the prose-bearing elements; code remains original. */
const hackerNews: Rule = {
  id: "hacker-news",
  matches: ["*://news.ycombinator.com/*"],
  selectors: [".comment", ".titleline"],
  excludeSelectors: ["pre", "code"],
  atomicBlockSelectors: [".comment", ".titleline"],
};

/** Stack Overflow: include question, answer, and comment prose while preserving all code samples. */
const stackOverflow: Rule = {
  id: "stackoverflow",
  matches: ["*://stackoverflow.com/*", "*://*.stackoverflow.com/*"],
  selectors: [
    ".question .js-post-body",
    ".answer .js-post-body",
    ".question .s-prose",
    ".answer .s-prose",
    ".comment-copy",
  ],
  excludeSelectors: [
    "pre",
    "code",
    ".s-code-block",
    ".snippet",
    ".hljs",
    ".post-menu",
  ],
  atomicBlockSelectors: [".js-post-body > p", ".s-prose > p", ".comment-copy"],
  mutationExcludeSelectors: [".js-post-menu", ".s-toast", "[role='dialog']"],
};

/** Wikipedia: focus on article prose and omit navigation tables, citations, and edit controls. */
const wikipedia: Rule = {
  id: "wikipedia",
  matches: ["*://*.wikipedia.org/*"],
  selectors: ["#mw-content-text"],
  excludeSelectors: [
    ".infobox",
    ".navbox",
    ".vertical-navbox",
    ".sidebar",
    ".metadata",
    ".ambox",
    ".mw-references-wrap",
    ".references",
    ".reflist",
    ".mw-editsection",
    ".mw-jump-link",
    "sup.reference",
    "[role='navigation']",
    ".toc",
    ".vector-page-toolbar",
  ],
  atomicBlockSelectors: [
    ".mw-parser-output > p",
    ".mw-parser-output > section > p",
  ],
  mutationExcludeSelectors: [".mw-portlet", ".vector-sticky-header"],
};

/** arXiv: translate abstract text and descriptive fields on result listings, not formulae. */
const arxiv: Rule = {
  id: "arxiv",
  matches: ["*://arxiv.org/*", "*://*.arxiv.org/*"],
  selectors: [
    "blockquote.abstract",
    ".abstract.mathjax",
    ".list-title",
    ".list-authors",
    ".list-comments",
    ".list-journal-ref",
    ".list-subjects",
  ],
  excludeSelectors: [".MathJax", "math", "pre", "code", "nav"],
  atomicBlockSelectors: [
    "blockquote.abstract",
    ".list-title",
    ".list-authors",
    ".list-comments",
    ".list-journal-ref",
    ".list-subjects",
  ],
};

/** Medium: the article is the only translation surface; navigation and controls stay untouched. */
const medium: Rule = {
  id: "medium",
  matches: ["*://medium.com/*", "*://*.medium.com/*"],
  selectors: ["article"],
  excludeSelectors: [
    "nav",
    "aside",
    "button",
    "[role='button']",
    "pre",
    "code",
  ],
  atomicBlockSelectors: [
    "article > h1",
    "article > h2",
    "article section p",
    "article blockquote",
    "article figcaption",
  ],
  mutationExcludeSelectors: ["[role='dialog']", "[aria-live]"],
};

/** Google Search: translate organic result titles and snippets, excluding ads, questions, and inputs. */
const googleSearch: Rule = {
  id: "google-search",
  matches: ["*://google.*/search*", "*://www.google.*/search*"],
  selectors: [
    "#search h3",
    "#search .VwiC3b",
    "#search .IsZvec",
    "#search .aCOpRe",
    "#search .yXK7lf",
    "#search .kno-rdesc",
  ],
  excludeSelectors: [
    "#tads",
    "#bottomads",
    "[data-text-ad]",
    ".related-question-pair",
    "g-accordion-expander",
    "form",
    "input",
    "textarea",
  ],
  atomicBlockSelectors: [
    "#search h3",
    "#search .VwiC3b",
    "#search .IsZvec",
    "#search .aCOpRe",
    "#search .yXK7lf",
  ],
  mutationExcludeSelectors: ["#searchform", ".UUbT9", "[role='dialog']"],
};

export const builtinRules: readonly Rule[] = [
  ...generatedRules,
  github,
  twitter,
  reddit,
  youtube,
  hackerNews,
  stackOverflow,
  wikipedia,
  arxiv,
  medium,
  googleSearch,
];
