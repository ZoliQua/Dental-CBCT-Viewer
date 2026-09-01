import { volumeLoader, setVolumesForViewports, type Types } from '@cornerstonejs/core';
import { VOLUME_ID_PREFIX } from './constants';

let volumeCounter = 0;

/**
 * Creates a streaming image volume from a list of image IDs.
 * Resolves when all frames have been loaded; rejects when any frame
 * permanently fails (Cornerstone reports `success === false` on the event).
 */
export async function createVolume(imageIds: string[]): Promise<string> {
  const volumeId = `${VOLUME_ID_PREFIX}${volumeCounter++}`;

  const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds });

  return new Promise<string>((resolve, reject) => {
    // The callback fires once when all frames have been processed
    volume.load((...args: unknown[]) => {
      const evt = args[0] as { success?: boolean; imageId?: string } | undefined;
      if (evt && evt.success === false) {
        reject(new Error(`Failed to load volume frame ${evt.imageId ?? ''} — image data could not be read`));
      } else {
        resolve(volumeId);
      }
    });
  });
}

/**
 * Sets a volume on multiple viewports at once.
 */
export async function setVolumeOnViewports(
  renderingEngine: Types.IRenderingEngine,
  volumeId: string,
  viewportIds: string[],
): Promise<void> {
  await setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds);
}
