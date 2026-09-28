FROM node:20-alpine

WORKDIR /app

# Bağımlılıkları yükle
COPY package*.json ./
RUN npm ci --only=production

# Kaynak kodu kopyala
COPY src/ ./src/

# Port açıklama (Railway/Render dinamik port kullanır)
EXPOSE 9000

# Sağlık kontrolü
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-9000}/health || exit 1

# Uygulamayı başlat
CMD ["node", "src/server.js"]
