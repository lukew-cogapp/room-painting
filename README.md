# Room Painting

Try wall colours on a photo of your room. Everything runs in the browser: the
photo is never uploaded.

## How it works

1. **Load a photo.** Decoded locally and scaled to 1600px on the long edge.
2. **Correct the white balance.** Click something that should be neutral grey,
   or use the temperature and tint sliders.
3. **Select the wall.** "Detect walls automatically" runs SegFormer-B0
   (ADE20K, ~4 MB quantised) in a worker and takes the `wall` class. The magic
   wand and brush are there to fix whatever it misses.
4. **Pick colours** with the native colour input or the eyedropper.
5. **Generate.** Each colour is composited keeping the original pixel's
   luminance, so shadows and texture survive. Download any version as a PNG.

The segmentation model is fetched on first use, not on page load, so the app
costs ~70 kB gzipped if you only ever use the wand and brush.

## Development

```sh
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
```

Deploys to GitHub Pages from `main` via `.github/workflows/deploy.yml`.
