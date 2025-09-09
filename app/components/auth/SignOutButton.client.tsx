import { SignedIn, useClerk } from '@clerk/remix';
import { useMemo } from 'react';

function buildSignInUrl() {
  return '/sign-in';
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
