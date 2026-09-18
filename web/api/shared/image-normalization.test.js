const assert = require("node:assert/strict");
const test = require("node:test");
const sharp = require("sharp");
const {
  MAX_IMAGE_HEIGHT,
  MAX_IMAGE_WIDTH,
  normalizeMessagePhoto,
} = require("./image-normalization");

async function createImage(width, height) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 40, b: 200 },
    },
  }).png().toBuffer();
}

test("landscape photos retain their aspect ratio", async () => {
  const result = await normalizeMessagePhoto(await createImage(1200, 900));
  assert.deepEqual(
    { width: result.width, height: result.height },
    { width: 213, height: MAX_IMAGE_HEIGHT }
  );
});

test("portrait photos retain their aspect ratio", async () => {
  const result = await normalizeMessagePhoto(await createImage(900, 1200));
  assert.deepEqual(
    { width: result.width, height: result.height },
    { width: 120, height: MAX_IMAGE_HEIGHT }
  );
});

test("small photos are not enlarged", async () => {
  const result = await normalizeMessagePhoto(await createImage(100, 75));
  assert.deepEqual(
    { width: result.width, height: result.height },
    { width: 100, height: 75 }
  );
});
