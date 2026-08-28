const mockResize = jest.fn();
const mockSaveAsync = jest.fn(async () => ({ uri: 'file:///prepared.jpg' }));
const mockRenderAsync = jest.fn(async () => ({ saveAsync: mockSaveAsync }));

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn(() => ({ resize: mockResize, renderAsync: mockRenderAsync })) },
  SaveFormat: { JPEG: 'jpeg' },
}));

import { prepareImageForInference } from '../preprocessing';

describe('camera and gallery preprocessing', () => {
  it.each(['file:///camera.jpg', 'file:///gallery.png'])('resizes %s deterministically', async (uri) => {
    await expect(prepareImageForInference(uri)).resolves.toBe('file:///prepared.jpg');
    expect(mockResize).toHaveBeenLastCalledWith({ width: 224, height: 224 });
    expect(mockSaveAsync).toHaveBeenLastCalledWith({ format: 'jpeg', compress: 1 });
  });
});
