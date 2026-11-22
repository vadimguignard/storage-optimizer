/*
 * Cloudflare Worker — secure proxy for storage-optimizer data.
 *
 * The GitHub token is NEVER in this file or in the website. It is stored as
 * the Cloudflare secret GITHUB_TOKEN:
 *   wrangler secret put GITHUB_TOKEN
 *
 * The browser calls this Worker instead of api.github.com. The Worker adds
 * the Authorization header server-side, so no device ever sees the token.
 */

const ALLOWED_ORIGINS = new Set([
  'https://vadimguignard.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
]);

const OWNER = 'vadimguignard';
const REPO = 'storage-optimizer';
const BRANCH = 'sync';
const DATA_PATH = 'data/store.json';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Cache-Control': 'no-store'
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders(origin))
  });
}

function apiUrl(withRef) {
  const base = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${DATA_PATH}`;
  return withRef ? `${base}?ref=${encodeURIComponent(BRANCH)}` : base;
}

function githubHeaders(env) {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN secret is not configured');
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'storage-optimizer-proxy'
  };
}

function proxyResponse(upstream, origin) {
  const headers = corsHeaders(origin);
  for (const name of ['etag', 'content-type', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  // 204/304 responses must not have a body.
  const body = (upstream.status === 204 || upstream.status === 304) ? null : upstream.body;
  return new Response(body, { status: upstream.status, headers });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.has(origin)) {
      return json({ error: 'forbidden origin' }, 403, ALLOWED_ORIGINS.values().next().value);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    let headers;
    try {
      headers = githubHeaders(env);
    } catch (e) {
      return json({ error: e.message }, 500, origin);
    }

    if (request.method === 'GET') {
      const ifNoneMatch = request.headers.get('If-None-Match');
      if (ifNoneMatch) headers['If-None-Match'] = ifNoneMatch;
      try {
        const upstream = await fetch(apiUrl(true), { headers, cache: 'no-store' });
        return proxyResponse(upstream, origin);
      } catch (e) {
        return json({ error: 'GitHub read failed: ' + e.message }, 502, origin);
      }
    }

    if (request.method === 'PUT') {
      let input;
      try {
        input = await request.json();
      } catch (e) {
        return json({ error: 'invalid JSON body' }, 400, origin);
      }
      if (!input || typeof input.content !== 'string' || typeof input.message !== 'string') {
        return json({ error: 'missing content or message' }, 400, origin);
      }
      if (input.branch && input.branch !== BRANCH) {
        return json({ error: 'branch is fixed to sync' }, 400, origin);
      }

      const body = { message: input.message, content: input.content, branch: BRANCH };
      if (input.sha) body.sha = input.sha;

      try {
        const upstream = await fetch(apiUrl(false), {
          method: 'PUT',
          headers,
          body: JSON.stringify(body)
        });
        return proxyResponse(upstream, origin);
      } catch (e) {
        return json({ error: 'GitHub write failed: ' + e.message }, 502, origin);
      }
    }

    return json({ error: 'method not allowed' }, 405, origin);
  }
};
