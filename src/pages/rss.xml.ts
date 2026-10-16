import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { SITE_DESCRIPTION, SITE_LANG, SITE_TITLE } from "../consts.ts";
import { postPath } from "../lib/paths.ts";
import { getPosts } from "../lib/posts.ts";

export const GET: APIRoute = async (context) => {
  const posts = await getPosts();
  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site ?? context.url.origin,
    customData: `<language>${SITE_LANG}</language>`,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      categories: post.data.tags,
      link: postPath(post.id),
    })),
  });
};
