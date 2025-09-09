import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';
import type { DesignScheme } from '~/types/design-scheme';
import { SIGN_IN_URL } from '~/utils/auth.config';

// Re-declare minimal types locally to avoid importing server-only modules at top-level
type FileMap = Record<string, any>;

export async function action(args: ActionFunctionArgs) {
  // Import server-only modules within the action to prevent client bundle from referencing them
  const { getAuth } = await import('@clerk/remix/ssr.server');

  const auth = await getAuth(args);

  if (!auth?.userId) {
    return new Response(
      JSON.stringify({ error: true, message: 'Authentication required', statusCode: 401, isRetryable: false }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'X-Auth-Redirect': SIGN_IN_URL },
      },
    );
  }

  return chatAction(args);
}

const logger = createScopedLogger('api.chat');

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  const items = cookieHeader.split(';').map((cookie) => cookie.trim());

  items.forEach((item) => {
    const [name, ...rest] = item.split('=');

    if (name && rest) {
      const decodedName = decodeURIComponent(name.trim());
      const decodedValue = decodeURIComponent(rest.join('=').trim());
      cookies[decodedName] = decodedValue;
    }
  });

  return cookies;
}

async function chatAction({ context, request }: ActionFunctionArgs) {
  // Dynamically import server-only utilities
  const [{ MCPService: mcpServiceClass }, { createSummary }, { selectContext }, { streamText }]: any =
    await Promise.all([
      import('~/lib/services/mcpService'),
      import('~/lib/.server/llm/create-summary'),
      import('~/lib/.server/llm/select-context'),
      import('~/lib/.server/llm/stream-text'),
    ]);

  type Messages = any;
  type StreamingOptions = any;

  const { messages, files, promptId, contextOptimization, chatMode, designScheme } = await request.json<{
    messages: Messages;
    files: any;
    promptId?: string;
    contextOptimization: boolean;
    chatMode: 'discuss' | 'build';
    designScheme?: DesignScheme;
    supabase?: {
      isConnected: boolean;
      hasSelectedProject: boolean;
      credentials?: {
        anonKey?: string;
        supabaseUrl?: string;
      };
    };
    maxLLMSteps: number;
  }>();

  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = JSON.parse(parseCookies(cookieHeader || '').apiKeys || '{}');
  const providerSettings: Record<string, IProviderSetting> = JSON.parse(
    parseCookies(cookieHeader || '').providers || '{}',
  );

  try {
    const mcpService = mcpServiceClass.getInstance();

    // Optionally compute summary/context (no progress events during v5 migration)
    let summary: string | undefined = undefined;
    let filteredFiles: FileMap | undefined = undefined;

    try {
      if (contextOptimization) {
        summary = await createSummary({ messages, env: context.cloudflare?.env, apiKeys, providerSettings, promptId });

        const sel = await selectContext(
          messages as any,
          files as any,
          apiKeys,
          providerSettings,
          context.cloudflare?.env as any,
          summary,
        );

        // Build a minimal map of selected files for downstream options
        filteredFiles = Object.fromEntries((sel.files || []).map((p: string) => [p, (files as any)?.[p]])) as FileMap;
      }
    } catch {
      logger.warn('Context optimization failed; continuing without extra context');
    }

    const options: StreamingOptions = {
      toolChoice: 'auto',
      tools: mcpService.toolsWithoutExecute,
    } as any;

    const result = await streamText({
      messages: [...messages],
      env: context.cloudflare?.env,
      options,
      apiKeys,
      files,
      providerSettings,
      promptId,
      contextOptimization,
      contextFiles: filteredFiles,
      chatMode,
      designScheme,
      summary,
      messageSliceId: 0,
    });

    return (result as any).toUIMessageStreamResponse();
  } catch (error: any) {
    logger.error(error);

    const errorResponse = {
      error: true,
      message: error.message || 'An unexpected error occurred',
      statusCode: error.statusCode || 500,
      isRetryable: error.isRetryable !== false, // Default to retryable unless explicitly false
      provider: error.provider || 'unknown',
    };

    if (error.message?.includes('API key')) {
      return new Response(
        JSON.stringify({
          ...errorResponse,
          message: 'Invalid or missing API key',
          statusCode: 401,
          isRetryable: false,
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
          statusText: 'Unauthorized',
        },
      );
    }

    return new Response(JSON.stringify(errorResponse), {
      status: errorResponse.statusCode,
      headers: { 'Content-Type': 'application/json' },
      statusText: 'Error',
    });
  }
}
