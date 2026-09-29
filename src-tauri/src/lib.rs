mod input;
mod system;

use input::{InputEvent, InputManager};
use system::{DisplayDetails, PermissionStatus, SystemInfo};
use tauri::State;

#[tauri::command]
fn get_system_info() -> SystemInfo {
    system::get_system_info()
}

#[tauri::command]
fn get_displays() -> Vec<DisplayDetails> {
    system::get_displays()
}

#[tauri::command]
fn check_permissions() -> PermissionStatus {
    system::check_permissions()
}

#[tauri::command]
fn open_accessibility_settings() {
    system::open_accessibility_settings();
}

#[tauri::command]
fn simulate_input(
    input_manager: State<'_, InputManager>,
    event: InputEvent,
) -> Result<(), String> {
    input_manager.handle_event(event)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let input_manager = InputManager::new();

    tauri::Builder::default()
        .manage(input_manager)
        .setup(|app| {
            if cfg!(debug_assertions) {
                let _ = app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .targets([
                            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                        ])
                        .level(log::LevelFilter::Info)
                        .build(),
                );
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            get_displays,
            check_permissions,
            open_accessibility_settings,
            simulate_input,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri uygulaması başlatılırken hata oluştu");
}
