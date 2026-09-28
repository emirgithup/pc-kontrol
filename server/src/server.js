/**
 * DeskLink - WebRTC Sinyal ve Eşleştirme Sunucusu (Signaling Server)
 * İnternet üzerinden çalışmak için güncellenmiş sürüm.
 *
 * Bu sunucu, istemciler (Client) ve ana bilgisayarlar (Host) arasında:
 * 1. 9 Haneli Benzersiz AnyDesk tarzı ID eşleşmesini sağlar.
 * 2. WebRTC SDP (Session Description Protocol) Offer/Answer paketlerini aktarır.
 * 3. STUN/TURN ICE Adaylarını (ICE Candidates) iletir.
 * 4. Bağlantı onay/red (Session Acceptance/Rejection) mekanizmasını yönetir.
 *
 * Deploy: Railway / Render / Heroku / VPS
 * PORT: process.env.PORT (otomatik algılanır)
 */

const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 9000;

// -------------------------------------------------------
// ICE Sunucu Yapılandırması
// TURN sunucusu kurumsal ağlar ve NAT için şart.
// Ücretsiz TURN: Metered, Twilio, Coturn (kendi sunucunuz)
// -------------------------------------------------------
const ICE_SERVERS = [
  // Google STUN (NAT türünü belirler, doğrudan P2P için)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  // Metered ücretsiz TURN (Çift NAT ve kurumsal güvenlik duvarları için)
  // NOT: Kendi TURN sunucunuzu kurabilirsiniz: https://github.com/coturn/coturn
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turns:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

// -------------------------------------------------------
// HTTP Sunucusu (Health Check + WebSocket Upgrade)
// -------------------------------------------------------
const server = http.createServer((req, res) => {
  // CORS başlıkları (WebSocket bağlantıları için)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      peers: peers.size,
      activeSessions: getActiveSessionCount(),
      uptime: process.uptime(),
      timestamp: Date.now()
    }));
    return;
  }

  if (req.url === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      totalPeers: peers.size,
      activeSessions: getActiveSessionCount(),
      uptime: Math.floor(process.uptime()),
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('DeskLink Signaling Server 🚀\nSürüm: 2.0.0 (Internet Edition)\nPort: ' + PORT);
});

// -------------------------------------------------------
// WebSocket Sunucusu
// -------------------------------------------------------
const wss = new WebSocketServer({
  server,
  // Büyük SDP mesajları için maksimum boyut (1MB)
  maxPayload: 1024 * 1024,
  // Kalp atışı denetimi (60sn yanıt vermeyenleri kapat)
  clientTracking: true
});

// Aktif bağlı cihazlar: Map<peerId, { socket, deviceInfo, sessionWith, password, lastPing }>
const peers = new Map();

// -------------------------------------------------------
// Yardımcı Fonksiyonlar
// -------------------------------------------------------

function generateUniqueId() {
  let id = '';
  let attempts = 0;
  do {
    const part1 = Math.floor(100 + Math.random() * 900);
    const part2 = Math.floor(100 + Math.random() * 900);
    const part3 = Math.floor(100 + Math.random() * 900);
    id = `${part1} ${part2} ${part3}`;
    attempts++;
    if (attempts > 1000) throw new Error('ID havuzu tükendi');
  } while (peers.has(id));
  return id;
}

function getActiveSessionCount() {
  let count = 0;
  peers.forEach(p => { if (p.sessionWith) count++; });
  return Math.floor(count / 2);
}

function safeSend(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data));
    } catch (err) {
      console.error('[safeSend] Gönderim hatası:', err.message);
    }
  }
}

