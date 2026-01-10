// Wrapper para capturar errores durante la inicialización del módulo
console.log("[Wrapper] Starting module load...");

try {
  console.log("[Wrapper] Requiring index.js...");
  const app = require("./index.js");
  console.log("[Wrapper] ✅ Module loaded successfully");
  module.exports = app;
} catch (error) {
  console.error("[Wrapper] ❌ CRITICAL ERROR loading module:", error.message);
  console.error("[Wrapper] Error name:", error.name);
  console.error("[Wrapper] Error code:", error.code);
  console.error("[Wrapper] Error stack:", error.stack);
  
  // Exportar un app mínimo que muestre el error
  const express = require("express");
  const errorApp = express();
  
  errorApp.use((req, res) => {
    res.status(500).json({
      error: "Server initialization failed",
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  });
  
  module.exports = errorApp;
}



