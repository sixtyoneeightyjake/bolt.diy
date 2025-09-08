import { SignedIn, useClerk } from '@clerk/remix';
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

export default function SignOutButtonClient({ className = '' }: { className?: string }) {
  const { signOut } = useClerk();
  const redirectUrl = useMemo(() => buildSignInUrl(), []);

  return (
    <SignedIn>
      <button
        className={`px-3 py-1.5 text-sm rounded-md border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive text-bolt-elements-textPrimary ${className}`}
        onClick={() => signOut({ redirectUrl })}
      >
        Sign out
      </button>
    </SignedIn>
  );
}