// -------------------------------------------------------
// WebSocket Bağlantı Yönetimi
// -------------------------------------------------------
wss.on('connection', (ws, req) => {
  let currentPeerId = null;
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket.remoteAddress;

  console.log(`[+] Yeni bağlantı: ${clientIp}`);

  // Bağlantı başına zaman aşımı (kayıt yapılmazsa 15sn sonra kapat)
  const registrationTimeout = setTimeout(() => {
    if (!currentPeerId) {
      console.warn(`[!] Kayıt yapılmadı, bağlantı kapatılıyor: ${clientIp}`);
      ws.close(4001, 'Kayıt zaman aşımı');
    }
  }, 15000);

  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (err) {
      console.error('[!] Geçersiz JSON:', err.message);
      return;
    }

    const { type, payload } = message;

    // Güncelle: Son aktif zamanı
    if (currentPeerId && peers.has(currentPeerId)) {
      peers.get(currentPeerId).lastPing = Date.now();
    }

    switch (type) {

      // 1. Cihaz Kaydı
      case 'register': {
        clearTimeout(registrationTimeout);

        const requestedId = payload?.peerId;
        const validId = (requestedId && !peers.has(requestedId)) ? requestedId : generateUniqueId();
        currentPeerId = validId;

        peers.set(currentPeerId, {
          socket: ws,
          deviceInfo: payload?.deviceInfo || { os: 'unknown', name: 'Bilinmeyen Cihaz' },
          sessionWith: null,
          password: payload?.password || null,
          lastPing: Date.now(),
          ip: clientIp
        });

        console.log(`[✓] Kayıt: ${currentPeerId} (${peers.get(currentPeerId).deviceInfo.name})`);

        safeSend(ws, {
          type: 'registered',
          payload: {
            peerId: currentPeerId,
            iceServers: ICE_SERVERS,
            serverVersion: '2.0.0'
          }
        });
        break;
      }

      // 2. Bağlantı İsteği
      case 'connect-request': {
        const { targetId, requesterName, requesterOs, password } = payload;
        const cleanTargetId = targetId?.trim();

        if (!cleanTargetId) {
          safeSend(ws, { type: 'error', payload: { code: 'INVALID_ID', message: 'Geçersiz hedef ID.' } });
          return;
        }

        const targetPeer = peers.get(cleanTargetId);

        if (!targetPeer) {
          safeSend(ws, {
            type: 'error',
            payload: { code: 'PEER_NOT_FOUND', message: 'Bu ID\'ye sahip cihaz çevrimdışı veya bulunamadı.' }
          });
          return;
        }

        if (cleanTargetId === currentPeerId) {
          safeSend(ws, {
            type: 'error',
            payload: { code: 'SELF_CONNECT', message: 'Kendi cihazınıza bağlanamazsınız.' }
          });
          return;
        }

        if (targetPeer.sessionWith) {
          safeSend(ws, {
            type: 'error',
            payload: { code: 'PEER_BUSY', message: 'Hedef cihaz başka bir oturumda meşgul.' }
          });
          return;
        }

        // Şifre ile otomatik onay
        if (targetPeer.password && password && targetPeer.password === password) {
          console.log(`[⚡] Otomatik onay: ${currentPeerId} → ${cleanTargetId}`);

          peers.get(currentPeerId).sessionWith = cleanTargetId;
          targetPeer.sessionWith = currentPeerId;

          safeSend(ws, {
            type: 'connect-accepted',
            payload: {
              targetId: cleanTargetId,
              permissions: { control: true, audio: true, clipboard: true }
            }
          });

          safeSend(targetPeer.socket, {
            type: 'session-started',
            payload: {
              withPeerId: currentPeerId,
              requesterName: requesterName || 'Uzak İstemci',
              permissions: { control: true, audio: true, clipboard: true }
            }
          });
          return;
        }

        // Manuel onay gerekli
        console.log(`[→] İstek: ${currentPeerId} → ${cleanTargetId}`);
        safeSend(targetPeer.socket, {
          type: 'incoming-request',
          payload: {
            fromPeerId: currentPeerId,
            fromName: requesterName || 'Uzak Kullanıcı',
            fromOs: requesterOs || 'Bilinmiyor'
          }
        });
        break;
      }

      // 3. Oturum Yanıtı (Kabul/Ret)
      case 'session-response': {
        const { targetId, accepted, permissions } = payload;
        const requesterPeer = peers.get(targetId);

        if (!requesterPeer) return;

        if (accepted) {
          peers.get(currentPeerId).sessionWith = targetId;
          requesterPeer.sessionWith = currentPeerId;

          console.log(`[⟺] Oturum: ${targetId} ↔ ${currentPeerId}`);

          safeSend(requesterPeer.socket, {
            type: 'connect-accepted',
            payload: {
              targetId: currentPeerId,
              permissions: permissions || { control: true, audio: true, clipboard: true }
            }
          });

          safeSend(ws, {
            type: 'session-started',
            payload: {
              withPeerId: targetId,
              permissions: permissions || { control: true, audio: true, clipboard: true }
            }
          });
        } else {
          console.log(`[✗] Ret: ${currentPeerId}`);
          safeSend(requesterPeer.socket, {
            type: 'connect-rejected',
            payload: { message: 'Hedef kullanıcı bağlantı isteğini reddetti.' }
          });
        }
        break;
      }

      // 4-6. WebRTC Sinyalizasyonu (SDP + ICE)
      case 'webrtc-offer':
      case 'webrtc-answer':
      case 'webrtc-ice': {
        const { targetId, sdp, candidate } = payload;
        const targetPeer = peers.get(targetId);

        if (!targetPeer) {
          console.warn(`[!] ${type}: Hedef bulunamadı: ${targetId}`);
          return;
        }

        // Güvenlik: Sadece aktif oturumdaki eşe ilet
        const senderPeer = peers.get(currentPeerId);
        if (!senderPeer || senderPeer.sessionWith !== targetId) {
          console.warn(`[!] Yetkisiz ${type} isteği: ${currentPeerId} → ${targetId}`);
          return;
        }

        safeSend(targetPeer.socket, {
          type,
          payload: {
            fromPeerId: currentPeerId,
            ...(sdp && { sdp }),
            ...(candidate && { candidate })
          }
        });
        break;
      }

      // 7. Oturumu Sonlandır
      case 'disconnect-session': {
        const myPeer = peers.get(currentPeerId);
        if (myPeer?.sessionWith) {
          const otherPeer = peers.get(myPeer.sessionWith);
          if (otherPeer) {
            otherPeer.sessionWith = null;
            safeSend(otherPeer.socket, {
              type: 'session-ended',
              payload: { reason: 'Karşı taraf oturumu sonlandırdı.' }
            });
          }
          myPeer.sessionWith = null;
          safeSend(ws, {
            type: 'session-ended',
            payload: { reason: 'Oturum kapatıldı.' }
          });
          console.log(`[■] Oturum sona erdi: ${currentPeerId}`);
        }
        break;
      }

      // 8. Kalp Atışı
      case 'ping': {
        safeSend(ws, { type: 'pong', timestamp: Date.now() });
        break;
      }

      default:
        console.warn(`[?] Bilinmeyen mesaj: ${type}`);
    }
  });

  ws.on('close', (code, reason) => {
    clearTimeout(registrationTimeout);
    if (currentPeerId && peers.has(currentPeerId)) {
      const peer = peers.get(currentPeerId);

      // Aktif oturumu temizle
      if (peer.sessionWith) {
        const otherPeer = peers.get(peer.sessionWith);
        if (otherPeer) {
          otherPeer.sessionWith = null;
          safeSend(otherPeer.socket, {
            type: 'session-ended',
            payload: { reason: 'Bağlantı koptu (Cihaz çevrimdışı oldu).' }
          });
        }
      }

      peers.delete(currentPeerId);
      console.log(`[-] Ayrıldı: ${currentPeerId} (${code})`);
    }
  });

  ws.on('error', (err) => {
    console.error(`[!] Soket hatası [${currentPeerId}]: ${err.message}`);
  });
});

