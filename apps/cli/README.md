# uvacompute CLI

## API

### Buy/Create

`uva vm create`: create vm

- `--hours / -h` (number): hours to buy for
- `--days / -d` (number): days to buy for
- `--name / n` (string): name of your vm
- `--gpus` (number): number of gpus (currently {0, 1})
- `--gpu-type` (string): gpu type (currently only 5090)

`uva k8s create`: create vcluster

- `--hours / -h` (number): hours to buy for
- `--days / -d` (number): days to buy for
- `--name / n` (string): name of your vm
- `--gpus` (number): number of gpus (currently {0, 1})
- `--gpu-type` (string): gpu type (currently only 5090)

`uva job run [image url]`:

- `--gpus` (number): number of gpus (currently {0, 1})
- `--gpu-type` (string): gpu type (currently only 5090)
- `--env` (key-value pairs): environment variables

### List

`uva [vm|k8s] list`:

- `--json`: json output

`uva job list`:

- `--[all|completed|active]`: flag for filtering
- `--json`: json output

### Lifecycle

`uva [vm|k8s|job] stop [id]`: stop early

`uva [vm|k8s] extend [id]`: extend vm/cluster

- `--hours / -h` (number): hours to buy for
- `--days / -d` (number): days to buy for

### Access Helpers

`uva vm ssh [id]`: prints ssh command/opens session

`uva cluster kubeconfig [id]`: write kubeconfig to file and echoes path

### Price Quotes

`uva price quote [job|vm|k8s]`:

- `--hours / -h` (number): hours to buy for
- `--days / -d` (number): days to buy for
- `--name / n` (string): name of your vm
- `--gpus` (number): number of gpus (currently {0, 1})
- `--gpu-type` (string): gpu type (currently only 5090)
- `--max-seconds` (number): for a `job` only, calculate price for max seconds since its charged per second.

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
