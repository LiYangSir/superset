pub fn key_to_bytes(key: &str, code: &str, ctrl: bool, alt: bool, shift: bool) -> Option<Vec<u8>> {
    if ctrl {
        if let Some(b) = ctrl_key(key) {
            return Some(if alt { vec![0x1b, b] } else { vec![b] });
        }
    }

    if let Some(seq) = special_key(code, shift, ctrl, alt) {
        return Some(seq);
    }

    if key.len() == 1 {
        let ch = key.chars().next().unwrap();
        let mut bytes = Vec::new();
        if alt {
            bytes.push(0x1b);
        }
        let mut buf = [0u8; 4];
        bytes.extend_from_slice(ch.encode_utf8(&mut buf).as_bytes());
        return Some(bytes);
    }

    None
}

fn ctrl_key(key: &str) -> Option<u8> {
    let ch = key.chars().next()?;
    match ch {
        'a'..='z' => Some(ch as u8 - b'a' + 1),
        'A'..='Z' => Some(ch as u8 - b'A' + 1),
        '[' | '{' => Some(0x1b),
        '\\' | '|' => Some(0x1c),
        ']' | '}' => Some(0x1d),
        '^' | '~' => Some(0x1e),
        '_' | '/' => Some(0x1f),
        '@' | ' ' => Some(0x00),
        _ => None,
    }
}

fn special_key(code: &str, shift: bool, ctrl: bool, alt: bool) -> Option<Vec<u8>> {
    let modifier = match (shift, alt, ctrl) {
        (false, false, false) => 0,
        (true, false, false) => 2,
        (false, true, false) => 3,
        (true, true, false) => 4,
        (false, false, true) => 5,
        (true, false, true) => 6,
        (false, true, true) => 7,
        (true, true, true) => 8,
    };

    let seq = match code {
        "Enter" | "NumpadEnter" => return Some(vec![b'\r']),
        "Backspace" => return Some(if alt { vec![0x1b, 0x7f] } else { vec![0x7f] }),
        "Tab" => {
            return Some(if shift {
                vec![0x1b, b'[', b'Z']
            } else {
                vec![b'\t']
            })
        }
        "Escape" => return Some(vec![0x1b]),
        "Delete" => {
            if modifier == 0 {
                return Some(vec![0x1b, b'[', b'3', b'~']);
            }
            return Some(format!("\x1b[3;{}~", modifier).into_bytes());
        }

        "ArrowUp" => "A",
        "ArrowDown" => "B",
        "ArrowRight" => "C",
        "ArrowLeft" => "D",
        "Home" => "H",
        "End" => "F",

        "F1" => return Some(esc_o_or_csi(b'P', modifier)),
        "F2" => return Some(esc_o_or_csi(b'Q', modifier)),
        "F3" => return Some(esc_o_or_csi(b'R', modifier)),
        "F4" => return Some(esc_o_or_csi(b'S', modifier)),
        "F5" => return Some(tilde_key(15, modifier)),
        "F6" => return Some(tilde_key(17, modifier)),
        "F7" => return Some(tilde_key(18, modifier)),
        "F8" => return Some(tilde_key(19, modifier)),
        "F9" => return Some(tilde_key(20, modifier)),
        "F10" => return Some(tilde_key(21, modifier)),
        "F11" => return Some(tilde_key(23, modifier)),
        "F12" => return Some(tilde_key(24, modifier)),

        "PageUp" => return Some(tilde_key(5, modifier)),
        "PageDown" => return Some(tilde_key(6, modifier)),
        "Insert" => return Some(tilde_key(2, modifier)),

        _ => return None,
    };

    if modifier == 0 {
        Some(format!("\x1b[{seq}").into_bytes())
    } else {
        Some(format!("\x1b[1;{modifier}{seq}").into_bytes())
    }
}

fn esc_o_or_csi(ch: u8, modifier: u8) -> Vec<u8> {
    if modifier == 0 {
        vec![0x1b, b'O', ch]
    } else {
        format!("\x1b[1;{modifier}{}", ch as char).into_bytes()
    }
}

fn tilde_key(num: u8, modifier: u8) -> Vec<u8> {
    if modifier == 0 {
        format!("\x1b[{num}~").into_bytes()
    } else {
        format!("\x1b[{num};{modifier}~").into_bytes()
    }
}
