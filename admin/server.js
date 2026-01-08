// Servidor HTTP simple para el panel de administración
// Ejecuta: node server.js
// Luego abre: http://localhost:8000/login.html

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8000;
const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".woff": "application/font-woff",
  ".ttf": "application/font-ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".otf": "application/font-otf",
  ".wasm": "application/wasm",
};

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  // Parsear URL
  let filePath = "." + req.url;
  if (filePath === "./") {
    filePath = "./login.html";
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || "application/octet-stream";

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<h1>404 - File Not Found</h1>", "utf-8");
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`, "utf-8");
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ Admin server running on http://localhost:${PORT}`);
  console.log(`📝 Login: http://localhost:${PORT}/login.html`);
  console.log(`📝 Admin Panel: http://localhost:${PORT}/admin.html`);
  console.log(`\n⚠️  Press Ctrl+C to stop the server\n`);
});

