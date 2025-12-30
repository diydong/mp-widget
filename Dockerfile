FROM node:20-slim

# 安装 Chrome 运行所需依赖
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-noto-cjk \
  fonts-noto-color-emoji \
  ca-certificates \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 8888
CMD ["node", "server.js"]
