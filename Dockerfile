# HOMYFLIX + בוט וואטאפ — image לפריסה בענן
# מבוסס על Node 20 עם Chromium מותקן (נדרש ל-whatsapp-web.js)
FROM node:20-slim

# התקנת Chromium וכל הספריות שהוא צריך כדי לרוץ headless
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# לא להוריד את ה-Chromium המובנה של puppeteer — נשתמש באחד שהתקנו
ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

# התקנת תלויות (שכבה נפרדת לקאשינג)
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# העתקת שאר הקוד
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
