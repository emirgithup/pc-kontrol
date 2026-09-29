/**
 * DeskLink - Ana Arayüz ve Oturum Kontrolcüsü (Application Controller)
 */

import { DeskLinkWebRTC } from './webrtc.js';
import { InputController, executeRemoteInputOnHost } from './input-controller.js';

// DOM Elementleri
const myDeviceIdEl = document.getElementById('myDeviceId');
const btnCopyId = document.getElementById('btnCopyId');
const myTempPasswordEl = document.getElementById('myTempPassword');
const btnRefreshPassword = document.getElementById('btnRefreshPassword');
const btnTogglePassword = document.getElementById('btnTogglePassword');
const myDeviceNameEl = document.getElementById('myDeviceName');
const myDeviceOsEl = document.getElementById('myDeviceOs');
const myDisplayResEl = document.getElementById('myDisplayRes');

const targetIdInput = document.getElementById('targetIdInput');
const targetPasswordInput = document.getElementById('targetPasswordInput');
const btnClearTargetId = document.getElementById('btnClearTargetId');
const btnConnect = document.getElementById('btnConnect');
const recentListEl = document.getElementById('recentList');
const btnClearRecent = document.getElementById('btnClearRecent');

const connectionStatusBadge = document.getElementById('connectionStatusBadge');
const connectionStatusText = document.getElementById('connectionStatusText');
const permissionWarningBanner = document.getElementById('permissionWarningBanner');
const btnGrantPermission = document.getElementById('btnGrantPermission');

const mainDashboard = document.getElementById('mainDashboard');
const sessionViewer = document.getElementById('sessionViewer');
const remoteVideo = document.getElementById('remoteVideo');
const remoteViewport = document.getElementById('remoteViewport');
const hostActiveSessionBar = document.getElementById('hostActiveSessionBar');
const connectedClientLabel = document.getElementById('connectedClientLabel');
const btnHostDisconnect = document.getElementById('btnHostDisconnect');

// Toolbar Elementleri
const remotePeerTitle = document.getElementById('remotePeerTitle');
const latencyBadge = document.getElementById('latencyBadge');
const fpsBadge = document.getElementById('fpsBadge');
const btnScaleToggle = document.getElementById('btnScaleToggle');
const scaleModeLabel = document.getElementById('scaleModeLabel');
const btnSendCad = document.getElementById('btnSendCad');
const btnToggleKeyboardLock = document.getElementById('btnToggleKeyboardLock');
const btnSyncClipboard = document.getElementById('btnSyncClipboard');
const btnToggleFullscreen = document.getElementById('btnToggleFullscreen');
const btnDisconnectSession = document.getElementById('btnDisconnectSession');

// Modallar
const incomingDialog = document.getElementById('incomingDialog');
const incomingRequesterName = document.getElementById('incomingRequesterName');
const permControl = document.getElementById('permControl');
const permAudio = document.getElementById('permAudio');
const permClipboard = document.getElementById('permClipboard');
const btnAcceptConnection = document.getElementById('btnAcceptConnection');
const btnRejectConnection = document.getElementById('btnRejectConnection');

const settingsDialog = document.getElementById('settingsDialog');
const btnOpenSettings = document.getElementById('btnOpenSettings');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const settingServerUrl = document.getElementById('settingServerUrl');
const settingStunServer = document.getElementById('settingStunServer');
const settingStaticPassword = document.getElementById('settingStaticPassword');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const toastContainer = document.getElementById('toastContainer');

// Durum Değişkenleri
let mySystemInfo = {
  device_id: '482 910 234',
  device_name: 'Yerel Bilgisayar',
  os: 'macOS',
  username: 'kullanici',
  temp_password: '123456'
};

let webrtcEngine = null;
let inputController = null;
let pendingIncomingRequest = null;
let isPasswordVisible = true;
let isKeyboardLocked = true;
let isScaleFit = true;

/**
 * Toast Bildirimi Gösterir
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/**
 * Tauri Çekirdeği ile Sistem Bilgilerini Çeker
 */
