import { RequestContext } from '@mastra/core/request-context';

// Match the pinned Mastra server's reserved keys. Application keys are merged
// from the client body before application middleware and the chat handler run.
const reservedKeys = new Set([
  'mastra__resourceId', 'mastra__threadId', 'mastra__user',
  'mastra__userPermissions', 'mastra__userRoles', 'mastra__authToken',
  'mastra__isStudio', 'mastra__authMode',
]);

export async function clientRequestContext(request: Request): Promise<RequestContext> {
  let clientContext: unknown;
  if (request.method === 'GET') {
    const encoded = new URL(request.url).searchParams.get('requestContext');
    if (encoded) {
      try { clientContext = JSON.parse(encoded); }
      catch { clientContext = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')); }
    }
  } else {
    clientContext = (await request.clone().json()).requestContext;
  }
  return new RequestContext(Object.entries(clientContext ?? {})
    .filter(([key]) => !reservedKeys.has(key)));
}
