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
        className={`px-3 py-1.5 text-sm rounded-md transition-colors bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary border border-bolt-elements-borderColor ${className}`}
        onClick={() => signOut({ redirectUrl })}
      >
        Sign out
      </button>
    </SignedIn>
  );
}
