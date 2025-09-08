import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { HeaderAuthControls } from '~/components/auth/AuthButtons.client';
import { UserStatus } from '~/components/auth/UserStatus.client';
import SignOutButtonClient from '~/components/auth/SignOutButton.client';

export function Header() {
  const chat = useStore(chatStore);

  return (
    <header
      className={classNames('flex items-center px-4 border-b h-[var(--header-height)]', {
        'border-transparent': !chat.started,
        'border-bolt-elements-borderColor': chat.started,
      })}
    >
      <div className="flex items-center gap-2 z-logo text-bolt-elements-textPrimary cursor-pointer">
        <div className="i-ph:sidebar-simple-duotone text-xl" />
        <a
          href="/"
          className="text-2xl font-extrabold tracking-tight flex items-center gap-1 select-none transition-transform duration-150 hover:scale-[1.02]"
          aria-label="MojoCode Home"
        >
          <span className="text-white hidden dark:inline">MOJO</span>
          <span className="text-gray-900 inline dark:hidden">MOJO</span>
          <span className="text-red-600">.CODE</span>
        </a>
      </div>
      {chat.started && ( // Display ChatDescription and HeaderActionButtons only when the chat has started.
        <>
          <span className="flex-1 px-4 truncate text-center text-bolt-elements-textPrimary">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
          <ClientOnly>
            {() => (
              <div className="">
                <HeaderActionButtons chatStarted={chat.started} />
              </div>
            )}
          </ClientOnly>
        </>
      )}
      {/* Auth status + controls */}
      <div className="ml-auto flex items-center gap-3">
        <ClientOnly>{() => <UserStatus />}</ClientOnly>
        <ClientOnly>{() => <HeaderAuthControls />}</ClientOnly>
        <ClientOnly>{() => <SignOutButtonClient />}</ClientOnly>
      </div>
    </header>
  );
}
