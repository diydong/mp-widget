import express from "express";
import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8888;

/**
 * 1 小时图片缓存（内存）
 * key: mpToken
 * value: { buffer: Buffer, expiresAt: number }
 */
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 小时
const imageCache = new Map();

/**
 * 获取本地时间字符串（用于日志）
 */
function getLocalTimeString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 从缓存获取图片
 */
function getCachedImage(key) {
  const entry = imageCache.get(key);
  if (!entry) return null;
  
  if (Date.now() >= entry.expiresAt) {
    imageCache.delete(key);
    return null;
  }
  
  return entry.buffer;
}

/**
 * 存储图片到缓存
 */
function setCachedImage(key, buffer) {
  imageCache.set(key, {
    buffer,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

/**
 * 中型 Widget 目标比例（绝大多数 iPhone）
 * 1170 / 558 ≈ 2.097
 */
const TARGET_RATIO = 1170 / 558;

/**
 * Headless Chromium 稳定工作区
 */
const VIEW_W = 800;
const VIEW_H = 400;

app.get("/render/top7.png", async (req, res) => {
  // ========= 参数校验 =========
  const mpToken = req.query.token;
  if (!mpToken) {
    return res.status(400).send("missing mp token");
  }

  // ========= 检查缓存 =========
  const cached = getCachedImage(mpToken);
  if (cached) {
    console.log(`${getLocalTimeString()} hit`);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "max-age=300");
    return res.send(cached);
  }
  
  console.log(`${getLocalTimeString()} miss`);

  const MP_BASE_URL = process.env.MP_BASE_URL;
  const TMDB_KEY = process.env.TMDB_KEY;

  if (!MP_BASE_URL || !TMDB_KEY) {
    return res.status(500).send("env not configured");
  }

  let browser;

  try {
    // ========= 启动浏览器 =========
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

    // 调试日志（保留，方便以后排错）
    page.on("console", msg =>
      console.log("PAGE LOG:", msg.type(), msg.text())
    );
    page.on("pageerror", err =>
      console.error("PAGE ERROR:", err.message)
    );

    // ========= 设置 viewport =========
    await page.setViewport({
      width: VIEW_W,
      height: VIEW_H,
      deviceScaleFactor: 1
    });

    // ========= 注入环境变量（HTML 使用） =========
    await page.evaluateOnNewDocument((env) => {
      window.__ENV__ = env;
    }, {
      MP_BASE_URL,
      MP_TOKEN: mpToken,
      TMDB_KEY
    });

    // ========= 打开 HTML =========
    const fileUrl =
      "file://" + path.join(__dirname, "page.html");

    await page.goto(fileUrl, {
      waitUntil: "domcontentloaded"
    });

    // ========= 等前端渲染完成 =========
    await page.waitForFunction(
      () => window.__RENDER_DONE__ === true,
      { timeout: 30000 }
    );

    // ========= 计算裁剪区域（核心） =========
    let clipW, clipH;

    if (VIEW_W / VIEW_H > TARGET_RATIO) {
      // viewport 太宽，裁左右
      clipH = VIEW_H;
      clipW = Math.round(VIEW_H * TARGET_RATIO);
    } else {
      // viewport 太高，裁上下
      clipW = VIEW_W;
      clipH = Math.round(VIEW_W / TARGET_RATIO);
    }

    const clipX = Math.round((VIEW_W - clipW) / 2);
    const clipY = Math.round((VIEW_H - clipH) / 2);

    // ========= 截图（最终图） =========
    const buffer = await page.screenshot({
      type: "png",
      clip: {
        x: clipX,
        y: clipY,
        width: clipW,
        height: clipH
      }
    });

    // ========= 写入缓存 =========
    setCachedImage(mpToken, buffer);

    // ========= 返回 =========
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
  console.log(`render service on :${PORT}`);
});
