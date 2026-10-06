import type { ImageSourcePropType } from 'react-native';

/**
 * Article photos shipped with the app (WebP, credited in library-articles.json),
 * so the library shows them offline from the first launch. Keep this list in
 * step with backend/database/data/library-images.
 */
export const BUNDLED_LIBRARY_IMAGES: Record<string, ImageSourcePropType> = {
  'sigatoka-leaf-half-spotted.webp': require('./images/sigatoka-leaf-half-spotted.webp'),
  'sigatoka-streaks-closeup.webp': require('./images/sigatoka-streaks-closeup.webp'),
  'cordana-edge-lesion.webp': require('./images/cordana-edge-lesion.webp'),
  'panama-stem-streaks.webp': require('./images/panama-stem-streaks.webp'),
  'bagged-bunches-panabo.webp': require('./images/bagged-bunches-panabo.webp'),
  'fruit-bag-closeup.webp': require('./images/fruit-bag-closeup.webp'),
};
