// gzip-build.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function gzipFile(file) {
  const data = fs.readFileSync(file);
  const compressed = zlib.gzipSync(data);
  fs.writeFileSync(file + ".gz", compressed);
  console.log("Compressed:", file, "->", file + ".gz");
}

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(file => {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);
    if (stat.isDirectory()) {
      walkDir(filepath, callback);
    } else {
      callback(filepath);
    }
  });
}

const buildDir = path.resolve(__dirname, "dist"); // Vite outputs to "dist" by default
const exts = [".html", ".js", ".css"];

walkDir(buildDir, (filepath) => {
  if (exts.includes(path.extname(filepath))) {
    gzipFile(filepath);
  }
});