async function loadSystemInformation() {
  const tauri = window.__TAURI__;
  if (tauri && tauri.core && tauri.core.invoke) {
    try {
      const sysInfo = await tauri.core.invoke('get_system_info');
      mySystemInfo = sysInfo;

      const displays = await tauri.core.invoke('get_displays');
      if (displays && displays.length > 0) {
        const primary = displays.find(d => d.is_primary) || displays[0];
        myDisplayResEl.textContent = `${primary.width}x${primary.height}`;
      }

      const perm = await tauri.core.invoke('check_permissions');
      if (perm.is_macos && !perm.has_accessibility) {
        permissionWarningBanner.classList.remove('hidden');
      }
    } catch (err) {
      console.warn('Tauri API çağrısı yapılamadı, web fallback modunda çalışılıyor:', err);
    }
  } else {
    // Web test ortamı için benzersiz ID üretimi
    const storedId = localStorage.getItem('desklink_my_id');
    if (storedId) {
      mySystemInfo.device_id = storedId;
    } else {
      const part1 = Math.floor(100 + Math.random() * 900);
      const part2 = Math.floor(100 + Math.random() * 900);
      const part3 = Math.floor(100 + Math.random() * 900);
      mySystemInfo.device_id = `${part1} ${part2} ${part3}`;
      localStorage.setItem('desklink_my_id', mySystemInfo.device_id);
    }
    mySystemInfo.temp_password = Math.floor(100000 + Math.random() * 900000).toString();
    myDisplayResEl.textContent = `${window.screen.width}x${window.screen.height}`;
    myDeviceOsEl.textContent = navigator.userAgent.includes('Mac') ? 'macOS' : 'Windows';
  }

  // Arayüzü güncelle
  myDeviceIdEl.textContent = mySystemInfo.device_id;
  myTempPasswordEl.value = mySystemInfo.temp_password;
  myDeviceNameEl.textContent = mySystemInfo.device_name;
  myDeviceOsEl.textContent = mySystemInfo.os;
}

/**
 * WebRTC ve Sinyal Motorunu Başlatır
 */
function initWebRTC() {
  // Varsayılan sunucu: Deploy edilmiş signaling sunucusu
  // Kendi sunucunuzu deploy ettikten sonra bu URL'i ayarlardan değiştirin.
  // Railway deploy: railway up (server/ klasörü)
  const DEFAULT_SERVER = 'wss://desklink-live.loca.lt';
  const savedServer = localStorage.getItem('desklink_server_url') || DEFAULT_SERVER;
  const savedStun = localStorage.getItem('desklink_stun_server') || 'stun:stun.l.google.com:19302';
  const staticPass = localStorage.getItem('desklink_static_password') || mySystemInfo.temp_password;

  settingServerUrl.value = savedServer;
  settingStunServer.value = savedStun;

  webrtcEngine = new DeskLinkWebRTC({
    serverUrl: savedServer,
    stunServers: [{ urls: savedStun }],
    
    onStatusChange: (status, text) => {
      connectionStatusBadge.className = `status-badge ${status}`;
      connectionStatusText.textContent = text;
    },

    onIncomingRequest: (payload) => {
      pendingIncomingRequest = payload;
      incomingRequesterName.textContent = `${payload.fromName} (${payload.fromPeerId} - ${payload.fromOs})`;
      incomingDialog.showModal();
    },

    onSessionStarted: (payload) => {
      showToast('Oturum başarıyla başlatıldı!', 'success');

      if (webrtcEngine.isHost) {
        // Host (Ekranını paylaşan taraf)
        connectedClientLabel.textContent = payload.requesterName || payload.withPeerId;
        hostActiveSessionBar.classList.remove('hidden');
      } else {
        // Client (Uzak ekranı kontrol eden taraf)
        remotePeerTitle.textContent = `Uzak Masaüstü (${payload.targetId || webrtcEngine.activeSessionWith})`;
        mainDashboard.classList.add('hidden');
        sessionViewer.classList.remove('hidden');

        // Giriş Kontrolcüsünü başlat
        if (inputController) inputController.destroy();
        inputController = new InputController(remoteViewport, remoteVideo, (event) => {
          webrtcEngine.sendDataMessage(event);
        });

        saveRecentConnection(webrtcEngine.activeSessionWith);
      }
    },

    onRemoteStream: (stream) => {
      console.log('[App] Uzak akış alındı, video elementine atanıyor:', stream.getTracks());
      remoteVideo.srcObject = stream;
      remoteVideo.play().catch(err => {
        console.warn('Autoplay kısıtlaması, video sessiz modda başlatılıyor:', err);
        remoteVideo.muted = true;
        remoteVideo.play();
      });
    },

    onDataMessage: (msg) => {
      // Host tarafında gelen fare/klavye girdilerini yerel işletim sisteminde simüle et
      if (webrtcEngine.isHost) {
        executeRemoteInputOnHost(msg);
      }
    },

    onStats: ({ rtt, fps }) => {
      latencyBadge.textContent = `${rtt} ms`;
      fpsBadge.textContent = `${fps} FPS`;
    },

    onSessionEnded: (reason) => {
      showToast(reason, 'info');
      cleanupActiveSessionUi();
    },

    onError: (err) => {
      showToast(err, 'error');
    }
  });

  webrtcEngine.connectSignaling(
    { name: mySystemInfo.device_name, os: mySystemInfo.os },
    mySystemInfo.device_id,
    staticPass
  );
}

