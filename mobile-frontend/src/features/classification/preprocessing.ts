import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export const MODEL_INPUT = Object.freeze({ width: 224, height: 224, channels: 3 });

export async function prepareImageForInference(imageUri: string): Promise<string> {
  if (!imageUri) throw new Error('An image URI is required.');
  const context = ImageManipulator.manipulate(imageUri);
  context.resize({ width: MODEL_INPUT.width, height: MODEL_INPUT.height });
  const rendered = await context.renderAsync();
  const prepared = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
  return prepared.uri;
}
