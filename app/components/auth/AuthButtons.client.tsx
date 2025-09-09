import { SignedIn, SignedOut, UserButton } from '@clerk/remix';
import { useMemo } from 'react';

// Route to in-app sign-in; global Clerk config handles redirects
function buildSignInUrl() {
  return '/sign-in';
}

export function SignInLinkButton() {
  const href = useMemo(() => buildSignInUrl(), []);
  return (
    <a href={href}>
      <button
        className="px-3 py-1.5 text-sm rounded-md transition-colors
                   bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3
                   text-bolt-elements-textPrimary
                   border border-bolt-elements-borderColor"
      >
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
