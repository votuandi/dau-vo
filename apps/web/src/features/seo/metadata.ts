const configuredSiteUrl = import.meta.env.VITE_SITE_URL?.trim()
  ? import.meta.env.VITE_SITE_URL.trim()
  : 'https://dauvo.minwysoft.com';
export const siteUrl = new URL(configuredSiteUrl).origin;

export const homeSeo = {
  title: 'Đấu Võ Minwy | Chấm điểm võ gậy và thi đấu võ thuật',
  description:
    'Nền tảng chấm điểm võ thuật, chấm điểm võ gậy theo thời gian thực. Quản lý giải đấu, vận động viên, nhánh đấu và bảng điểm cho thi đấu võ gậy.',
};

export const homeStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      name: 'Đấu Võ Minwy',
      url: `${siteUrl}/`,
      inLanguage: 'vi-VN',
      description: homeSeo.description,
    },
    {
      '@type': 'WebApplication',
      name: 'Đấu Võ Minwy',
      url: `${siteUrl}/`,
      applicationCategory: 'SportsApplication',
      operatingSystem: 'Web',
      inLanguage: 'vi-VN',
      description: homeSeo.description,
      image: `${siteUrl}/logo.webp`,
      author: { '@type': 'Person', name: 'Võ Tuấn Dĩ' },
    },
  ],
};

export function updatePageMetadata(pathname: string) {
  const isHome = pathname === '/';
  document.title = isHome ? homeSeo.title : 'Đấu Võ | Chấm điểm võ thuật';
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute(
      'content',
      isHome ? homeSeo.description : 'Nền tảng chấm điểm võ thuật theo thời gian thực',
    );
  document
    .querySelector('meta[name="robots"]')
    ?.setAttribute('content', isHome ? 'index, follow' : 'noindex, follow');
  // The static app shell contains no home-specific tags. Keep client navigation
  // from carrying the homepage canonical or structured data into private pages.
  document
    .querySelectorAll(
      isHome ? 'link[data-home-seo][rel="canonical"], script[data-home-seo]' : '[data-home-seo]',
    )
    .forEach((element) => {
      element.remove();
    });
  if (isHome) {
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = `${siteUrl}/`;
    canonical.dataset.homeSeo = '';
    document.head.append(canonical);
    const schema = document.createElement('script');
    schema.type = 'application/ld+json';
    schema.dataset.homeSeo = '';
    schema.textContent = JSON.stringify(homeStructuredData);
    document.head.append(schema);
  }
}
