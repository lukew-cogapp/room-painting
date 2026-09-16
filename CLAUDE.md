# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev        # user runs this, not Claude
npm run lint       # biome check .
npm run format     # biome check --write .
npm run typecheck  # tsc -b --noEmit
npm run build      # tsc -b && vite build
```

There is no test framework. Verify image and colour maths by writing a script
that imports the real module and prints numbers, or by rendering a PNG and
looking at it. `scripts/preview-recolour.ts` is the worked example: it runs the
production `shadePixel` over a real photo at several settings so the output can
be judged by eye rather than asserted about in the abstract.

```sh
npx tsx scripts/preview-recolour.ts <photo.jpg> '#29a3d9' <out-dir>
```

Lefthook runs biome and `tsc -b --noEmit` on pre-commit. Both must pass.

## Architecture

A single-page image editor. No backend, no uploads: the photo is decoded to
`ImageData` in the browser and every pass is a loop over that buffer.

**The pipeline is a chain of `ImageData` transforms**, all driven from `App.tsx`:

```
file -> ImageData -> applyWhiteBalance -> mask selection -> recolour -> variants
                     (whiteBalance.ts)   (mask.ts)         (mask.ts +
                                                            colour.ts)
```

`corrected` (white-balanced) is the base for everything downstream. `original`
is kept because the grey-point picker must sample it, not `corrected` — reading
the corrected pixel folds the sliders into the gains and cancels them.

### The three lib modules carry the real logic

- **`colour.ts`** — `shadePixel` is the core of the product. It repaints a pixel
  to a target colour while keeping the source pixel's shading, and desaturates
  as the pixel brightens. That desaturation is not cosmetic: without it,
  multiplicative scaling holds the target's channel ratios at every luma, a
  vivid colour stays fully saturated in the darkest corner, and the wall reads
  as flat plastic. Real surfaces wash out toward the light.
- **`mask.ts`** — flood fill, brush, feather, `thresholdConfidence`, and
  `recolour`. A mask is a `Uint8Array` of per-pixel alpha, one byte per pixel,
  not per RGBA group.
- **`whiteBalance.ts`** — the grey point (`gains`) and the temp/tint sliders are
  separate corrections that multiply together in `combinedGains`. Both pivot on
  green so they do not fight over exposure.

### Segmentation

`segment.worker.ts` runs SegFormer-B0 (ADE20K) via transformers.js in a worker.
It returns **per-pixel `P(wall)`, not a binary mask** — the softmax is kept so
the sensitivity slider can re-threshold on the main thread without re-running
inference. Upsampling to photo resolution is bilinear because the field is
continuous.

The worker chunk is what pulls in the ~27 MB ONNX runtime, so it must stay out
of the main entry's import graph. `useSegmenter` constructs the `Worker` lazily
on first detect. After changing imports, confirm the main bundle is still clean:

```sh
grep -c "ort-wasm\|onnxruntime" dist/assets/index-*.js   # must be 0
```

Model download progress arrives through `progress_callback`; the runtime WASM
fetch reports no bytes, so that phase shows an elapsed timer instead of a bar.

### Mask mutation and repaints

Masks are mutated in place, never replaced, because a brush drag fires on every
pointermove and copying megabytes per event would stutter. React therefore sees
an unchanged reference and skips the repaint. `maskVersion` is the counter that
forces it, and `EditorCanvas` depends on it with a `biome-ignore` for
`useExhaustiveDependencies`. Removing that dependency silently breaks the wand,
brush and erase tools.

## Conventions

- Arrow functions throughout, including components.
- Biome v2 for lint and format, never ESLint or Prettier. Fix what it reports
  rather than suppressing, except where a suppression carries a reason (see
  above). Biome only honours a **single-line** `biome-ignore` comment.
- Tailwind v4 via `@tailwindcss/vite`, configured in `src/index.css`.

## Deployment

GitHub Pages from `main` via `.github/workflows/deploy.yml`, published at
https://lukew-cogapp.github.io/room-painting/. `vite.config.ts` sets `base` to
`/room-painting/` only when `GITHUB_ACTIONS` is set, so dev stays at root.
Pages is configured with `build_type: workflow`, not a branch source.
