# 🚀 DeskLink - Uzaktan Masaüstü Kontrol Uygulaması (AnyDesk & RustDesk Alternatifi)

DeskLink; **Windows** ve **macOS** işletim sistemlerinde ultra düşük gecikmeyle (<100ms) çalışan, **Tauri (Rust)** ve **WebRTC P2P** teknolojileriyle geliştirilmiş modern bir uzaktan masaüstü kontrol uygulamasıdır.

---

## 🌟 Öne Çıkan Özellikler

- **AnyDesk Tarzı 9 Haneli ID ve PIN Doğrulaması:** Her cihaza özel `XXX XXX XXX` formatında benzersiz ve kararlı bir masaüstü adresi atanır.
- **WebRTC P2P Doğrudan Bağlantı:** Görüntü ve kontrol paketleri merkezi bir sunucuda depolanmaz veya gecikmeye uğramaz; cihazlar arasında doğrudan şifreli (DTLS/SRTP) P2P tünel üzerinden akar.
- **60 FPS Donanım Hızlandırmalı Ekran Akışı:** Windows'ta DXGI, macOS'ta ScreenCaptureKit altyapısı ile akıcı 60 FPS görüntü.
- **Native Fare ve Klavye Simülasyonu:** Rust `enigo` çekirdeği ile pikseller doğrudan yerel işletim sistemi olaylarına (Win32 `SendInput` / macOS `CoreGraphics`) dönüştürülür.
- **Gelen Bağlantı Onay Modalı:** İstemci bağlanmak istediğinde; Fare/Klavye kontrolü, Ses aktarımı ve Pano eşitleme izinleri onay kutularıyla host tarafından yetkilendirilir.
- **Katılımsız Erişim (Unattended Access):** Sabit şifre tanımlayarak bilgisayarınızın başında olmadığınızda da şifreyle anında bağlanabilirsiniz.
- **Zengin Üst Araç Çubuğu (Toolbar):**
  - Ekrana Sığdır / 1:1 Orijinal Boyut geçişi
  - Tam Ekran modu
  - **CAD (Ctrl + Alt + Del)** gönderme butonu
  - Pano (Clipboard) eşitleme
  - Gerçek zamanlı Ping (ms) ve FPS sayacı

---

## 🏗️ Mimari Yapı

```
pc-kontrol/
├── server/                        # Eşleştirme ve Sinyal Sunucusu (Signaling Server)
│   └── src/
│       └── server.js              # WebSocket, 9 haneli ID üretimi, SDP/ICE aracı
├── src-tauri/                     # Rust Tabanlı Native Sistem Katmanı
│   ├── Cargo.toml                 # enigo, display-info, whoami, tauri
│   ├── tauri.conf.json            # Pencere, güvenlik ve build ayarları
│   └── src/
│       ├── lib.rs                 # Tauri komut kayıtları ve ana döngü
│       ├── input.rs               # Native fare hareketi, tıklama, scroll ve klavye simülatörü
│       └── system.rs              # Cihaz ID üretimi, ekran çözünürlükleri, izin kontrolleri
├── src/                           # Modern Glassmorphism Ön Yüz (Frontend)
│   ├── index.html                 # AnyDesk tarzı gösterge paneli ve video görüntüleyici
│   ├── style.css                  # Karanlık tema, animasyonlar ve mikro etkileşimler
│   ├── app.js                     # UI mantığı, sesler, toast bildirimleri ve olay yönetimi
│   ├── webrtc.js                  # P2P bağlantı, STUN/TURN, DataChannel ve video akış motoru
│   └── input-controller.js        # Uzak ekranda girdileri yakalayıp DataChannel ile ileten modül
└── package.json                   # Proje betikleri ve bağımlılıklar
```

---

## 🚀 Kurulum ve Çalıştırma

### Gereksinimler
- **Node.js**: v18 veya üzeri
- **Rust & Cargo**: v1.75 veya üzeri (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)

---

### 1. Sinyal Sunucusunu Başlatma
Cihazların birbiriyle el sıkışması (SDP/ICE değişimi) için sinyal sunucusunu çalıştırın:

```bash
# Sinyal sunucusunu başlatır (Varsayılan Port: 9000)
npm run server
```

---

### 2. Uygulamayı Geliştirici Modunda Çalıştırma

#### A) Masaüstü Uygulaması (Tauri + Rust) Olarak:
```bash
# macOS veya Windows yerel masaüstü penceresi olarak başlatır
npm run tauri:dev
```

#### B) Web Tarayıcısı Üzerinden Test Etmek İçin:
```bash
# Tarayıcıda http://localhost:5173 adresini açar
npm run dev
```

---

### 3. Otomatik Protokol Testini Çalıştırma
Sinyal sunucusu açıkken iki sanal istemci arasında uçtan uca el sıkışma testini çalıştırmak için:

```bash
npm test
```

---

## 📦 Dağıtım ve Kurulum Paketleri (.exe / .dmg) Üretme

### macOS için (.dmg / .app):
```bash
npm run tauri:build
```
> Çıktı: `src-tauri/target/release/bundle/dmg/desklink_1.0.0_aarch64.dmg`

### Windows için (.exe / .msi):
Windows bir makinede veya CI/CD (GitHub Actions) üzerinde:
```bash
npm run tauri:build
```
> Çıktı: `src-tauri/target/release/bundle/msi/desklink_1.0.0_x64_en-US.msi`

---

## 🔒 Güvenlik & İzin Notları

### macOS İzinleri:
macOS'un sıkı güvenlik sandbox'ı gereği uzaktan kontrol yapabilmek için:
1. **Ekran Kaydı (Screen Recording):** Uygulama ilk açıldığında ekran paylaşım izni istenir (`Sistem Ayarları -> Gizlilik ve Güvenlik -> Ekran Kaydı`).
2. **Erişilebilirlik (Accessibility):** Fare ve klavyeyi uzaktan simüle edebilmek için uygulama arayüzündeki **"İzinleri Aç"** butonuna basarak DeskLink'e onay vermeniz gerekir.

### Windows İzinleri:
- Normal masaüstü kontrolü standart kullanıcı haklarıyla çalışır.
- Yönetici (UAC) pencerelerini kontrol edebilmek için uygulamanın "Yönetici Olarak Çalıştır" (Run as Administrator) ile başlatılması önerilir.
