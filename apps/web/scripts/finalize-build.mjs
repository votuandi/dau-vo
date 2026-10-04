import { readFile, writeFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { normalizeStaticPermissions } from './static-permissions.mjs';

// Render the same component used by the browser, with no session/API dependency.
// Only the homepage is prerendered; protected routes keep the empty SPA shell.
const server = await createServer({
  mode: 'production',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { HomePage } = await server.ssrLoadModule('/src/pages/home-page.tsx');
  const { homeSeo, homeStructuredData, siteUrl } = await server.ssrLoadModule(
    '/src/features/seo/metadata.ts',
  );
  const shell = await readFile('dist/index.html', 'utf8');
  await writeFile('dist/app.html', shell);
  const escape = (value) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  const seoTags = `
    <link data-home-seo rel="canonical" href="${escape(siteUrl)}/" />
    <meta data-home-seo property="og:type" content="website" />
    <meta data-home-seo property="og:locale" content="vi_VN" />
    <meta data-home-seo property="og:site_name" content="Đấu Võ Minwy" />
    <meta data-home-seo property="og:title" content="${escape(homeSeo.title)}" />
    <meta data-home-seo property="og:description" content="${escape(homeSeo.description)}" />
    <meta data-home-seo property="og:url" content="${escape(siteUrl)}/" />
    <meta data-home-seo property="og:image" content="${escape(siteUrl)}/apple-touch-icon.png" />
    <meta data-home-seo name="twitter:card" content="summary" />
    <meta data-home-seo name="twitter:title" content="${escape(homeSeo.title)}" />
    <meta data-home-seo name="twitter:description" content="${escape(homeSeo.description)}" />
    <meta data-home-seo name="twitter:image" content="${escape(siteUrl)}/apple-touch-icon.png" />
    <script data-home-seo type="application/ld+json">${JSON.stringify(homeStructuredData).replaceAll('<', '\\u003c')}</script>`;
  if (!shell.includes('<div id="root"></div>'))
    throw new Error('Missing SPA root for prerendering');
  const html = shell
    .replace(/<title>.*?<\/title>/s, `<title>${escape(homeSeo.title)}</title>`)
    .replace(
      /<meta name="description" content="[^"]*"\s*\/>/,
      `<meta name="description" content="${escape(homeSeo.description)}" />`,
    )
    .replace('content="noindex, follow"', 'content="index, follow"')
    .replace('</head>', `${seoTags}\n  </head>`)
    .replace(
      '<div id="root"></div>',
      `<div id="root" data-prerendered="true">${renderToString(createElement(HomePage))}</div>`,
    );
  await writeFile('dist/index.html', html);
  await writeFile(
    'dist/robots.txt',
    `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
  );
  await writeFile(
    'dist/sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escape(siteUrl)}/</loc></url></urlset>\n`,
  );
  await normalizeStaticPermissions('dist');
} finally {
  await server.close();
}
