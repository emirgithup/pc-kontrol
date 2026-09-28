# 🌐 DeskLink Sunucusunu İnternete Deploy Etme Rehberi

Bu belge, DeskLink signaling sunucusunu internete açmak için adım adım talimatları içerir.
Sunucu deploy edildiğinde evden ofis PC'nize bağlanabilirsiniz.

---

## 🏗️ Mimari Özet

```
[Ev PC'si - DeskLink]          [İnternet]           [Ofis PC'si - DeskLink]
       │                            │                           │
       └──── WebSocket ────► Signaling Sunucusu ◄──── WebSocket ────┘
                            (Railway/Render/VPS)
                                    │
              [WebRTC P2P Bağlantısı - Doğrudan veya TURN üzerinden]
                                    │
       └────────────────────────────────────────────────────────┘
                     Ekran Görüntüsü + Girdi Kanalı
```

**Signaling sunucusu** sadece eşleştirme yapar (kimlik doğrulama + adres paylaşımı).
Gerçek ekran verisi doğrudan P2P (peer-to-peer) üzerinden akar — sunucu üzerinden geçmez.

---

## Seçenek 1: Railway (En Kolay - Ücretsiz Plan Mevcut)

### Ön Koşullar
- railway.app hesabı (GitHub ile giriş yapın)
- Railway CLI: `npm install -g @railway/cli`

### Adımlar

```bash
# 1. server/ klasörüne git
cd /Users/emirkatranci/pc-kontrol/server

# 2. Railway CLI ile giriş yap
railway login

# 3. Yeni proje oluştur ve deploy et
railway init
railway up

# 4. Sunucu URL'ini al
railway status
```

Railway size şu formatta bir URL verecek:
```
https://desklink-server-production.up.railway.app
```

DeskLink uygulamasında **Ayarlar → Sinyal Sunucusu** kısmına şunu yazın:
```
wss://desklink-server-production.up.railway.app
```

> `https://` değil `wss://` yazmayı unutmayın!

---

## Seçenek 2: Render.com (Ücretsiz - 750 saat/ay)

1. render.com → **New +** → **Web Service**
2. GitHub reponuzu bağlayın
3. Ayarlar:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. **Deploy** butonuna basın

URL formatı: `wss://desklink-server.onrender.com`

> Render ücretsiz plan 15 dakika aktif kullanım olmadığında uyur (cold start).
> Sürekli çalışmasını isterseniz ücretli plan kullanın veya Railway tercih edin.

---

## Seçenek 3: Kendi VPS (En Stabil)

```bash
# VPS'e SSH ile bağlanın (Ubuntu/Debian)
ssh root@your-vps-ip

# Node.js yükle
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# PM2 ile process yöneticisi
npm install -g pm2

# Projeyi kopyalayın
cd desklink/server
npm install

# PM2 ile başlat
pm2 start src/server.js --name desklink-server
pm2 startup && pm2 save
```

Nginx + SSL için DEPLOY.md dosyasındaki tam konfigürasyonu kullanın.

---

## TURN Sunucusu (Kurumsal Ağlar İçin)

Şirket güvenlik duvarları WebRTC P2P bağlantısını engelleyebilir.
Bu durumda TURN (relay) sunucusu gerekir.

Mevcut kod zaten `openrelay.metered.ca` kullanıyor (test amaçlı, üretim için kendi sunucunuzu kurun).

### Ücretsiz TURN Alternatifleri
- **Metered.ca:** 10GB/ay ücretsiz
- **Twilio:** 400K dakika/ay ücretsiz

---

## Güvenlik Notları

1. **Şifre ile Katılımsız Erişim:** DeskLink → Ayarlar → "Sabit Şifre" ile şifre belirleyin
2. **ID Güvenliği:** 9 haneli ID brute force'a karşı güvenlidir (1 milyar kombinasyon)
3. **HTTPS/WSS:** Deploy URL'leri mutlaka `wss://` olmalı (şifreli bağlantı)
4. **Firewall:** Sadece gerekli portları açın (80, 443, 3478/UDP TURN için)

---

## Sunucuyu Test Etme

```bash
# Health check
curl https://sizin-sunucunuz.railway.app/health

# Beklenen yanıt:
# {"status":"ok","peers":0,"activeSessions":0,"uptime":123.4,"timestamp":1234567890}
```

---

## Kullanım Senaryosu: Evden Ofis PC'sine Bağlanma

1. **Ofis PC'sinde:** DeskLink açık bırakın → ID'nizi not alın (örn: `482 910 234`)
2. **Sunucu:** Railway'de çalışıyor olmalı
3. **Ev PC'sinde:** DeskLink → Hedef ID kutusuna `482 910 234` yazın → Bağlan
4. **Ofis PC'sinde:** "Bağlantı isteği" gelir → Kabul edin
5. Bağlantı kuruldu! Ofis ekranı ev PC'sinde görünür.

**Katılımsız erişim (unattended):** Ofis PC'sinde sabit şifre tanımlayın, eve dönerken
onay beklemeden otomatik bağlanın.
