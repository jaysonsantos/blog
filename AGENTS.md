# Blog

A personal blog. Astro builds a static site. A Cloudflare Worker with static assets serves it at `blog.jayson.com.br`.

## Paths

| Path | Purpose |
|---|---|
| `src/content/posts/` | The posts, one Markdown or MDX file each. The file name is the URL slug. |
| `src/content.config.ts` | The frontmatter schema of a post. |
| `src/pages/` | The routes: post list, `posts/<slug>/`, `tags/`, `rss.xml`, `404`. |
| `src/layouts/`, `src/components/` | The page frame, the post layout, and small parts. |
| `src/lib/` | Helpers. `dates.ts` and `paths.ts` have no Astro imports, so `node --test` can load them. |
| `src/consts.ts` | The site URL, the title, the links, and the route prefixes. |
| `src/styles/global.css` | The colors (light and dark), the type, and the code blocks. |
| `test/` | Unit tests for `src/lib/`. |
| `scripts/` | `lint.sh`, `test.sh`, `all.sh`. CI runs the same scripts. |
| `wrangler.jsonc` | The Worker: assets from `dist/`, the custom domain, the 404 page. |

## Commands

- Dev shell: `nix develop`, or `direnv allow` with an `.envrc` that has `use flake`.
- Install: `pnpm install`
- Dev server: `pnpm dev`
- Lint and type check: `scripts/lint.sh`
- Test: `scripts/test.sh`
- Everything, then a build into `dist/`: `scripts/all.sh`
- Serve `dist/` the way Cloudflare does: `pnpm preview`
- Deploy by hand: `pnpm run deploy`. CI deploys every push to `main`.

## Rules

- Use pnpm, never npm.
- Keep the dates of an imported post. `pubDate` is the first publication. `updatedDate` is the last edit.
- Write a date with its time zone (`2021-02-20T07:48:40Z`). The site shows dates in UTC.
- Keep the file name of a published post. The file name is the URL.
- Set `draft: true` to hide a post from the build. `pnpm dev` still shows it.
- Put the images of a post in `src/assets/` and link them with a relative path, so Astro optimizes them.

## Deployment

- The `deploy` job of `.github/workflows/ci.yml` needs the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the `production` environment.
- The token needs the "Edit Cloudflare Workers" template permissions on the account and on the `jayson.com.br` zone.
- The first `wrangler deploy` creates the DNS record and the certificate of `blog.jayson.com.br`.
