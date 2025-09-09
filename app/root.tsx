import { useStore } from '@nanostores/react';
import { json, type LinksFunction, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from '@remix-run/react';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { themeStore } from './lib/stores/theme';
import { stripIndents } from './utils/stripIndent';
import { createHead } from 'remix-island';
import { useEffect, type ReactNode } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ClientOnly } from 'remix-utils/client-only';
import { ClerkApp } from '@clerk/remix';
import { rootAuthLoader } from '@clerk/remix/ssr.server';
import { SIGN_IN_URL, SIGN_UP_URL } from '~/utils/auth.config';

import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';

import 'virtual:uno.css';

export const links: LinksFunction = () => [
  {
    rel: 'icon',
    href: '/favicon.svg',
    type: 'image/svg+xml',
  },
  { rel: 'stylesheet', href: reactToastifyStyles },
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
  { rel: 'stylesheet', href: xtermStyles },
  {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
];

// Initialize Clerk SSR auth (Cloudflare-compatible)
export const loader = async (args: LoaderFunctionArgs) => {
  const disable = (typeof process !== 'undefined' && process.env?.DISABLE_CLERK_SSR === '1') || false;
  const hasClerk =
    typeof process !== 'undefined' && !!process.env?.CLERK_PUBLISHABLE_KEY && !!process.env?.CLERK_SECRET_KEY;

  if (disable || !hasClerk) {
    return json({ auth: 'disabled' });
  }

  try {
    return await rootAuthLoader(args);
  } catch (e: any) {
    console.warn('Clerk SSR loader failed; continuing unauthenticated', e?.message ?? e);
    return json({ auth: 'error' });
  }
};

const inlineThemeCode = stripIndents`
  setTutorialKitTheme();

  function setTutorialKitTheme() {
    let theme = localStorage.getItem('bolt_theme');

    // Default to dark to reflect MojoCode branding (black background)
    if (!theme) {
      theme = 'dark';
    }

    document.querySelector('html')?.setAttribute('data-theme', theme);
  }
`;

export const Head = createHead(() => (
  <>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <Meta />
    <Links />
    <script dangerouslySetInnerHTML={{ __html: inlineThemeCode }} />
  </>
));

export function Layout({ children }: { children: ReactNode }) {
  const theme = useStore(themeStore);

  useEffect(() => {
    document.querySelector('html')?.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <>
      <ClientOnly>{() => <DndProvider backend={HTML5Backend}>{children}</DndProvider>}</ClientOnly>
      <ScrollRestoration />
      <Scripts />
    </>
  );
}

import { logStore } from './lib/stores/logs';

function App() {
  const theme = useStore(themeStore);

  useEffect(() => {
    // Prefer User-Agent Client Hints if available; fall back to userAgent string
    const platform = (navigator as any).userAgentData?.platform ?? navigator.userAgent;
    logStore.logSystem('Application initialized', {
      theme,
      platform,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });
  }, [theme]);

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

// Wrap the Remix app with Clerk provider
export default ClerkApp(App, {
  // Prefer in-app auth routes for consistent redirects & cookies
  signInUrl: SIGN_IN_URL,
  signUpUrl: SIGN_UP_URL,
  afterSignInUrl: '/',
  afterSignUpUrl: '/',
});

/*
 * Provide Clerk-aware error boundary
 * Use Remix's default ErrorBoundary or add a custom one if desired
 */
