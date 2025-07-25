# UVACompute

## Setup

```
pnpm i
vc link --repo
vc env pull --cwd apps/site # optional, pull preview/production with --environment=[preview|production]
```

## Run

```
pnpm dev
```

## Build & Deploy

- `apps/site` is a Next.js app that is deployed automatically to Vercel
- `apps/cli` is a CLI application with bun that is built with `build-binary`.
