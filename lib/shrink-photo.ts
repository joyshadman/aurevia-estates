// Shrinks a photo in the browser before upload (spec 0020): at most 2000px on
// the long side, JPEG quality 0.9, turned upright by its EXIF orientation. On
// slow connections this keeps uploads near 1 MB. The server re-encodes and
// checks everything again, so this is only a saving, never a guarantee.

const maxSide = 2000;

export async function shrinkPhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // A format this browser can't decode: let the server decide.
    return file;
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  // Keep whichever is smaller, as long as the server can read it.
  return blob && blob.size < file.size ? blob : file;
}
