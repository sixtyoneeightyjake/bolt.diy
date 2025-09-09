import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { stripIndents } from '~/utils/stripIndent';
import type { ProviderInfo } from '~/types/model';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { createScopedLogger } from '~/utils/logger';

export async function action(args: ActionFunctionArgs) {
  return enhancerAction(args);
}

const logger = createScopedLogger('api.enhancher');

async function enhancerAction({ context, request }: ActionFunctionArgs) {
  const {
    message,
    model,
    provider,
    apiKeys: bodyApiKeys,
  } = await request.json<{
    message: string;
    model: string;
    provider: ProviderInfo;
    apiKeys?: Record<string, string>;
  }>();

  const { name: providerName } = provider;

  // validate 'model' and 'provider' fields
  if (!model || typeof model !== 'string') {
    throw new Response('Invalid or missing model', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  if (!providerName || typeof providerName !== 'string') {
    throw new Response('Invalid or missing provider', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = bodyApiKeys || getApiKeysFromCookie(cookieHeader);
  const providerSettings = getProviderSettingsFromCookie(cookieHeader);

  try {
    const { streamText } = await import('~/lib/.server/llm/stream-text');
    const result = await streamText({
      messages: [
        {
          role: 'user',

          parts: [
            {
              type: 'text',

              text:
                `[Model: ${model}]\n\n[Provider: ${providerName}]\n\n` +
                stripIndents`
            You are an expert level prompt engineer specializing in the enhancement of vague, contextless prompts provided by users and crafting them into precise, effective prompts. The prompts you will receive are from users of a no-code app builder. The user will provide a basic prompt that will to some extent describe the app they wish to build and its functionality.  You must take that information and turn it into a project outline draft, detailing app functions, a rough ui layout, what programming languages are recommended, be sure to include any database, authentication , or api calls that the user mentions. If the user makes no mention of needing any of those integrations but you feel the project will need it, or benefit from having it.- at the end of your enhanced prompt include **Mojo also recommends - list integrations with brief justification for their addition** - The user can decide during the app building process if it wants to pursue those recommendations or not. Do not include any code, snippets, etc in your responses.         


           I want you to improve the user prompt that is wrapped in \`<original_prompt>\` tags.
          
           Also for valid prompts:
           - Make instructions explicit and unambiguous
           - Add relevant context and constraints
           - Remove redundant information
           - Maintain the core intent
           - Ensure the prompt is self-contained
           - Use professional language


           For invalid or unclear prompts:
           - Respond with clear, professional guidance
           - Keep responses concise and actionable
           - Maintain a helpful, constructive tone
           - Focus on what the user should provide
           


           IMPORTANT: Your response must ONLY contain the enhanced prompt text.
           Do not include any explanations, metadata, or wrapper tags.


           <original_prompt>
             ${message}
           </original_prompt>

          `,
            },
          ],
        },
      ],
      env: context.cloudflare?.env as any,
      apiKeys,
      providerSettings,
      options: {
        system:
          'You are a senior software principal architect, you should help the user analyse the user query and enrich it with the necessary context and constraints to make it more specific, actionable, and effective. You should also ensure that the prompt is self-contained and uses professional language. Your response should ONLY contain the enhanced prompt text. Do not include any explanations, metadata, or wrapper tags.',

        /*
         * onError: (event) => {
         *   throw new Response(null, {
         *     status: 500,
         *     statusText: 'Internal Server Error',
         *   });
         * }
         */
      },
    });

    // Handle streaming errors in a non-blocking way
    (async () => {
      try {
        for await (const part of result.fullStream) {
          if (part.type === 'error') {
            const error: any = part.error;
            logger.error('Streaming error:', error);
            break;
          }
        }
      } catch (error) {
        logger.error('Error processing stream:', error);
      }
    })();

    // Return plain text stream for simpler client parsing
    return new Response(result.textStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: unknown) {
    console.log(error);

    if (error instanceof Error && error.message?.includes('API key')) {
      throw new Response('Invalid or missing API key', {
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    throw new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}
