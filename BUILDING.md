# Development

Run the dev server without env validation or auth:

```bash
SKIP_ENV_VALIDATION=1 npm run dev
```

This skips environment variable validation and the sign-in screen, useful for local development without credentials.

# Release

When building for release, make sure `node-pty` is built for the correct architecture with `npm run install:deps`, then run `npm run release`.

# Linux (AppImage) local build

```bash
npm run clean:dev
npm run compile:app
npm run package -- --publish never --config electron-builder.ts
```

Expected outputs in `release/`:

- `*.AppImage`
- `*-linux.yml` (Linux auto-update manifest)

# Linux auto-update verification (local)

After packaging:

```bash
ls -la release/*.AppImage
ls -la release/*-linux.yml
```

If both files exist, packaging produced the Linux artifact + updater metadata that `electron-updater` expects.
