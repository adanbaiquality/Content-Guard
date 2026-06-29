import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';

const app = new Hono();

const clientSecret = process.env.CLIENT_SECRET || '';
const apiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';
const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:3000';
const managementToken = process.env.STORYBLOK_MANAGEMENT_TOKEN;

app.use(
	'/api/*',
	cors({
		origin: webOrigin,
		credentials: true,
	}),
);

app.get('/api/health', (c) => {
	return c.json({ ok: true, service: '@content-guard/api' });
});

app.get('/api/example', async (c) => {
	const token = c.req.header('sb_app_bridge_token');
	if (!token || !clientSecret) {
		return c.json({ verified: false }, 200);
	}

	try {
		jwt.verify(token, clientSecret);
		return c.json({ verified: true }, 200);
	} catch {
		return c.json({ verified: false }, 200);
	}
});

app.get('/api/user_info', async (c) => {
	if (!managementToken) {
		return c.json(
			{
				error:
					'No STORYBLOK_MANAGEMENT_TOKEN found. Set it in .env to enable user_info.',
			},
			401,
		);
	}

	const response = await fetch('https://api.storyblok.com/oauth/user_info', {
		headers: {
			Authorization: `Bearer ${managementToken}`,
		},
	});

	if (!response.ok) {
		return c.json({ error: `Storyblok responded with ${response.status}` }, 502);
	}

	return c.json(await response.json(), 200);
});

app.post('/api/_app_bridge', async (c) => {
	const body = await c.req.json<{ token?: string }>().catch(() => ({}));
	const token = body.token;

	if (!token || !clientSecret) {
		return c.json({ ok: false, error: 'Missing token or CLIENT_SECRET' }, 400);
	}

	try {
		const result = jwt.verify(token, clientSecret);
		return c.json({ ok: true, result }, 200);
	} catch (error) {
		return c.json({ ok: false, error: String(error) }, 200);
	}
});

app.post('/api/_oauth', async (c) => {
	const body = await c.req.json<{ initOAuth?: boolean }>().catch(() => ({}));
	return c.json({
		ok: false,
		initOAuth: !!body.initOAuth,
		redirectTo: `${apiOrigin}/api/connect/storyblok`,
	});
});

app.all('/api/connect/*', (c) => {
	return c.json(
		{
			ok: false,
			error:
				'OAuth callback handling has moved to Hono, but provider integration is not yet configured in this route.',
		},
		501,
	);
});

const port = Number(process.env.API_PORT || 8787);
console.log(`@content-guard/api listening on http://localhost:${port}`);

serve({ fetch: app.fetch, port });