import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import type { CampaignFormat } from "../types.js";
import { fitImageToCanvas, imageDimensions, imageRequestSize, imageFramingInstruction } from "../services/imageCanvasService.js";

const formats: CampaignFormat[] = ["1:1", "4:5", "9:16", "16:9"];
for (const format of formats) {
  test(`${format}: proporção nativa correta e sem borda branca no formato legado`, async () => {
    const { width, height } = imageDimensions(format);
    const [nativeWidth, nativeHeight] = imageRequestSize(format, "gpt-image-2").split("x").map(Number);
    assert.equal(nativeWidth * height, nativeHeight * width);
    assert.equal(nativeWidth % 16, 0);
    assert.equal(nativeHeight % 16, 0);
    assert.ok(nativeWidth * nativeHeight >= 655360);
    const [legacyWidth, legacyHeight] = imageRequestSize(format, "gpt-image-1").split("x").map(Number);
    for (const [sourceWidth, sourceHeight] of [[nativeWidth, nativeHeight], [legacyWidth, legacyHeight]]) {
      const source = await sharp({ create: { width: sourceWidth, height: sourceHeight, channels: 3, background: "#205b38" } }).png().toBuffer();
      const output = await fitImageToCanvas(source, format);
      const pixels = await sharp(output).raw().toBuffer({ resolveWithObject: true });
      assert.equal(pixels.info.width, width);
      assert.equal(pixels.info.height, height);
      for (const [x, y] of [[0, 0], [width-1, 0], [0, height-1], [width-1, height-1], [0, Math.floor(height/2)], [width-1, Math.floor(height/2)]]) {
        const offset = (y * width + x) * pixels.info.channels;
        assert.deepEqual([...pixels.data.subarray(offset, offset+3)], [32, 91, 56]);
      }
    }
  });
}

test("proporção nativa preserva marcadores nas bordas laterais, sem cortar", async () => {
  const source = Buffer.from('<svg width="1024" height="1280"><rect width="1024" height="1280" fill="#205b38"/><rect x="0" y="0" width="40" height="1280" fill="red"/><rect x="984" y="0" width="40" height="1280" fill="blue"/></svg>');
  const pixels = await sharp(await fitImageToCanvas(source, "4:5")).removeAlpha().raw().toBuffer();
  const left = 675 * 1080 * 3;
  const right = (675 * 1080 + 1079) * 3;
  assert.deepEqual([...pixels.subarray(left, left+3)], [255, 0, 0]);
  assert.deepEqual([...pixels.subarray(right, right+3)], [0, 0, 255]);
});

test("área segura considera o corte legado sem proibir o branco da marca", () => {
  const prompt = imageFramingInstruction("4:5", "gpt-image-1");
  assert.match(prompt, /14% do topo/);
  assert.match(prompt, /Branco como parte intencional/);
  assert.match(prompt, /Não copie faixas externas/);
  assert.match(imageFramingInstruction("4:5", "gpt-image-2"), /5% do topo/);
});
