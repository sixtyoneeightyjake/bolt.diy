import type { ExtendedUIMessage } from '~/types/ExtendedUIMessage';
import ignore from 'ignore';
import { LLMManager } from '~/lib/modules/llm/manager';
import { PROVIDER_LIST, DEFAULT_PROVIDER } from '~/utils/constants';
import { logger } from '~/utils/logger';
import { extractPropertiesFromMessage, simplifyBoltActions } from './utils';
import { createFilesContext, extractCurrentContext } from './utils';
import { createSummary } from './create-summary';
import type { FileMap } from '~/lib/stores/files';

// Utility function to extract text content from ExtendedUIMessage parts
function getTextContent(message: ExtendedUIMessage): string {
  if ('parts' in message && Array.isArray(message.parts)) {
    // UIMessage type - extract text from parts
    return message.parts
      .filter((part) => part.type === 'text')
      .map((part) => ('text' in part ? part.text : ''))
      .join('');
  }

  return '';
}

export async function selectContext(
  messages: ExtendedUIMessage[],
  filesParam: FileMap | undefined,
  apiKeys: Record<string, string>,
  providerSettings: Record<string, any>,
  serverEnv: Record<string, string>,
  summary?: string,
) {
  let currentModel = '';
  let currentProvider = '';

  const ig = ignore();
  ig.add(['.git', 'node_modules', '.next', '.nuxt', 'dist', 'build', '.svelte-kit']);

  const processedMessages = messages.map((message) => {
    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);
      currentModel = model;
      currentProvider = provider;

      return { ...message, content };
    } else if (message.role == 'assistant') {
      let content = getTextContent(message);

      content = simplifyBoltActions(content);

      content = content.replace(/<div class=\"__boltThought__\">.*?<\/div>/s, '');
      content = content.replace(/<think>.*?<\/think>/s, '');

      return { ...message, content };
    }

    return message;
  });

  const provider = PROVIDER_LIST.find((p) => p.name === currentProvider) || DEFAULT_PROVIDER;
  const staticModels = LLMManager.getInstance().getStaticModelListFromProvider(provider);
  let modelDetails = staticModels.find((m) => m.name === currentModel);

  if (!modelDetails) {
    const modelsList = [
      ...(provider.staticModels || []),
      ...(await LLMManager.getInstance().getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: serverEnv as any,
      })),
    ];

    if (!modelsList.length) {
      throw new Error(`No models found for provider ${provider.name}`);
    }

    modelDetails = modelsList.find((m) => m.name === currentModel);

    if (!modelDetails) {
      // Fallback to first model
      logger.warn(
        `MODEL [${currentModel}] not found in provider [${provider.name}]. Falling back to first model. ${modelsList[0].name}`,
      );
      modelDetails = modelsList[0];
    }
  }

  const { codeContext } = extractCurrentContext(processedMessages);

  /*
   *let filePaths = getFilePaths(files || {});
   *filePaths = filePaths.filter((x) => {
   *  const relPath = x.replace('/home/project/', '');
   *  return !ig.ignores(relPath);
   *});
   */

  let context = '';
  const currrentFiles: string[] = [];
  const contextFiles: FileMap = {};

  const files = filesParam || {};

  if (codeContext?.type === 'codeContext') {
    const codeContextFiles: string[] = codeContext.files;
    Object.keys(files).forEach((path) => {
      let relativePath = path;

      if (path.startsWith('/home/project/')) {
        relativePath = path.replace('/home/project/', '');
      }

      if (codeContextFiles.includes(relativePath)) {
        contextFiles[relativePath] = files[path];
        currrentFiles.push(relativePath);
      }
    });
    context = createFilesContext(contextFiles);
  }

  const summaryText = `Here is the summary of the chat till now: ${summary}`;

  const extractTextContent = (message: ExtendedUIMessage) => getTextContent(message);

  const lastUserMessage = processedMessages.filter((x) => x.role == 'user').pop();

  if (!lastUserMessage) {
    throw new Error('No user message found');
  }

  const lastUserMessageContent = extractTextContent(lastUserMessage);

  const contextLength = context.length;
  const summaryLength = summaryText.length;
  const lastUserMessageLength = lastUserMessageContent.length;

  const totalLength = contextLength + summaryLength + lastUserMessageLength;

  logger.info(`Context length: ${contextLength}`);
  logger.info(`Summary length: ${summaryLength}`);
  logger.info(`Last user message length: ${lastUserMessageLength}`);
  logger.info(`Total length: ${totalLength}`);

  const maxTokens = (modelDetails as any).maxTokenAllowed || 128000;
  const maxContextLength = Math.floor(maxTokens * 0.8); // Use 80% of max tokens for context

  if (totalLength > maxContextLength) {
    logger.warn(`Context too long (${totalLength} > ${maxContextLength}). Truncating...`);

    // Prioritize: last user message > summary > context
    let availableLength = maxContextLength - lastUserMessageLength;

    let truncatedSummary = summaryText;

    if (summaryLength > availableLength * 0.3) {
      truncatedSummary = summaryText.substring(0, Math.floor(availableLength * 0.3)) + '...';
    }

    availableLength -= truncatedSummary.length;

    let truncatedContext = context;

    if (contextLength > availableLength) {
      truncatedContext = context.substring(0, availableLength) + '...';
    }

    return {
      model: modelDetails,
      provider,
      context: truncatedContext,
      summary: truncatedSummary,
      lastUserMessage: lastUserMessageContent,
      files: currrentFiles,
    };
  }

  return {
    model: modelDetails,
    provider,
    context,
    summary: summaryText,
    lastUserMessage: lastUserMessageContent,
    files: currrentFiles,
  };
}

export function createCodeContext(files: FileMap): string {
  return createFilesContext(files || {});
}

export async function createChatSummary(
  messages: ExtendedUIMessage[],
  apiKeys: Record<string, string>,
  providerSettings: Record<string, any>,
  serverEnv: Record<string, string>,
): Promise<string> {
  return createSummary({
    messages,
    apiKeys,
    providerSettings,
    env: serverEnv as any,
  });
}
