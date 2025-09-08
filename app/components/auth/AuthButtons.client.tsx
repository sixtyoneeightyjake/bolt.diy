import { SignedIn, SignedOut, UserButton } from '@clerk/remix';
import { useMemo } from 'react';
import { SIGN_IN_URL } from '~/utils/auth.config';

function buildSignInUrl() {
  if (typeof window === 'undefined') {
    return SIGN_IN_URL;
  }

  const redirect = `${window.location.origin}/`;
  const url = new URL(SIGN_IN_URL);
  url.searchParams.set('redirect_url', redirect);

  return url.toString();
}

export function SignInLinkButton() {
  const href = useMemo(() => buildSignInUrl(), []);
  return (
    <a href={href}>
      <button className="px-3 py-1.5 text-sm rounded-md border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive text-bolt-elements-textPrimary">
        Sign in
      </button>
    </a>
  );
}

export function UserButtonWithRedirect() {
  const href = useMemo(() => buildSignInUrl(), []);
  return (
    <SignedIn>
      <UserButton afterSignOutUrl={href} />
    </SignedIn>
  );
}

export function HeaderAuthControls() {
  return (
    <div className="ml-auto flex items-center gap-3">
      <SignedOut>
        <SignInLinkButton />
      </SignedOut>
      <UserButtonWithRedirect />
    </div>
  );
}
