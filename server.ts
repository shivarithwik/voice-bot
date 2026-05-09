import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, ".data");
const LOG_FILE = path.join(DATA_DIR, "logs.json");

// AI Setup
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Ensure data directory exists
const ensureDataDir = async () => {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (e) {
    // Ignore error if it exists
  }
};
ensureDataDir();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Save logs
  app.post("/api/logs", async (req, res) => {
    try {
      const { user, bot, timestamp } = req.body;
      let logs = [];
      try {
        const data = await fs.readFile(LOG_FILE, "utf-8");
        logs = JSON.parse(data);
      } catch (e) {
        // File doesn't exist yet or is empty
      }
      logs.push({ user, bot, timestamp });
      await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2));
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to save logs:", error);
      res.status(500).json({ error: "Failed to save logs" });
    }
  });

  // API Route: Get logs
  app.get("/api/logs", async (req, res) => {
    try {
      const data = await fs.readFile(LOG_FILE, "utf-8");
      res.json(JSON.parse(data));
    } catch (e) {
      res.json([]);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
