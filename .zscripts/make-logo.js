const sharp = require("sharp");
const path = require("path");

const SRC = path.join(__dirname, "..", "public", "7trendz logo.jpg");
const OUT = path.join(__dirname, "..", "public", "logo.png");

async function main() {
  const img = sharp(SRC).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // Corner sample = background colour (the logo sits on a flat white plate).
  const bg = [data[0], data[1], data[2]];
  const tol = 38;

  let minX = width, minY = height, maxX = 0, maxY = 0;
  let found = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const dr = data[i] - bg[0];
      const dg = data[i + 1] - bg[1];
      const db = data[i + 2] - bg[2];
      if (Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)) <= tol) continue;
      found = true;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (!found) throw new Error("Could not detect logo bounds — image may be blank.");

  // 2px breathing room so anti-aliased edges survive the crop.
  const pad = 2;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const width2 = Math.min(width - left, maxX - minX + 1 + pad * 2);
  const height2 = Math.min(height - top, maxY - minY + 1 + pad * 2);

  // Force a square canvas centred on the bbox. The mark is circular, so a
  // square keeps it undistorted in square containers; stray soft shadows can
  // otherwise skew the detected bounds off-square.
  const side = Math.min(Math.max(width2, height2), width, height);
  const cx = left + width2 / 2;
  const cy = top + height2 / 2;
  const sqLeft = Math.round(Math.max(0, Math.min(width - side, cx - side / 2)));
  const sqTop = Math.round(Math.max(0, Math.min(height - side, cy - side / 2)));
  const sqSide = Math.min(side, width - sqLeft, height - sqTop);

  const raw = Buffer.from(data);
  const out = Buffer.alloc(sqSide * sqSide * 4);

  for (let y = 0; y < sqSide; y++) {
    for (let x = 0; x < sqSide; x++) {
      const si = ((y + sqTop) * width + (x + sqLeft)) * channels;
      const di = (y * sqSide + x) * 4;
      const dr = raw[si] - bg[0];
      const dg = raw[si + 1] - bg[1];
      const db = raw[si + 2] - bg[2];
      const dist = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db));

      // Soft alpha ramp across the tolerance band -> no white fringe in dark mode.
      const a = Math.min(255, Math.round((dist / tol) * 255));
      out[di] = raw[si];
      out[di + 1] = raw[si + 1];
      out[di + 2] = raw[si + 2];
      out[di + 3] = a;
    }
  }

  await sharp(out, { raw: { width: sqSide, height: sqSide, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(OUT);

  console.log(
    `bg=${bg} bbox=${left},${top} ${width2}x${height2} square=${sqLeft},${sqTop} ${sqSide}x${sqSide} -> ${OUT}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
