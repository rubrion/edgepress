export type Lang = 'en' | 'pt-BR';

const translations = {
  en: {
    'nav.home': 'Home',
    'nav.blog': 'Blog',
    'nav.about': 'About',
    'nav.toggleDark': 'Toggle dark mode',
    'nav.toDark': 'Switch to dark mode',
    'nav.toLight': 'Switch to light mode',

    'footer.rights': 'All rights reserved.',

    'subscribe.heading': 'Subscribe to the newsletter',
    'subscribe.emailLabel': 'Email',
    'subscribe.placeholder': 'you@example.com',
    'subscribe.button': 'Subscribe',
    'subscribe.loading': 'Subscribing…',
    'subscribe.success': 'Thanks! Check your inbox for the next issue.',
    'subscribe.errorNetwork': 'Network error.',

    'index.latestPosts': 'Latest posts',
    'index.allPosts': 'All posts →',

    'blog.title': 'Blog',
    'blog.empty': 'No posts yet.',

    'about.body': '{name} is a newsletter and blog. Subscribe to receive new posts in your inbox.',
  },
  'pt-BR': {
    'nav.home': 'Início',
    'nav.blog': 'Blog',
    'nav.about': 'Sobre',
    'nav.toggleDark': 'Alternar modo escuro',
    'nav.toDark': 'Mudar para modo escuro',
    'nav.toLight': 'Mudar para modo claro',

    'footer.rights': 'Todos os direitos reservados.',

    'subscribe.heading': 'Assine a newsletter',
    'subscribe.emailLabel': 'E-mail',
    'subscribe.placeholder': 'voce@exemplo.com',
    'subscribe.button': 'Assinar',
    'subscribe.loading': 'Inscrevendo…',
    'subscribe.success': 'Obrigado! Verifique sua caixa de entrada.',
    'subscribe.errorNetwork': 'Erro de rede.',

    'index.latestPosts': 'Últimas publicações',
    'index.allPosts': 'Todas as publicações →',

    'blog.title': 'Blog',
    'blog.empty': 'Nenhuma publicação ainda.',

    'about.body': '{name} é uma newsletter e blog. Assine para receber novas publicações na sua caixa de entrada.',
  },
} as const;

type TranslationKey = keyof (typeof translations)['en'];

export function getLang(request: Request): Lang {
  const cookie = request.headers.get('cookie') ?? '';
  const cookieMatch = cookie.match(/(?:^|;\s*)lang=([^;]+)/);
  if (cookieMatch) {
    const v = decodeURIComponent(cookieMatch[1]);
    if (v === 'pt-BR') return 'pt-BR';
    if (v === 'en') return 'en';
  }

  const accept = request.headers.get('accept-language') ?? '';
  if (/\bpt\b/i.test(accept)) return 'pt-BR';

  return 'en';
}

export function useTranslations(lang: Lang) {
  return function t(key: TranslationKey, vars?: Record<string, string>): string {
    const str = (translations[lang] as Record<string, string>)[key]
      ?? (translations['en'] as Record<string, string>)[key]
      ?? key;
    if (!vars) return str;
    return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), str);
  };
}
