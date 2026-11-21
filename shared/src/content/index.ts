import policies from './policies.json';

export interface DefaultPage { slug: string; title: string; seoTitle: string; seoDescription: string; updatedAt: string; body: string }

/**
 * The shop's policy pages, written in plain words: privacy, terms, refunds and returns, shipping and cookies.
 * The website shows these when a page has not been edited in Online store, Content. Paragraphs are separated by a blank line;
 * a line starting with "## " is a heading and lines starting with "- " make a list.
 */
export const DEFAULT_PAGES: DefaultPage[] = policies;
export const defaultPage = (slug: string): DefaultPage | undefined => DEFAULT_PAGES.find((p) => p.slug === slug);
