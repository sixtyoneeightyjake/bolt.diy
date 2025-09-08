import type { UIMessage } from 'ai';
import { Fragment } from 'react';
import { classNames } from '~/utils/classNames';
import { AssistantMessage } from './AssistantMessage';
import { UserMessage } from './UserMessage';
import { useLocation } from '@remix-run/react';
import { db, chatId } from '~/lib/persistence/useChatHistory';
import { forkChat } from '~/lib/persistence/db';
import { toast } from 'react-toastify';
import { forwardRef } from 'react';
import type { ForwardedRef } from 'react';
import type { ProviderInfo } from '~/types/model';

interface MessagesProps {
  id?: string;
  className?: string;
  isStreaming?: boolean;
  messages?: UIMessage[];
  append?: (message: ExtendedUIMessage) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  model?: string;
  provider?: ProviderInfo;
  addToolResult: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
}

export const Messages = forwardRef<HTMLDivElement, MessagesProps>(
  (props: MessagesProps, ref: ForwardedRef<HTMLDivElement> | undefined) => {
    const { id, isStreaming = false, messages = [] } = props;
    const location = useLocation();

    const handleRewind = (messageId: string) => {
      const searchParams = new URLSearchParams(location.search);
      searchParams.set('rewindTo', messageId);
      window.location.search = searchParams.toString();
    };

    const handleFork = async (messageId: string) => {
      try {
        if (!db || !chatId.get()) {
          toast.error('Chat persistence is not available');
          return;
        }

        const urlId = await forkChat(db, chatId.get()!, messageId);
        window.location.href = `/chat/${urlId}`;
      } catch (error) {
        toast.error('Failed to fork chat: ' + (error as Error).message);
      }
    };

    // helper to extract text from parts (v5 UI)
    const getTextContent = (message: UIMessage) => {
      if (Array.isArray(message.parts)) {
        return message.parts
          .filter((p: any) => p?.type === 'text')
          .map((p: any) => (typeof (p as any).text === 'string' ? (p as any).text : ''))
          .join('');
      }

      // fallback for any legacy content
      return (message as any).content || '';
    };

    return (
      <div id={id} className={props.className} ref={ref}>
        {messages.length > 0
          ? messages.map((message, index) => {
              const { role, id: messageId, parts } = message;
              const content = getTextContent(message);
              const isUserMessage = role === 'user';
              const isFirst = index === 0;
              const isHidden = false; // annotations removed in v5; hide handling disabled

              if (isHidden) {
                return <Fragment key={index} />;
              }

              return (
                <div
                  key={index}
                  className={classNames('flex gap-4 py-3 w-full rounded-lg', {
                    'mt-4': !isFirst,
                  })}
                >
                  <div className="grid grid-col-1 w-full">
                    {isUserMessage ? (
                      <UserMessage content={content} parts={parts as any} />
                    ) : (
                      <AssistantMessage
                        content={content}
                        messageId={messageId}
                        onRewind={handleRewind}
                        onFork={handleFork}
                        append={props.append}
                        chatMode={props.chatMode}
                        setChatMode={props.setChatMode}
                        model={props.model}
                        provider={props.provider}
                        parts={parts as any}
                        addToolResult={props.addToolResult}
                      />
                    )}
                  </div>
                </div>
              );
            })
          : null}
        {isStreaming && (
          <div className="text-center w-full  text-bolt-elements-item-contentAccent i-svg-spinners:3-dots-fade text-4xl mt-4"></div>
        )}
      </div>
    );
  },
);
