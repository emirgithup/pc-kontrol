/**
 * DeskLink - Uzak Giriş Yakalayıcı ve Yönlendirici (Input Controller)
 */

export class InputController {
  constructor(viewportElement, videoElement, sendCallback) {
    this.viewport = viewportElement;
    this.video = videoElement;
    this.send = sendCallback; // DataChannel üzerinden gönderme fonksiyonu
    this.enabled = true;
    this.keyboardEnabled = true;

    this.lastMoveTime = 0;
    this.moveThrottleMs = 12; // ~80 FPS fare takip sıklığı

    this.bindEvents();
  }

  setKeyboardEnabled(state) {
    this.keyboardEnabled = state;
  }

  /**
   * Video üzerindeki koordinatları 0.0 - 1.0 aralığına normalize eder
   */
  getNormalizedCoordinates(e) {
    const rect = this.video.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    let x = (e.clientX - rect.left) / rect.width;
    let y = (e.clientY - rect.top) / rect.height;

    // Sınır kontrolü (0 ile 1 arasına sabitle)
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));

    return { x, y };
  }

  bindEvents() {
    // 1. Fare Hareketi (Mouse Move)
    this.viewport.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      const now = performance.now();
      if (now - this.lastMoveTime < this.moveThrottleMs) return;
      this.lastMoveTime = now;

      const coords = this.getNormalizedCoordinates(e);
      if (!coords) return;

      this.send({
        action: 'mousemove',
        data: { x: coords.x, y: coords.y }
      });
    });

    // 2. Fare Tıklamaları (Mouse Down & Up)
    this.viewport.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      const btn = this.getButtonName(e.button);
      this.send({
        action: 'mousedown',
        data: { button: btn }
      });
    });

    this.viewport.addEventListener('mouseup', (e) => {
      if (!this.enabled) return;
      const btn = this.getButtonName(e.button);
      this.send({
        action: 'mouseup',
        data: { button: btn }
      });
    });

    // Sağ Tık Menüsünü Engelle (Uzak bilgisayara gitsin)
    this.viewport.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      return false;
    });

    // 3. Fare Tekerleği (Scroll / Wheel)
    this.viewport.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();

      this.send({
        action: 'wheel',
        data: {
          delta_x: Math.round(e.deltaX),
          delta_y: Math.round(e.deltaY)
        }
      });
    }, { passive: false });

    // 4. Klavye Olayları (Key Down & Key Up)
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || !this.keyboardEnabled) return;
      
      // Eğer kullanıcı arayüzdeki bir input kutusuna yazıyorsa uzak ekrana gönderme
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Tarayıcının varsayılan kısayollarını engelle (Tab, Backspace, Boşluk, Yön tuşları)
      if (['Tab', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      this.send({
        action: 'keydown',
        data: {
          key: e.key,
          code: e.code
        }
      });
    });

    window.addEventListener('keyup', (e) => {
      if (!this.enabled || !this.keyboardEnabled) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      this.send({
        action: 'keyup',
        data: {
          key: e.key,
          code: e.code
        }
      });
    });
  }

  getButtonName(btnCode) {
    switch (btnCode) {
      case 2: return 'right';
      case 1: return 'middle';
      default: return 'left';
    }
  }

  /**
   * Ctrl + Alt + Del tuş kombinasyonunu gönder
   */
  sendCtrlAltDel() {
    this.send({ action: 'keydown', data: { key: 'Control' } });
    this.send({ action: 'keydown', data: { key: 'Alt' } });
    this.send({ action: 'keydown', data: { key: 'Delete' } });

    setTimeout(() => {
      this.send({ action: 'keyup', data: { key: 'Delete' } });
      this.send({ action: 'keyup', data: { key: 'Alt' } });
      this.send({ action: 'keyup', data: { key: 'Control' } });
    }, 100);
  }

  destroy() {
    this.enabled = false;
  }
}

/**
 * Host Tarafında Gelen Olayları Rust Çekirdeğine Aktarır
 */
export async function executeRemoteInputOnHost(event) {
  // Eğer Tauri ortamındaysa yerel işletim sistemi fonksiyonunu çağır
  const tauri = window.__TAURI__;
  if (tauri && tauri.core && tauri.core.invoke) {
    try {
      await tauri.core.invoke('simulate_input', { event });
    } catch (err) {
      console.error('[Host Input] Simülasyon hatası:', err);
    }
  } else {
    // Tarayıcı içi önizleme / simülasyon modu
    // console.log('[Web Fallback Input Simüle Edildi]:', event);
  }
}