// -------------------------------------------------------
// Ölü Peer Temizleyici (Her 2 dakikada çalışır)
// -------------------------------------------------------
setInterval(() => {
  const now = Date.now();
  const staleThreshold = 2 * 60 * 1000; // 2 dakika

  peers.forEach((peer, peerId) => {
    if (peer.socket.readyState !== WebSocket.OPEN) {
      console.log(`[GC] Ölü peer temizlendi: ${peerId}`);
      if (peer.sessionWith) {
        const other = peers.get(peer.sessionWith);
        if (other) {
          other.sessionWith = null;
          safeSend(other.socket, {
            type: 'session-ended',
            payload: { reason: 'Karşı taraf bağlantısı koptu.' }
          });
        }
      }
      peers.delete(peerId);
    } else if ((now - peer.lastPing) > staleThreshold) {
      console.log(`[GC] Yanıtsız peer kapatılıyor: ${peerId}`);
      peer.socket.close(4002, 'Heartbeat zaman aşımı');
    }
  });
}, 120000);

// -------------------------------------------------------
// Sunucuyu Başlat
// -------------------------------------------------------
server.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log('📡 DeskLink Sinyal Sunucusu Aktif!');
  console.log(`🚀 Port: ${PORT}`);
  console.log(`🌐 Health: http://localhost:${PORT}/health`);
  console.log(`📊 Stats:  http://localhost:${PORT}/stats`);
  console.log('='.repeat(50));
  console.log('💡 Deploy için: railway up (server/ klasöründen)');
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('[SIGTERM] Sunucu kapatılıyor...');
  wss.clients.forEach(client => {
    client.close(1001, 'Sunucu bakım modunda');
  });
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[SIGINT] Sunucu durduruluyor...');
  server.close(() => process.exit(0));
});
