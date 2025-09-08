/*
 * Auth URLs configured via env with sensible fallbacks
 * Use VITE_ prefix so they are available on the client as well
 */
const V = (import.meta as any)?.env || {};

export const SIGN_IN_URL: string =
  V.VITE_CLERK_SIGN_IN_URL ||
  (typeof process !== 'undefined' ? process.env?.VITE_CLERK_SIGN_IN_URL : '') ||
  'https://relevant-burro-77.accounts.dev/sign-in';

export const SIGN_UP_URL: string =
  V.VITE_CLERK_SIGN_UP_URL ||
  (typeof process !== 'undefined' ? process.env?.VITE_CLERK_SIGN_UP_URL : '') ||
  'https://relevant-burro-77.accounts.dev/sign-up';
