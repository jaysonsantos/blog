import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import { PATHS, SITE_URL } from "./src/consts.ts";

export default defineConfig({
  site: SITE_URL,
  trailingSlash: "always",
  integrations: [mdx(), sitemap()],
  redirects: {
    [PATHS.posts]: PATHS.home,
  },
  markdown: {
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
    },
  },
});
