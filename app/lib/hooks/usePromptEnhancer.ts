import { useState } from 'react';
import type { ProviderInfo } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('usePromptEnhancement');

export function usePromptEnhancer() {
  const [enhancingPrompt, setEnhancingPrompt] = useState(false);
  const [promptEnhanced, setPromptEnhanced] = useState(false);

  const resetEnhancer = () => {
    setEnhancingPrompt(false);
    setPromptEnhanced(false);
  };

  const enhancePrompt = async (
    input: string,
    setInput: (value: string) => void,
    model: string,
    provider: ProviderInfo,
    apiKeys?: Record<string, string>,
  ) => {
    setEnhancingPrompt(true);
    setPromptEnhanced(false);

    // Prefer a fast, non-reasoning model for prompt enhancement
    // 1) Try Google gemini-2.5-flash if available
    // 2) Fallback to OpenAI gpt-4.1-mini
    const fastProvider: ProviderInfo = ({ name: 'Google', staticModels: [] } as unknown) as ProviderInfo;
    const fastModel = 'gemini-2.5-flash';
    const miniProvider: ProviderInfo = ({ name: 'OpenAI', staticModels: [] } as unknown) as ProviderInfo;
    const miniModel = 'gpt-4.1-mini';

    const preferred = fastProvider;
    const preferredModel = fastModel;

    // Always use our preferred model for enhancement to keep it snappy
    const requestBody: any = {
      message: input,
      model: preferredModel,
      provider: preferred,
    };

    if (apiKeys) {
      requestBody.apiKeys = apiKeys;
    }

    const response = await fetch('/api/enhancer', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      // if unauthorized or other error, fall back to the UI-selected model/provider
      const fallbackResp = await fetch('/api/enhancer', {
        method: 'POST',
        body: JSON.stringify({ message: input, model, provider, apiKeys }),
      });

      if (!fallbackResp.ok) {
        setEnhancingPrompt(false);
        setPromptEnhanced(false);
        logger.error('Enhancer failed', { status: fallbackResp.status, statusText: fallbackResp.statusText });
        return;
      }

      const reader = fallbackResp.body?.getReader();
      await streamIntoInput(reader, input, setInput);
      return;
    }

    const reader = response.body?.getReader();
    await streamIntoInput(reader, input, setInput);
  };

  async function streamIntoInput(
    reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
    originalInput: string,
    setInput: (value: string) => void,
  ) {
    if (!reader) {
      setEnhancingPrompt(false);
      setPromptEnhanced(false);
      return;
    }

    const decoder = new TextDecoder();
    let _input = '';
    let _error: unknown;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        _input += decoder.decode(value);
      }
    } catch (error) {
      _error = error;
    } finally {
      if (_error) {
        logger.error(_error);
      }
      // Only replace the input if we actually received enhanced text
      // Otherwise, keep the user's original input intact
      if (_input && _input.trim().length > 0) {
        setPromptEnhanced(true);
        setTimeout(() => setInput(_input));
      } else {
        setPromptEnhanced(false);
        setTimeout(() => setInput(originalInput));
      }

      setEnhancingPrompt(false);
    }
  }

  return { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer };
}
