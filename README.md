# Blog

The source of [blog.jayson.com.br](https://blog.jayson.com.br). [Astro](https://astro.build) builds a static site. A Cloudflare Worker with static assets serves it.

## Run

1. Open the dev shell: `nix develop`. With direnv, put these two lines in `.envrc` and run `direnv allow`:

   ```sh
   dotenv_if_exists
   use flake
   ```

2. Install the packages: `pnpm install`
3. Start the dev server: `pnpm dev`

## Write a post

1. Add a file to `src/content/posts/`. The file name is the URL: `my-post.md` becomes `/posts/my-post/`.
2. Start the file with this frontmatter:

   ```yaml
   ---
   title: "My post"
   description: "One sentence for the post list, the RSS feed, and search engines."
   pubDate: 2026-10-16T12:00:00Z
   tags: ["rust"]
   ---
   ```

3. Optional fields: `updatedDate`, `heroImage` (a relative path to an image), and `draft: true`.

## Configure

The site has no environment variables. `src/consts.ts` has the site URL, the title, and the links.

The deploy job in CI needs two secrets in the `production` environment:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | An API token with the "Edit Cloudflare Workers" permissions. |
| `CLOUDFLARE_ACCOUNT_ID` | The ID of the Cloudflare account. |

## Develop

- Lint and type check: `scripts/lint.sh`
- Test: `scripts/test.sh`
- Lint, test, and build: `scripts/all.sh`
- Serve the build the way Cloudflare does: `pnpm preview`
- Add the git hook once: `prek install`

## Deploy

CI deploys every push to `main`, after the lint, test, and build jobs pass. To deploy by hand, run `pnpm run deploy`.
