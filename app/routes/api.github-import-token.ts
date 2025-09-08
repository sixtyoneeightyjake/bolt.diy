import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createClerkClient, verifyToken } from '@clerk/backend';

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const env: any = (context as any)?.cloudflare?.env || process.env;
    const secretKey = env?.CLERK_SECRET_KEY;

    if (!secretKey) {
      return json({ error: 'Server auth misconfigured (no CLERK_SECRET_KEY)' }, { status: 500 });
    }

    // Verify the Clerk session token to identify the user
    const payload = await verifyToken(token, { secretKey });
    const userId = (payload as any)?.sub as string | undefined;

    if (!userId) {
      return json({ error: 'Invalid or missing user' }, { status: 401 });
    }

    const clerk = createClerkClient({ secretKey });

    // Fetch the GitHub OAuth access token from Clerk for this user
    const result = await clerk.users.getUserOauthAccessToken(userId, 'github');

    // This endpoint returns paginated results; pick the most recent token
    const tokens = (result as any)?.data || [];
    const ghToken = tokens[0]?.token as string | undefined;

    if (!ghToken) {
      return json({ error: 'No GitHub OAuth token found for user' }, { status: 404 });
    }

    // Return token to the client; client will persist via existing store methods
    return json({ token: ghToken });
  } catch (err: any) {
    const message = err?.errors?.[0]?.message || err?.message || 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
