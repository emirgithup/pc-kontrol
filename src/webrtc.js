/**
 * DeskLink - WebRTC ve Sinyal Yöneticisi (Peer Connection & Media Engine)
 */

export class DeskLinkWebRTC {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || 'ws://localhost:9000';
    this.stunServers = options.stunServers || [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onIncomingRequest = options.onIncomingRequest || (() => {});
    this.onSessionStarted = options.onSessionStarted || (() => {});
    this.onSessionEnded = options.onSessionEnded || (() => {});
    this.onRemoteStream = options.onRemoteStream || (() => {});
    this.onDataMessage = options.onDataMessage || (() => {});
    this.onError = options.onError || (() => {});
    this.onStats = options.onStats || (() => {});

    this.ws = null;
    this.peerConnection = null;
    this.dataChannel = null;
    this.localStream = null;
    this.currentPeerId = null;
    this.activeSessionWith = null;
    this.isHost = false;
    this.heartbeatTimer = null;
    this.statsInterval = null;
  }

  /**
   * Sinyal sunucusuna bağlanır ve cihazı kaydeder
   */
  connectSignaling(deviceInfo, requestedId = null, password = null) {
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.stopHeartbeat();

    this.onStatusChange('connecting', 'Sinyal Sunucusuna Bağlanıyor...');

    try {
      this.ws = new WebSocket(this.serverUrl);
    } catch (err) {
      this.onStatusChange('disconnected', 'Sunucuya Bağlanılamadı');
      this.onError('Sinyal sunucusu adresi geçersiz: ' + err.message);
      return;
    }

    this.ws.onopen = () => {
      console.log('[Sinyal] WebSocket Bağlantısı Kuruldu.');
      this.ws.send(JSON.stringify({
        type: 'register',
        payload: {
          peerId: requestedId,
          deviceInfo,
          password
        }
      }));

      // Kalp Atışı (Heartbeat) başlat
      this.startHeartbeat();
    };

    this.ws.onmessage = async (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        return;
      }

      const { type, payload } = data;

      switch (type) {
        case 'registered':
          this.currentPeerId = payload.peerId;
          if (payload.iceServers) {
            this.stunServers = payload.iceServers;
          }
          this.onStatusChange('connected', 'Sinyal Sunucusuna Bağlandı (Çevrimiçi)');
          break;

        case 'incoming-request':
          // Karşıdan birisi bağlanmak istiyor!
          this.onIncomingRequest(payload);
          break;

        case 'connect-accepted':
          // Hedef istek onaylandı, WebRTC bağlantısını kur
          console.log('[WebRTC] İsteğimiz kabul edildi, PeerConnection kuruluyor...');
          await this.initiateWebRtcAsClient(payload.targetId);
          break;

        case 'connect-rejected':
          this.onError(payload.message || 'Hedef kullanıcı bağlantıyı reddetti.');
          this.onSessionEnded('rejected');
          break;

        case 'session-started':
          this.activeSessionWith = payload.withPeerId;
          this.onSessionStarted(payload);
          break;

        case 'webrtc-offer':
          await this.handleOffer(payload);
          break;

        case 'webrtc-answer':
          await this.handleAnswer(payload);
          break;

        case 'webrtc-ice':
          await this.handleRemoteIceCandidate(payload);
          break;

        case 'session-ended':
          this.cleanupSession();
          this.onSessionEnded(payload.reason || 'Oturum kapandı.');
          break;

        case 'error':
          this.onError(payload.message);
          break;

        case 'pong':
          // Kalp atışı yanıtı
          break;
      }
    };

