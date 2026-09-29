use enigo::{Axis, Button, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use crate::system::get_displays;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "action", content = "data")]
pub enum InputEvent {
    #[serde(rename = "mousemove")]
    MouseMove { x: f64, y: f64, display_id: Option<u32> },

    #[serde(rename = "mousedown")]
    MouseDown { button: String },

    #[serde(rename = "mouseup")]
    MouseUp { button: String },

    #[serde(rename = "click")]
    Click { button: String },

    #[serde(rename = "wheel")]
    Wheel { delta_x: i32, delta_y: i32 },

    #[serde(rename = "keydown")]
    KeyDown { key: String, code: Option<String> },

    #[serde(rename = "keyup")]
    KeyUp { key: String, code: Option<String> },

    #[serde(rename = "text")]
    Text { content: String },
}

pub struct InputManager {
    enigo: Mutex<Option<Enigo>>,
}

impl InputManager {
    pub fn new() -> Self {
        let enigo = Enigo::new(&Settings::default()).ok();
        Self {
            enigo: Mutex::new(enigo),
        }
    }

    pub fn handle_event(&self, event: InputEvent) -> Result<(), String> {
        let mut enigo_guard = self.enigo.lock().map_err(|_| "Enigo kilitlenemedi")?;

        if enigo_guard.is_none() {
            *enigo_guard = Enigo::new(&Settings::default()).ok();
        }

        let enigo = enigo_guard.as_mut().ok_or("Erişilebilirlik (Accessibility) izni verilmedi. Lütfen sistem ayarlarından DeskLink'e izin verin.")?;

        match event {
            InputEvent::MouseMove { x, y, display_id } => {
                let displays = get_displays();
                let display = if let Some(id) = display_id {
                    displays.iter().find(|d| d.id == id).cloned()
                } else {
                    displays.iter().find(|d| d.is_primary).cloned()
                }.unwrap_or_else(|| {
                    displays.first().cloned().unwrap_or(crate::system::DisplayDetails {
                        id: 1,
                        x: 0,
                        y: 0,
                        width: 1920,
                        height: 1080,
                        scale_factor: 1.0,
                        is_primary: true,
                    })
                });

                // 0.0 - 1.0 normalize koordinatları ekran pikseline çevir
                let pixel_x = display.x + (x * display.width as f64) as i32;
                let pixel_y = display.y + (y * display.height as f64) as i32;

                let _ = enigo.move_mouse(pixel_x, pixel_y, Coordinate::Abs);
            }

            InputEvent::MouseDown { button } => {
                let btn = parse_button(&button);
                let _ = enigo.button(btn, Direction::Press);
            }

            InputEvent::MouseUp { button } => {
                let btn = parse_button(&button);
                let _ = enigo.button(btn, Direction::Release);
            }

            InputEvent::Click { button } => {
                let btn = parse_button(&button);
                let _ = enigo.button(btn, Direction::Click);
            }

            InputEvent::Wheel { delta_x, delta_y } => {
                if delta_y != 0 {
                    // Kaydırma yönü ve büyüklüğü
                    let _ = enigo.scroll(-delta_y, Axis::Vertical);
                }
                if delta_x != 0 {
                    let _ = enigo.scroll(delta_x, Axis::Horizontal);
                }
            }

            InputEvent::KeyDown { key, code: _ } => {
                if let Some(enigo_key) = parse_key(&key) {
                    let _ = enigo.key(enigo_key, Direction::Press);
                }
            }

            InputEvent::KeyUp { key, code: _ } => {
                if let Some(enigo_key) = parse_key(&key) {
                    let _ = enigo.key(enigo_key, Direction::Release);
                }
            }

            InputEvent::Text { content } => {
                for ch in content.chars() {
                    let _ = enigo.key(Key::Unicode(ch), Direction::Click);
                }
            }
        }

        Ok(())
    }
}

fn parse_button(btn: &str) -> Button {
    match btn.to_lowercase().as_str() {
        "right" | "2" => Button::Right,
        "middle" | "1" => Button::Middle,
        _ => Button::Left,
    }
}

fn parse_key(key: &str) -> Option<Key> {
    match key {
        "Enter" | "Return" => Some(Key::Return),
        "Backspace" => Some(Key::Backspace),
        "Tab" => Some(Key::Tab),
        "Escape" | "Esc" => Some(Key::Escape),
        " " | "Space" => Some(Key::Space),
        "ArrowUp" | "Up" => Some(Key::UpArrow),
        "ArrowDown" | "Down" => Some(Key::DownArrow),
        "ArrowLeft" | "Left" => Some(Key::LeftArrow),
        "ArrowRight" | "Right" => Some(Key::RightArrow),
        "Shift" | "ShiftLeft" | "ShiftRight" => Some(Key::Shift),
        "Control" | "ControlLeft" | "ControlRight" => Some(Key::Control),
        "Alt" | "AltLeft" | "AltRight" => Some(Key::Alt),
        "Meta" | "MetaLeft" | "MetaRight" | "Command" | "Win" => Some(Key::Meta),
        "Delete" => Some(Key::Delete),
        "Home" => Some(Key::Home),
        "End" => Some(Key::End),
        "PageUp" => Some(Key::PageUp),
        "PageDown" => Some(Key::PageDown),
        "CapsLock" => Some(Key::CapsLock),
        other => {
            if other.chars().count() == 1 {
                other.chars().next().map(Key::Unicode)
            } else {
                None
            }
        }
    }
}
