// One-shot server patch: alias the electron-updater yml feed under /update/win/
// (the shipped 0.3.2 client requests latest.yml from its feed URL, which points
// at /update/win/, while the route only served /win/latest.yml).
const fs = require('fs');
const f = '/opt/lx-dsh-update/server/routes/updater.js';
let s = fs.readFileSync(f, 'utf8');
const anchor = "// electron-updater Windows: /win/latest.yml";
if (s.includes("'/update/:platform/latest.yml'")) {
  console.log('already patched');
  process.exit(0);
}
if (!s.includes(anchor)) { console.log('ANCHOR NOT FOUND'); process.exit(1) }
// Implement the alias by delegating to the existing handler: re-issue the same
// request against the /:platform/latest.yml route with the platform param set.
const alias = [
  "// Alias: the shipped 0.3.2 feed URL requests latest.yml under /update/win/,",
  "// while the original route only served /win/latest.yml. Serve both paths.",
  "router.get('/update/:platform/latest.yml', (req, res) => {",
  "  const platformMap = { win: 'win', mac: 'mac', linux: 'linux' };",
  "  const platform = platformMap[req.params.platform];",
  "  if (!platform) return res.status(404).send('unknown platform');",
  "  req.params.platform = platform;",
  "  req.url = '/' + platform + '/latest.yml';",
  "  return router.handle(req, res);",
  "});",
  "",
  '',
].join('\n');
s = s.replace(anchor, alias + anchor);
fs.writeFileSync(f, s, 'utf8');
console.log('patched');
