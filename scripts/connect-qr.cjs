// Writes a scannable PNG QR code for a link (used by start-free-test.ps1 so a
// phone can connect the app to a new tunnel address without typing it).
// Usage: node connect-qr.cjs <link> <output.png> <node_modules dir>
const path = require('path');

const [link, output, modulesDir] = process.argv.slice(2);
if (!link || !output || !modulesDir) {
  console.error('Usage: node connect-qr.cjs <link> <output.png> <node_modules dir>');
  process.exit(2);
}

// Both packages already ship with the mobile app's Expo tooling.
const { toQR } = require(path.join(modulesDir, 'toqr'));
const Jimp = require(path.join(modulesDir, 'jimp-compact'));

const modules = toQR(link);
const size = Math.round(Math.sqrt(modules.length));
const scale = 12;
const quiet = 4;
const pixels = (size + quiet * 2) * scale;

const image = new Jimp(pixels, pixels, 0xffffffff);
for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    if (!modules[y * size + x]) continue;
    for (let dy = 0; dy < scale; dy += 1) {
      for (let dx = 0; dx < scale; dx += 1) {
        image.setPixelColor(0x1d2d24ff, (x + quiet) * scale + dx, (y + quiet) * scale + dy);
      }
    }
  }
}

image.writeAsync(output).then(() => console.log(output)).catch((error) => {
  console.error(error);
  process.exit(1);
});