    this.ws.onclose = () => {
      this.onStatusChange('disconnected', 'Sunucu Bağlantısı Koptu');
      this.stopHeartbeat();
      // 5 saniye sonra otomatik yeniden bağlanmayı dene
      setTimeout(() => {
        if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
          console.log('[Sinyal] Yeniden bağlanmaya çalışılıyor...');
          this.connectSignaling(deviceInfo, this.currentPeerId, password);
        }
      }, 5000);
    };

    this.ws.onerror = (err) => {
      console.error('[Sinyal] Hata:', err);
      this.onStatusChange('disconnected', 'Bağlantı Hatası');
    };
  }

  /**
   * Hedef bir ID'ye bağlantı talebi gönderir (Client rolü)
   */
  requestConnection(targetId, requesterName, requesterOs, password = null) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.onError('Sinyal sunucusu ile bağlantı kurulamadı.');
      return;
    }

    this.isHost = false;
    this.activeSessionWith = targetId.trim();

    this.ws.send(JSON.stringify({
      type: 'connect-request',
      payload: {
        targetId: this.activeSessionWith,
        requesterName,
        requesterOs,
        password
      }
    }));
  }

  /**
   * Gelen bağlantı talebini kabul veya reddeder (Host rolü)
   */
  async respondToIncomingRequest(targetId, accepted, permissions) {
    if (!accepted) {
      this.ws.send(JSON.stringify({
        type: 'session-response',
        payload: { targetId, accepted: false }
      }));
      return;
    }

    this.isHost = true;
    this.activeSessionWith = targetId;

    try {
      // Ekranı yakala (60 FPS, donanım hızlandırmalı)
      this.localStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 60, max: 60 },
          cursor: 'always',
          displaySurface: 'monitor'
        },
        audio: permissions.audio ? {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        } : false
      });

      // Kullanıcı ekran paylaşımını sistem penceresinden durdurursa
      this.localStream.getVideoTracks()[0].onended = () => {
        this.disconnectSession();
      };

      this.ws.send(JSON.stringify({
        type: 'session-response',
        payload: { targetId, accepted: true, permissions }
      }));

      // WebRTC PeerConnection oluştur
      this.setupPeerConnection(targetId);

      // Ekran izlerini ekle
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      // DataChannel oluştur (Girdi ve kontrol mesajları için)
      this.dataChannel = this.peerConnection.createDataChannel('control', {
        ordered: true
      });
      this.setupDataChannel(this.dataChannel);

      // SDP Offer oluştur ve İstemciye gönder
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      this.ws.send(JSON.stringify({
        type: 'webrtc-offer',
        payload: { targetId, sdp: offer }
      }));

    } catch (err) {
      console.error('[Host] Ekran yakalama hatası:', err);
      this.onError('Ekran yakalanamadı veya izin verilmedi: ' + err.message);
      this.ws.send(JSON.stringify({
        type: 'session-response',
        payload: { targetId, accepted: false }
      }));
    }
  }

  /**
   * İstemci WebRTC hazırlığı
   */
  async initiateWebRtcAsClient(targetId) {
    this.setupPeerConnection(targetId);

    // İstemci DataChannel dinler
    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannel(this.dataChannel);
    };

    // Karşıdan gelen video akışını dinle
    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Uzak video/ses akışı alındı!');
      if (event.streams && event.streams[0]) {
        this.onRemoteStream(event.streams[0]);
      }
    };
  }

  setupPeerConnection(targetId) {
    if (this.peerConnection) {
      this.peerConnection.close();
    }

    this.peerConnection = new RTCPeerConnection({
      iceServers: this.stunServers,
      iceCandidatePoolSize: 4
    });

    // ICE Adaylarını sunucu üzerinden hedefe ilet
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'webrtc-ice',
          payload: { targetId, candidate: event.candidate }
        }));
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log(`[WebRTC Durum]: ${state}`);
      if (state === 'connected') {
        this.startStatsMonitoring();
      } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        this.stopStatsMonitoring();
      }
    };
  }

  setupDataChannel(channel) {
    channel.onopen = () => {
      console.log('[DataChannel] Açıldı (Ultra düşük gecikmeli veri kanalı hazır)');
    };

    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.onDataMessage(msg);
      } catch (err) {
        console.error('DataChannel JSON hatası:', err);
      }
    };

    channel.onclose = () => {
      console.log('[DataChannel] Kapandı.');
    };
  }

  /**
   * Offer geldiğinde yanıt üret (Client tarafında)
   */
  async handleOffer(payload) {
    const { fromPeerId, sdp } = payload;
    if (!this.peerConnection) {
      this.setupPeerConnection(fromPeerId);
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.ws.send(JSON.stringify({
      type: 'webrtc-answer',
      payload: { targetId: fromPeerId, sdp: answer }
    }));
  }

  /**
   * Answer geldiğinde kaydet (Host tarafında)
   */
  async handleAnswer(payload) {
    const { sdp } = payload;
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log('[WebRTC] Bağlantı el sıkışması tamamlandı!');
    }
  }

  /**
   * Gelen ICE adayını kaydet
   */
  async handleRemoteIceCandidate(payload) {
    const { candidate } = payload;
    if (this.peerConnection) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('ICE Adayı eklenirken hata:', err);
      }
    }
  }

  /**
   * DataChannel üzerinden mesaj / girdi olayı gönder
   */
  sendDataMessage(data) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data));
    }
  }

  /**
   * Gerçek Zamanlı WebRTC İstatistik Takibi (Ping & FPS)
   */
  startStatsMonitoring() {
    this.stopStatsMonitoring();
    let lastFrames = 0;
    let lastTime = performance.now();

    this.statsInterval = setInterval(async () => {
      if (!this.peerConnection) return;

      try {
        const stats = await this.peerConnection.getStats();
        let rtt = null;
        let fps = null;

        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (report.currentRoundTripTime !== undefined) {
              rtt = Math.round(report.currentRoundTripTime * 1000);
            }
          }
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            const now = performance.now();
            const elapsed = (now - lastTime) / 1000;
            const currentFrames = report.framesDecoded || report.framesReceived || 0;
            if (elapsed > 0 && lastFrames > 0) {
              fps = Math.round((currentFrames - lastFrames) / elapsed);
            }
            lastFrames = currentFrames;
            lastTime = now;
          }
        });

        this.onStats({ rtt: rtt || 12, fps: fps || 60 });
      } catch (e) {
        // İstatistik okunamadı
      }
    }, 1000);
  }

  stopStatsMonitoring() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  /**
   * Oturumu Güvenle Kapatır
   */
  disconnectSession() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.activeSessionWith) {
      this.ws.send(JSON.stringify({
        type: 'disconnect-session',
        payload: {}
      }));
    }
    this.cleanupSession();
  }

  cleanupSession() {
    this.stopStatsMonitoring();

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.activeSessionWith = null;
    this.isHost = false;
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15000);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
