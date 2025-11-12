# CLI Development Guidelines

## Core Rules

1. **Update `uva.1` man page** when adding/modifying commands
2. **No hardcoding** - use Commander.js introspection for commands/flags
3. **Check `src/lib/` before implementing** - utilities probably exist
4. **DRY** - extract repeated patterns into functions
5. **Run lints** - `bun run build` must pass
6. **Test your code** - `node dist/index.js [cmd]` before submitting
7. **No `as any` casts** - use Zod schemas and proper types

## Quick Reference

```typescript
// ❌ Don't hardcode
const commands = ["vm", "ssh-key", "login"];

// ✅ Extract dynamically
const commands = program.commands.map((cmd) => cmd.name());
```

## Utility Files

- `src/lib/utils.ts` - config, tokens, general utils
- `src/lib/schemas.ts` - Zod schemas
- `src/lib/theme.ts` - console formatting
- `src/lib/types.ts` - types
- `src/lib/errors.ts` - custom errors

## Testing

```bash
bun run build              # Check for errors
node dist/index.js [cmd]   # Test command
bun run build-binary       # Full binary test
```
