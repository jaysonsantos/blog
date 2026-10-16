import { type CollectionEntry, getCollection } from "astro:content";

export type Post = CollectionEntry<"posts">;

/** Published posts, newest first. Drafts show only in `astro dev`. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection("posts", (post) => import.meta.env.DEV || !post.data.draft);
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** Every tag with its posts, sorted by tag name. */
export function groupByTag(posts: readonly Post[]): Map<string, Post[]> {
  const byTag = new Map<string, Post[]>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      byTag.set(tag, [...(byTag.get(tag) ?? []), post]);
    }
  }
  return new Map([...byTag].sort(([a], [b]) => a.localeCompare(b)));
}
