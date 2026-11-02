// Photos are shrunk on the device before upload: a 240px thumbnail for lists
// and a ~1280px JPEG under ~600 KB for the full view. Re-encoding through a
// canvas also strips EXIF data such as the GPS location the photo was taken at.
const MAX_FULL_CHARS = 820000; // stays under the 900 KB limit in firestore.rules
const ACCEPTED = /^image\/(jpeg|png|webp|heic|heif|gif)$/i;
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

async function loadImage(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file); } catch { /* fall back to <img> below */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function toJpeg(img, max, quality) {
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function preparePhoto(file) {
  if (!file || (file.type && !ACCEPTED.test(file.type)) || file.size > MAX_INPUT_BYTES) {
    throw new Error("unsupported-photo");
  }
  const img = await loadImage(file);
  let quality = 0.72;
  let size = 1280;
  let full = toJpeg(img, size, quality);
  while (full.length > MAX_FULL_CHARS && quality > 0.3) {
    quality -= 0.12;
    size = Math.max(800, size - 160);
    full = toJpeg(img, size, quality);
  }
  const thumb = toJpeg(img, 240, 0.6);
  return { full, thumb };
}

// Only images we produced ourselves are ever shown
export const isSafeImageData = (src) => typeof src === "string" && src.startsWith("data:image/jpeg;base64,");
