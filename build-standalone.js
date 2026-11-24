const fs = require('node:fs');
const path = require('node:path');

function readEnvKey() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return '15d2ea6d0dc1d476efbca3eba2b9bbfb';
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    if (line.slice(0, eq).trim() === 'TMDB_API_KEY') {
      return line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return '15d2ea6d0dc1d476efbca3eba2b9bbfb';
}

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'css/design-system.css'), 'utf8');
const apiJs = fs.readFileSync(path.join(__dirname, 'js/api.js'), 'utf8');
const dataJs = fs.readFileSync(path.join(__dirname, 'js/discover-data.js'), 'utf8');
const coreJs = fs.readFileSync(path.join(__dirname, 'js/app-core.js'), 'utf8');
const discoverJs = fs.readFileSync(path.join(__dirname, 'js/discover.js'), 'utf8');

const tmdbKey = readEnvKey();

const bundled = html
  .replace('<link rel="stylesheet" href="css/design-system.css">', `<style>\n${css}\n    </style>`)
  .replace(
    `<script src="js/api.js"></script>\n    <script src="js/discover-data.js"></script>\n    <script src="js/app-core.js"></script>\n    <script src="js/discover.js"></script>`,
    `<script>\nwindow.__NF_FORCE_STANDALONE__ = true;\nwindow.__NF_STANDALONE_KEY__ = ${JSON.stringify(tmdbKey)};\n</script>\n    <script>\n${apiJs}\n    </script>\n    <script>\n${dataJs}\n    </script>\n    <script>\n${coreJs}\n    </script>\n    <script>\n${discoverJs}\n    </script>`
  );

const outPath = path.join(__dirname, 'netfilla-standalone.html');
fs.writeFileSync(outPath, bundled, 'utf8');
console.log(`Built standalone bundle: ${outPath} (${bundled.length} bytes)`);
