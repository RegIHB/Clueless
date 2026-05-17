import imglyRemoveBackground from '@imgly/background-removal';

export async function removeBackground(imageFile: File | Blob): Promise<Blob> {
  try {
    return await imglyRemoveBackground(imageFile, {
      output: { format: 'image/png' },
    });
  } catch (error) {
    console.warn('Background removal failed; using original image.', error);
    return imageFile;
  }
}
