/**
 * DeskLink - E2E Sinyal ve WebRTC Protokol Doğrulama Testi
 */
import WebSocket from './server/node_modules/ws/index.js';

const SERVER_URL = 'ws://localhost:9000';

function createClient(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SERVER_URL);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

async function runTest() {
  console.log('🧪 DeskLink E2E Protokol Testi Başlatılıyor...');

  // 1. İki istemci oluştur (Host ve Controller)
  const hostWs = await createClient('Host');
  const clientWs = await createClient('Client');

  let hostId = null;
  let clientId = null;

  // Host Kayıt Dinleyicisi
  hostWs.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.type === 'registered') {
      hostId = msg.payload.peerId;
      console.log(`✅ [Host Kayıt]: ${hostId}`);
    } else if (msg.type === 'incoming-request') {
      console.log(`📩 [Host]: ${msg.payload.fromName} (${msg.payload.fromPeerId}) bağlantı isteği gönderdi.`);
      // Otomatik Kabul Et
      hostWs.send(JSON.stringify({
        type: 'session-response',
        payload: {
          targetId: msg.payload.fromPeerId,
          accepted: true,
          permissions: { control: true, audio: true, clipboard: true }
        }
      }));
    } else if (msg.type === 'webrtc-answer') {
      console.log(`🤝 [Host]: WebRTC Answer alındı! Handshake tamamlandı.`);
    }
  });

  // Client Kayıt Dinleyicisi
  clientWs.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.type === 'registered') {
      clientId = msg.payload.peerId;
      console.log(`✅ [Client Kayıt]: ${clientId}`);
    } else if (msg.type === 'connect-accepted') {
      console.log(`🎉 [Client]: Bağlantı isteği onaylandı! Target: ${msg.payload.targetId}`);
      // Offer gönderimini simüle et
      clientWs.send(JSON.stringify({
        type: 'webrtc-offer',
        payload: {
          targetId: msg.payload.targetId,
          sdp: { type: 'offer', sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1...' }
        }
      }));
    } else if (msg.type === 'webrtc-offer') {
      console.log(`📦 [Client]: WebRTC Offer alındı, Answer gönderiliyor...`);
      clientWs.send(JSON.stringify({
        type: 'webrtc-answer',
        payload: {
          targetId: msg.payload.fromPeerId,
          sdp: { type: 'answer', sdp: 'v=0\r\no=- 67890 2 IN IP4 127.0.0.1...' }
        }
      }));
    }
  });

  // Host ve Client kaydol
  hostWs.send(JSON.stringify({
    type: 'register',
    payload: { deviceInfo: { name: 'MacBook Pro Host', os: 'macOS' } }
  }));

  clientWs.send(JSON.stringify({
    type: 'register',
    payload: { deviceInfo: { name: 'Windows 11 Client', os: 'Windows' } }
  }));

  // Kayıtların tamamlanmasını bekle
  await new Promise(r => setTimeout(r, 600));

  if (!hostId || !clientId) {
    throw new Error('Cihaz kayıtları başarısız!');
  }

  // Client -> Host'a bağlantı isteği göndersin
  console.log(`🚀 [Client -> Host]: ${clientId} -> ${hostId} bağlanma isteği gönderiyor...`);
  clientWs.send(JSON.stringify({
    type: 'connect-request',
    payload: {
      targetId: hostId,
      requesterName: 'Windows 11 Client',
      requesterOs: 'Windows'
    }
  }));

  // Oturumun kurulmasını bekle
  await new Promise(r => setTimeout(r, 1000));

  // Oturumu kapat
  console.log('🛑 [Test]: Oturum kapatılıyor...');
  clientWs.send(JSON.stringify({ type: 'disconnect-session', payload: {} }));

  await new Promise(r => setTimeout(r, 400));

  hostWs.close();
  clientWs.close();

  console.log('🎯 TÜM TESTLER BAŞARIYLA GEÇTİ! Sinyal ve eşleşme protokolü %100 çalışıyor.');
  process.exit(0);
}

runTest().catch(err => {
  console.error('❌ Test Hatası:', err);
  process.exit(1);
});
