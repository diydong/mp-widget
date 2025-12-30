import express from "express";
import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8888;

app.get("/render/top7.png", async (req, res) => {
  // 1️⃣ MP 的业务 token（必须）
  const mpToken = req.query.token;
  if (!mpToken) {
    return res.status(400).send("missing mp token");
  }

  // 2️⃣ Docker 环境变量
  const MP_BASE_URL = process.env.MP_BASE_URL;
  const TMDB_KEY = process.env.TMDB_KEY;

  if (!MP_BASE_URL || !TMDB_KEY) {
    return res.status(500).send("env not configured");
  }

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--ignore-certificate-errors"
      ]
    });

    const page = await browser.newPage();

    // 页面日志（可保留，方便排错）
    page.on("console", msg =>
      console.log("PAGE LOG:", msg.type(), msg.text())
    );
    page.on("pageerror", err =>
      console.error("PAGE ERROR:", err.message)
    );

    // ⭐ 在页面 JS 执行前注入 ENV
    await page.evaluateOnNewDocument((env) => {
      window.__ENV__ = env;
    }, {
      MP_BASE_URL,
      MP_TOKEN: mpToken,
      TMDB_KEY
    });

    const fileUrl =
      "file://" + path.join(__dirname, "page.html");

    await page.goto(fileUrl, {
      waitUntil: "domcontentloaded"
    });

    // 等前端渲染完成
    await page.waitForFunction(
      () => window.__RENDER_DONE__ === true,
      { timeout: 30000 }
    );

    const buffer = await page.screenshot({ type: "png" });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "max-age=300");
    res.send(buffer);

  } catch (e) {
    console.error("RENDER FAILED:", e);
    res.status(500).send("render error");
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(PORT, () => {
  console.log("render service on :" + PORT);
});
