# Room Painting

Try wall colours on a photo of your room. Everything runs in the browser: the
photo is never uploaded.

**https://lukew-cogapp.github.io/room-painting/**

## How it works

1. **Load a photo.** Drop it, paste it, or pick a file. Decoded locally and
   scaled to 1600px on the long edge.
2. **Correct the white balance.** Click something that should be neutral grey,
   or use the temperature and tint sliders. The grey point and the sliders are
   separate corrections that multiply together.
3. **Select the wall.** "Detect walls automatically" runs SegFormer-B0
   (ADE20K, ~4 MB quantised) in a worker and keeps the per-pixel probability of
   the `wall` class, so the sensitivity slider re-thresholds without running the
   model again. The magic wand and brush fix whatever it misses.
4. **Pick colours** with the native colour input or the eyedropper.
5. **Generate.** Each colour keeps the original pixel's luminance and
   desaturates as the pixel brightens, so shadows and texture survive instead of
   reading as flat fill. The realism slider controls how much. Download any
   version as a PNG, or the whole set as one comparison sheet.

The segmentation model is fetched on first use, not on page load, so the app
costs ~75 kB gzipped if you only ever use the wand and brush.

## Development

```sh
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
```

Deploys to GitHub Pages from `main` via `.github/workflows/deploy.yml`.
