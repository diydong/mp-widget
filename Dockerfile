FROM node:20-slim

# 安装 Chromium + 必要字体（最小集合）
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-noto-cjk \
  fonts-noto-color-emoji \
  ca-certificates \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# 告诉 puppeteer 不要下载 Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# 只拷贝依赖描述文件（利用缓存）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 再拷贝源码
COPY server.js page.html ./

EXPOSE 8888
CMD ["node", "server.js"]