function cleanupActiveSessionUi() {
  mainDashboard.classList.remove('hidden');
  sessionViewer.classList.add('hidden');
  hostActiveSessionBar.classList.add('hidden');
  remoteVideo.srcObject = null;

  if (inputController) {
    inputController.destroy();
    inputController = null;
  }
}

/**
 * Son Bağlantılar (Recent History) Yönetimi
 */
function loadRecentConnections() {
  const recents = JSON.parse(localStorage.getItem('desklink_recents') || '[]');
  recentListEl.innerHTML = '';

  if (recents.length === 0) {
    recentListEl.innerHTML = '<div class="empty-recent">Henüz kayıtlı bir oturum bulunmuyor.</div>';
    return;
  }

  recents.forEach(item => {
    const el = document.createElement('div');
    el.className = 'recent-item';
    el.innerHTML = `
      <span class="recent-item-id">${item.id}</span>
      <span class="recent-item-time">${item.date}</span>
    `;
    el.addEventListener('click', () => {
      targetIdInput.value = item.id;
      btnClearTargetId.classList.remove('hidden');
    });
    recentListEl.appendChild(el);
  });
}

function saveRecentConnection(id) {
  let recents = JSON.parse(localStorage.getItem('desklink_recents') || '[]');
  recents = recents.filter(r => r.id !== id);
  recents.unshift({
    id,
    date: new Date().toLocaleDateString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  });
  if (recents.length > 8) recents.pop();
  localStorage.setItem('desklink_recents', JSON.stringify(recents));
  loadRecentConnections();
}

/**
 * Olay Dinleyicileri (Event Listeners)
 */
