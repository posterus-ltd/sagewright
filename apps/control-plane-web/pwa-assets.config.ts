import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the PWA icon set (192/512/maskable + apple-touch-icon) from the
// existing favicon. vite-plugin-pwa reads this config (`pwaAssets.config`) and
// injects the generated icons into the web manifest at build time.
//
// We drop the preset's `favicon.ico` output so re-running the generator never
// clobbers the existing hand-authored `public/favicon.ico`.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, favicons: undefined },
  },
  images: ['public/favicon.svg'],
});
