export const MAX_SAVED_IMAGE_EDGE = 1_600;

export type ImageDimensions = {
  width: number;
  height: number;
};

export function getHistoryResize(
  dimensions: ImageDimensions | null,
): { width: number } | { height: number } | null {
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return null;
  }

  if (Math.max(dimensions.width, dimensions.height) <= MAX_SAVED_IMAGE_EDGE) {
    return null;
  }

  return dimensions.width >= dimensions.height
    ? { width: MAX_SAVED_IMAGE_EDGE }
    : { height: MAX_SAVED_IMAGE_EDGE };
}
