import { SignedIn, SignedOut, useUser } from '@clerk/remix';
import { useMemo } from 'react';
import SignOutButton from '~/components/auth/SignOutButton.client';

function buildSignInUrl() {
  return '/sign-in';
}

export default function SidebarUserStatus() {
  const { user } = useUser();
  const name = useMemo(() => user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress, [user]);

  return (
    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800/50 bg-white/50 dark:bg-gray-950/50">
      <SignedIn>
        <div className="flex items-center gap-3">
          <img
            src={user?.imageUrl}
            alt={name || 'User'}
            className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700"
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{name}</div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span>Signed in</span>
              <SignOutButton className="ml-auto" />
            </div>
          </div>
        </div>
      </SignedIn>
      <SignedOut>
        <a href={buildSignInUrl()} className="text-sm text-gray-600 dark:text-gray-300 hover:underline">
          Sign in to sync and import
        </a>
      </SignedOut>
    </div>
  );
}
