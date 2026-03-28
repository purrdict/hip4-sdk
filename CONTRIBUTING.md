# Contributing to @purrdict/hip4

Thanks for your interest in contributing to the HIP-4 prediction market SDK.

## Getting Started

```bash
git clone https://github.com/purrdict/hip4-sdk.git
cd hip4-sdk
bun install
bun test
```

## Development

The SDK is a pure TypeScript knowledge layer — no network I/O, no React, no side effects. It provides types, helpers, and pure functions for building on Hyperliquid HIP-4.

### Project Structure

```
src/
  index.ts       Barrel exports
  types.ts       Core types, constants, helpers
  markets.ts     Market discovery, parsing, min shares
  pricing.ts     Tick size, price formatting (5 sig figs)
  orders.ts      Order action construction
tests/
  markets.test.ts
  pricing.test.ts
  orders.test.ts
```

### Running Tests

```bash
bun test              # all tests
bun test tests/pricing.test.ts  # single file
```

### Type Checking

```bash
bunx tsc --noEmit
```

## Pull Request Guidelines

1. **Fork and branch** — create a feature branch from `main`
2. **Keep it focused** — one feature or fix per PR
3. **Add tests** — every new function needs tests
4. **No breaking changes** without discussion — open an issue first
5. **Type-safe** — `bunx tsc --noEmit` must pass with zero errors
6. **All tests pass** — CI runs automatically on your PR

### What We Accept

- New HIP-4 helpers (market parsing, price formatting, order construction)
- Bug fixes with test cases that reproduce the issue
- Documentation improvements
- Type improvements

### What We Don't Accept

- Network I/O or API clients (use `@nktkas/hyperliquid` for that)
- React hooks or UI code (that belongs in `@purrdict/hip4-ui`)
- Dependencies — this package has zero runtime deps by design

## Code Style

- TypeScript strict mode
- Pure functions where possible
- JSDoc on every exported function
- Descriptive variable names over comments

## Questions?

Open an issue or reach out on [Discord](https://discord.gg/DV8CmHkbzk) or [@hypurrdict](https://x.com/hypurrdict) on X.
