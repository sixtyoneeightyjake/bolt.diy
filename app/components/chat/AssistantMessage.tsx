import { memo } from 'react';
import { Markdown } from './Markdown';
import WithTooltip from '~/components/ui/Tooltip';
import type { ProviderInfo } from '~/types/model';
import type {
  TextUIPart,
  ReasoningUIPart,
  ToolUIPart,
  DynamicToolUIPart,
  SourceDocumentUIPart,
  FileUIPart,
  StepStartUIPart,
} from 'ai';

/*
 * Temporarily disable tool invocations UI until v5 tool parts are fully wired
 * import { ToolInvocations } from './ToolInvocations';
 */

interface AssistantMessageProps {
  content: string;
  messageId?: string;
  onRewind?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
  append?: (message: ExtendedUIMessage) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  model?: string;
  provider?: ProviderInfo;
  parts:
    | (
        | TextUIPart
        | ReasoningUIPart
        | ToolUIPart
        | DynamicToolUIPart
        | SourceDocumentUIPart
        | FileUIPart
        | StepStartUIPart
      )[]
    | undefined;
  addToolResult: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
}

//

export const AssistantMessage = memo(
  ({
    content,
    messageId,
    onRewind,
    onFork,
    append,
    chatMode,
    setChatMode,
    model,
    provider,
    parts: _parts,
    addToolResult: _addToolResult,
  }: AssistantMessageProps) => {
    return (
      <div className="overflow-hidden w-full">
        <>
          <div className=" flex gap-2 items-center text-sm text-bolt-elements-textSecondary mb-2">
            {/* Context popover disabled during v5 migration */}
            <div className="flex w-full items-center justify-between">
              {/* usage chips disabled */}
              {(onRewind || onFork) && messageId && (
                <div className="flex gap-2 flex-col lg:flex-row ml-auto">
                  {onRewind && (
                    <WithTooltip tooltip="Revert to this message">
                      <button
                        onClick={() => onRewind(messageId)}
                        key="i-ph:arrow-u-up-left"
                        className="i-ph:arrow-u-up-left text-xl text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
                      />
                    </WithTooltip>
                  )}
                  {onFork && (
                    <WithTooltip tooltip="Fork chat from this message">
                      <button
                        onClick={() => onFork(messageId)}
                        key="i-ph:git-fork"
                        className="i-ph:git-fork text-xl text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
                      />
                    </WithTooltip>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
        <Markdown append={append} chatMode={chatMode} setChatMode={setChatMode} model={model} provider={provider} html>
          {content}
        </Markdown>
        {/* Tool invocations UI disabled during v5 migration */}
      </div>
    );
  },
);
