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
      <UserButton
        afterSignOutUrl={href}
        appearance={{
          elements: {
            userButtonBox: 'bg-transparent',
            userButtonOuterIdentifier: 'text-bolt-elements-textSecondary',
            userButtonTrigger:
              'rounded-md px-2 py-1 bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
            userButtonPopoverCard: 'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
            userPreviewMainIdentifier: 'text-bolt-elements-textPrimary',
            userPreviewSecondaryIdentifier: 'text-bolt-elements-textSecondary',
          },
        }}
      />
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
