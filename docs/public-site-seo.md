# Public homepage and SEO

The public homepage at `https://dauvo.minwysoft.com/` describes the existing tournament and scoring features in Vietnamese. Content covers võ gậy, chấm điểm võ thuật, chấm điểm võ gậy, thi đấu võ thuật, and thi đấu võ gậy in headings and useful explanations rather than a repeated keyword list.

## Build and routing

`pnpm --filter @martial-arts-scoring/web build` builds Vite assets, renders the shared `HomePage` React component into `dist/index.html`, and writes an empty SPA shell to `dist/app.html`. Nginx serves the prerendered homepage at `/` and uses the noindex SPA shell for application routes. `/workspace` retains the previous role-aware redirect, and authenticated login visits also go there. The homepage works without JavaScript or a session; React hydrates the same component when JavaScript is available.

The build generates a homepage-only `sitemap.xml`, `robots.txt`, canonical URL, Open Graph metadata, Twitter card metadata, and WebSite/WebApplication JSON-LD. Private and operational pages are not in the sitemap and have `noindex, follow`. Robots permits crawling so search engines can see those noindex directives; authentication remains the access control.

`VITE_SITE_URL` optionally sets the public origin at build time. The default is `https://dauvo.minwysoft.com`. When deploying to another domain, set this variable before building; rebuild to update canonical URLs, sitemap, and structured data.

## Static file permissions

The observed production response for `/logo.webp` and `/favicon.ico` was Nginx 403, while a generated JavaScript asset returned 200. File permission inheritance is a likely cause, pending server error-log confirmation. Vite copies public assets with their source permissions. A restrictive checkout umask can produce mode 600 public files even though Git lists the mode as 100644. The build now normalizes static directories to 755 and files to 644. The final Docker stage repeats this normalization so Nginx workers can read all public assets regardless of build permissions. No global write permissions are granted.

After deployment, verify `/logo.webp`, `/favicon.ico`, `/robots.txt`, `/sitemap.xml` and `/` return 200 with appropriate content types. If 403 remains, inspect `docker compose logs web` and run `docker compose exec web stat -c '%a %n' /usr/share/nginx/html/logo.webp` to confirm the active container permissions. Verify the active image contains the deployed commit; also inspect the internet-facing proxy configuration.

## Google Search Console

1. Add or open the property for `dauvo.minwysoft.com` in Google Search Console. Complete the ownership verification it provides; do not add a guessed verification token.
2. Submit `https://dauvo.minwysoft.com/sitemap.xml`.
3. Inspect `https://dauvo.minwysoft.com/`, run the live URL test, verify Google sees the content and canonical, then request indexing.
4. Monitor indexing and search performance for the target queries. Google determines crawling, indexing, and rankings; implementation does not guarantee placement or timing.

Primary guidance: [Google Search Essentials](https://developers.google.com/search/docs/essentials), [JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), and [Sitemap overview](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview).

Validation: `pnpm --filter @martial-arts-scoring/web test`, `lint`, `build`, then `test:build`. CI checks the generated HTML and static permissions after its monorepo build.
