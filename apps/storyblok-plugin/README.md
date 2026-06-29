# Storyblok Plugin Dev Tunnel Notes

Use this file after restarting your PC to quickly get the plugin tunnel back.

## Current tunnel (as of 2026-06-29)

- Tunnel ID: `majestic-lake-8cz1g5j.euw`
- Public URL (port 3000): `https://rmjmlk6v-3000.euw.devtunnels.ms/`
- Local app port: `3000`
- Tunnel expiration: `30 days`

## Check existing tunnels

```bash
devtunnel list
devtunnel show majestic-lake-8cz1g5j.euw
```

## Start local app

```bash
cd /Users/abdel/Projects/Content-Guard/apps/storyblok-plugin
pnpm dev
```

## If tunnel is not running after restart

1. Sign in if needed:

```bash
devtunnel user login
```

2. Reuse existing tunnel (if it still exists):

```bash
devtunnel host majestic-lake-8cz1g5j.euw
```

3. If needed, create a new tunnel and expose port 3000:

```bash
devtunnel create --allow-anonymous --port 3000
devtunnel host
```

4. Copy the new `https://...devtunnels.ms` URL and update Storyblok plugin settings.

## Quick recovery checklist

1. Run `pnpm dev` in this folder.
2. Run `devtunnel list`.
3. Run `devtunnel show <tunnel-id>` and copy the HTTPS URL for port `3000`.
4. Verify plugin callbacks/settings point to the current tunnel URL.
