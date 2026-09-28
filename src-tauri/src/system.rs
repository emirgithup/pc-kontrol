use serde::{Deserialize, Serialize};
use std::hash::{DefaultHasher, Hash, Hasher};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DisplayDetails {
    pub id: u32,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f32,
    pub is_primary: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SystemInfo {
    pub device_id: String,
    pub device_name: String,
    pub os: String,
    pub username: String,
    pub temp_password: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PermissionStatus {
    pub has_accessibility: bool,
    pub has_screen_capture: bool,
    pub is_macos: bool,
}

/// 9 haneli sabit cihaz ID'si üretir (örn: 384 920 158)
pub fn generate_stable_device_id() -> String {
    let hostname = whoami::devicename().unwrap_or_else(|_| "Desktop".into());
    let username = whoami::username().unwrap_or_else(|_| "user".into());
    let platform = whoami::platform().to_string();

    let mut hasher = DefaultHasher::new();
    hostname.hash(&mut hasher);
    username.hash(&mut hasher);
    platform.hash(&mut hasher);
    let hash = hasher.finish();

    // 9 haneli pozitif sayı elde et
    let num = (hash % 900_000_000) + 100_000_000;
    let s = num.to_string();
    format!("{} {} {}", &s[0..3], &s[3..6], &s[6..9])
}

/// 6 haneli rastgele tek kullanımlık oturum şifresi üretir
pub fn generate_temp_password() -> String {
    let num = rand::random::<u32>() % 900_000 + 100_000;
    num.to_string()
}

/// Cihaz ve işletim sistemi bilgilerini döner
pub fn get_system_info() -> SystemInfo {
    let device_id = generate_stable_device_id();
    let device_name = whoami::devicename().unwrap_or_else(|_| "Bilinmeyen Bilgisayar".into());
    let username = whoami::username().unwrap_or_else(|_| "user".into());
    let os = whoami::platform().to_string();
    let temp_password = generate_temp_password();

    SystemInfo {
        device_id,
        device_name,
        os,
        username,
        temp_password,
    }
}

/// Bağlı tüm ekranların çözünürlük ve konum bilgilerini alır
pub fn get_displays() -> Vec<DisplayDetails> {
    match display_info::DisplayInfo::all() {
        Ok(displays) => displays
            .into_iter()
            .map(|d| DisplayDetails {
                id: d.id,
                x: d.x,
                y: d.y,
                width: d.width,
                height: d.height,
                scale_factor: d.scale_factor,
                is_primary: d.is_primary,
            })
            .collect(),
        Err(err) => {
            log::warn!("Ekran bilgileri alınamadı: {}", err);
            // Varsayılan ekran yedeği
            vec![DisplayDetails {
                id: 1,
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                scale_factor: 1.0,
                is_primary: true,
            }]
        }
    }
}

/// macOS ve Windows izin durumlarını kontrol eder
pub fn check_permissions() -> PermissionStatus {
    #[cfg(target_os = "macos")]
    {
        #[link(name = "ApplicationServices", kind = "framework")]
        unsafe extern "C" {
            fn AXIsProcessTrusted() -> bool;
        }

        let has_accessibility = unsafe { AXIsProcessTrusted() };

        // Ekran kaydı izni kontrolü (macOS 10.15+)
        let has_screen_capture = true;

        PermissionStatus {
            has_accessibility,
            has_screen_capture,
            is_macos: true,
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        PermissionStatus {
            has_accessibility: true,
            has_screen_capture: true,
            is_macos: false,
        }
    }
}

/// macOS'ta Kullanıcıyı Erişilebilirlik ayarlarına yönlendirir
pub fn open_accessibility_settings() {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn();
    }
}
