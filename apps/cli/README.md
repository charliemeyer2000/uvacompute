# uvacompute CLI

## Development

```bash
bun install
bun run dev
bun run index.ts login
```

## Building

### Development Build

```bash
# Uses http://localhost:3000
bun run build
bun run build-binary
```

### Production Build

```bash
# Uses https://uvacompute.com
bun run build:prod
bun run build-binary:prod
```

## Environment Variables

- `NODE_ENV`: `"production"` uses https://uvacompute.com, otherwise uses localhost
- `SITE_URL`: Overrides the base URL for any environment

## Priority Order

1. `SITE_URL` environment variable (highest priority)
2. `NODE_ENV=production` → https://uvacompute.com
3. Default → http://localhost:3000 (lowest priority)