function setupEventListeners() {
  // ID Formatlama (3 hanede bir boşluk bırakma: 123 456 789)
  targetIdInput.addEventListener('input', (e) => {
    let val = e.target.value.replace(/\D/g, ''); // Sadece rakamları al
    if (val.length > 9) val = val.substring(0, 9);
    
    let formatted = '';
    for (let i = 0; i < val.length; i++) {
      if (i > 0 && i % 3 === 0) formatted += ' ';
      formatted += val[i];
    }
    e.target.value = formatted;
    btnClearTargetId.classList.toggle('hidden', formatted.length === 0);
  });

  btnClearTargetId.addEventListener('click', () => {
    targetIdInput.value = '';
    btnClearTargetId.classList.add('hidden');
    targetIdInput.focus();
  });

  // ID Kopyalama
  btnCopyId.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(mySystemInfo.device_id);
      btnCopyId.classList.add('copied');
      btnCopyId.querySelector('span').textContent = 'Kopyalandı!';
      setTimeout(() => {
        btnCopyId.classList.remove('copied');
        btnCopyId.querySelector('span').textContent = 'Kopyala';
      }, 2000);
    } catch (e) {
      showToast('Kopyalama başarısız oldu.', 'error');
    }
  });

  // Şifre Yenileme
  btnRefreshPassword.addEventListener('click', () => {
    const newPass = Math.floor(100000 + Math.random() * 900000).toString();
    mySystemInfo.temp_password = newPass;
    myTempPasswordEl.value = newPass;
    showToast('Yeni oturum parolası üretildi.', 'info');
  });

  // Şifre Gizle/Göster
  btnTogglePassword.addEventListener('click', () => {
    isPasswordVisible = !isPasswordVisible;
    myTempPasswordEl.type = isPasswordVisible ? 'text' : 'password';
  });

  // Bağlan Butonu
  btnConnect.addEventListener('click', () => {
    const rawId = targetIdInput.value.trim();
    if (!rawId || rawId.replace(/\s/g, '').length < 9) {
      showToast('Lütfen geçerli 9 haneli bir Masaüstü ID girin.', 'error');
      return;
    }

    const pass = targetPasswordInput.value.trim() || null;
    webrtcEngine.requestConnection(
      rawId,
      mySystemInfo.device_name,
      mySystemInfo.os,
      pass
    );
    showToast('Bağlantı isteği gönderildi, onay bekleniyor...', 'info');
  });

  // Gelen İstek Onayı / Reddi
  btnAcceptConnection.addEventListener('click', () => {
    if (pendingIncomingRequest) {
      const permissions = {
        control: permControl.checked,
        audio: permAudio.checked,
        clipboard: permClipboard.checked
      };
      incomingDialog.close();
      webrtcEngine.respondToIncomingRequest(pendingIncomingRequest.fromPeerId, true, permissions);
      pendingIncomingRequest = null;
    }
  });

  btnRejectConnection.addEventListener('click', () => {
    if (pendingIncomingRequest) {
      incomingDialog.close();
      webrtcEngine.respondToIncomingRequest(pendingIncomingRequest.fromPeerId, false, null);
      pendingIncomingRequest = null;
    }
  });

  // Host Oturum Kapatma
  btnHostDisconnect.addEventListener('click', () => {
    webrtcEngine.disconnectSession();
  });

  // Client Oturum Kapatma
  btnDisconnectSession.addEventListener('click', () => {
    webrtcEngine.disconnectSession();
  });

  // Tam Ekran Değiştirici
  btnToggleFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      sessionViewer.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // Ölçek Modu (Ekrana Sığdır vs Orijinal 1:1)
  btnScaleToggle.addEventListener('click', () => {
    isScaleFit = !isScaleFit;
    remoteViewport.classList.toggle('scale-original', !isScaleFit);
    scaleModeLabel.textContent = isScaleFit ? 'Sığdır' : '1:1';
  });

  // CAD (Ctrl + Alt + Del) Gönderme
  btnSendCad.addEventListener('click', () => {
    if (inputController) {
      inputController.sendCtrlAltDel();
      showToast('Ctrl + Alt + Del gönderildi.', 'info');
    }
  });

  // Klavye Kilidi / Girişi Aç-Kapa
  btnToggleKeyboardLock.addEventListener('click', () => {
    isKeyboardLocked = !isKeyboardLocked;
    btnToggleKeyboardLock.classList.toggle('active', isKeyboardLocked);
    if (inputController) {
      inputController.setKeyboardEnabled(isKeyboardLocked);
    }
    showToast(isKeyboardLocked ? 'Klavye girişi aktif.' : 'Klavye girişi devre dışı.', 'info');
  });

  // Pano Eşitleme
  btnSyncClipboard.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && webrtcEngine) {
        webrtcEngine.sendDataMessage({
          action: 'text',
          data: { content: text }
        });
        showToast('Pano metni uzak masaya aktarıldı.', 'success');
      }
    } catch (e) {
      showToast('Pano okunamadı.', 'error');
    }
  });

  // Erişilebilirlik İzni Açma Butonu (macOS)
  btnGrantPermission.addEventListener('click', async () => {
    const tauri = window.__TAURI__;
    if (tauri && tauri.core && tauri.core.invoke) {
      await tauri.core.invoke('open_accessibility_settings');
    }
  });

  // Ayarlar Modalı Aç/Kapat
  btnOpenSettings.addEventListener('click', () => settingsDialog.showModal());
  btnCloseSettings.addEventListener('click', () => settingsDialog.close());

  btnSaveSettings.addEventListener('click', () => {
    localStorage.setItem('desklink_server_url', settingServerUrl.value.trim());
    localStorage.setItem('desklink_stun_server', settingStunServer.value.trim());
    localStorage.setItem('desklink_static_password', settingStaticPassword.value.trim());
    settingsDialog.close();
    showToast('Ayarlar kaydedildi. Sunucuya yeniden bağlanılıyor...', 'info');
    webrtcEngine.serverUrl = settingServerUrl.value.trim();
    webrtcEngine.stunServers = [{ urls: settingStunServer.value.trim() }];
    webrtcEngine.connectSignaling(
      { name: mySystemInfo.device_name, os: mySystemInfo.os },
      mySystemInfo.device_id,
      settingStaticPassword.value.trim() || mySystemInfo.temp_password
    );
  });

  btnClearRecent.addEventListener('click', () => {
    localStorage.removeItem('desklink_recents');
    loadRecentConnections();
  });
}

// Uygulama Başlangıcı
window.addEventListener('DOMContentLoaded', async () => {
  await loadSystemInformation();
  loadRecentConnections();
  setupEventListeners();
  initWebRTC();
});
