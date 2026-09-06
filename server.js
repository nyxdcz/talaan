import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.static(__dirname));

const assetDirs = [
  path.join(__dirname, 'assets', 'js'),
  path.join(__dirname, 'assets', 'css'),
  path.join(__dirname, 'assets', 'js', 'ui'),
  path.join(__dirname, 'assets', 'js', 'features'),
];

for (const dir of assetDirs) {
  app.use(express.static(dir));
}

app.use((req, res, next) => {
  if (/\.(js|css|json|png|jpg|jpeg|gif|svg|ico|webmanifest|map|woff2?|ttf|eot)$/i.test(req.path)) {
    return res.status(404).type('text/plain').send('Not Found');
  }
  next();
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Talaan development server listening on http://0.0.0.0:${PORT}`);
});
