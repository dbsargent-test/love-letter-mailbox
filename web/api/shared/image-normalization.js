const sharp = require("sharp");

const MAX_IMAGE_WIDTH = 216;
const MAX_IMAGE_HEIGHT = 160;
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const JPEG_QUALITY = 78;
const NORMALIZER_VERSION = 1;

async function normalizeMessagePhoto(input) {
  if (!Buffer.isBuffer(input) || input.length === 0) {
    throw new Error("Photo data is empty");
  }
  if (input.length > MAX_INPUT_BYTES) {
    throw new Error(`Photo exceeds ${MAX_INPUT_BYTES} bytes`);
  }

  const { data, info } = await sharp(input, {
    failOn: "warning",
    limitInputPixels: 40_000_000,
  })
    .rotate()
    .resize({
      width: MAX_IMAGE_WIDTH,
      height: MAX_IMAGE_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: JPEG_QUALITY,
      chromaSubsampling: "4:2:0",
      progressive: false,
    })
    .toBuffer({ resolveWithObject: true });

  if (!info.width || !info.height ||
      info.width > MAX_IMAGE_WIDTH || info.height > MAX_IMAGE_HEIGHT) {
    throw new Error("Normalized photo dimensions are invalid");
  }

  return {
    data,
    width: info.width,
    height: info.height,
    size: data.length,
    version: NORMALIZER_VERSION,
  };
}

module.exports = {
  JPEG_QUALITY,
  MAX_IMAGE_HEIGHT,
  MAX_IMAGE_WIDTH,
  MAX_INPUT_BYTES,
  NORMALIZER_VERSION,
  normalizeMessagePhoto,
};
