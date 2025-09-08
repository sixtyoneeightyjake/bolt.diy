import { SignedIn, SignedOut, useUser } from '@clerk/remix';
import { useMemo } from 'react';
import { SIGN_IN_URL } from '~/utils/auth.config';

function buildSignInUrl() {
  try {
    const url = new URL(SIGN_IN_URL);
    url.searchParams.set('redirect_url', typeof window !== 'undefined' ? `${window.location.origin}/` : '/');

    return url.toString();
  } catch {
    return SIGN_IN_URL;
  }
}

export function UserStatus() {
  const { user } = useUser();
  const name = useMemo(() => user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress, [user]);

  return (
    <div className="flex items-center gap-3">
      <SignedIn>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-bolt-elements-icon-success" />
          <span className="text-bolt-elements-textSecondary">Signed in as</span>
          <span className="font-medium text-bolt-elements-textPrimary truncate max-w-[180px]">{name}</span>
        </div>
      </SignedIn>
      <SignedOut>
        <a
          href={buildSignInUrl()}
          className="text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
        >
          Signed out — Sign in
        </a>
      </SignedOut>
    </div>
  );
}
