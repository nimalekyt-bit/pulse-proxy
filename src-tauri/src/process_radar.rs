use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedApp {
    pub pid: u32,
    pub name: String,
    pub exe_name: String,
    pub full_path: String,
    pub folder_path: String,
    pub instance_count: usize,
    pub category: String,
}

/// Scans running Windows processes via Win32 ToolHelp32 API and groups them by executable name
pub fn scan_running_apps() -> Vec<DetectedApp> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE, MAX_PATH};
        use windows_sys::Win32::System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
            TH32CS_SNAPPROCESS,
        };
        use windows_sys::Win32::System::Threading::{
            OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
        };

        let mut grouped: HashMap<String, DetectedApp> = HashMap::new();

        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot == INVALID_HANDLE_VALUE {
                return Vec::new();
            }

            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

            if Process32FirstW(snapshot, &mut entry) != 0 {
                loop {
                    let pid = entry.th32ProcessID;
                    let len = entry
                        .szExeFile
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.szExeFile.len());
                    let exe_name = String::from_utf16_lossy(&entry.szExeFile[..len]);

                    if !is_noise_system_process(&exe_name) {
                        let mut full_path = exe_name.clone();
                        let mut folder_path = String::from("C:\\Program Files");

                        let h_proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
                        if !h_proc.is_null() {
                            let mut buf = [0u16; MAX_PATH as usize * 2];
                            let mut size = buf.len() as u32;
                            if QueryFullProcessImageNameW(h_proc, 0, buf.as_mut_ptr(), &mut size)
                                != 0
                            {
                                full_path = String::from_utf16_lossy(&buf[..size as usize]);
                                if let Some(parent) = Path::new(&full_path).parent() {
                                    folder_path = parent.to_string_lossy().to_string();
                                }
                            }
                            CloseHandle(h_proc);
                        }

                        let key = exe_name.to_lowercase();
                        if let Some(existing) = grouped.get_mut(&key) {
                            existing.instance_count += 1;
                        } else {
                            let friendly = friendly_app_name(&exe_name);
                            let category = classify_app(&exe_name, &folder_path);
                            grouped.insert(
                                key,
                                DetectedApp {
                                    pid,
                                    name: friendly,
                                    exe_name,
                                    full_path,
                                    folder_path,
                                    instance_count: 1,
                                    category,
                                },
                            );
                        }
                    }

                    if Process32NextW(snapshot, &mut entry) == 0 {
                        break;
                    }
                }
            }

            CloseHandle(snapshot);
        }

        let mut list: Vec<DetectedApp> = grouped.into_values().collect();
        list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        list
    }

    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
}

fn is_noise_system_process(exe: &str) -> bool {
    let lower = exe.to_lowercase();
    matches!(
        lower.as_str(),
        "[system process]"
            | "system"
            | "registry"
            | "smss.exe"
            | "csrss.exe"
            | "wininit.exe"
            | "services.exe"
            | "lsass.exe"
            | "svchost.exe"
            | "fontdrvhost.exe"
            | "winlogon.exe"
            | "dwm.exe"
            | "spoolsv.exe"
            | "conhost.exe"
            | "sihost.exe"
            | "taskhostw.exe"
            | "ctfmon.exe"
            | "dllhost.exe"
            | "runtimebroker.exe"
            | "searchindexer.exe"
            | "securityhealthservice.exe"
            | "wudfhost.exe"
    )
}

fn friendly_app_name(exe_name: &str) -> String {
    let lower = exe_name.to_lowercase();
    match lower.as_str() {
        "chrome.exe" => "Google Chrome".to_string(),
        "msedge.exe" => "Microsoft Edge".to_string(),
        "firefox.exe" => "Mozilla Firefox".to_string(),
        "brave.exe" => "Brave Browser".to_string(),
        "opera.exe" => "Opera Browser".to_string(),
        "discord.exe" => "Discord".to_string(),
        "telegram.exe" => "Telegram Desktop".to_string(),
        "spotify.exe" => "Spotify Music".to_string(),
        "steam.exe" => "Steam Client".to_string(),
        "cs2.exe" => "Counter-Strike 2".to_string(),
        "dota2.exe" => "Dota 2".to_string(),
        "code.exe" => "Visual Studio Code".to_string(),
        "cursor.exe" => "Cursor AI IDE".to_string(),
        "obs64.exe" => "OBS Studio".to_string(),
        "javaw.exe" | "java.exe" => "Java / Minecraft Runtime".to_string(),
        _ => {
            let trimmed = exe_name.trim_end_matches(".exe").trim_end_matches(".EXE");
            let mut chars = trimmed.chars();
            match chars.next() {
                None => exe_name.to_string(),
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
            }
        }
    }
}

fn classify_app(exe_name: &str, folder_path: &str) -> String {
    let lower = exe_name.to_lowercase();
    let folder_lower = folder_path.to_lowercase();
    if matches!(
        lower.as_str(),
        "chrome.exe" | "msedge.exe" | "firefox.exe" | "brave.exe" | "opera.exe"
    ) {
        "Браузер".to_string()
    } else if matches!(lower.as_str(), "discord.exe" | "telegram.exe" | "slack.exe") {
        "Мессенджер & Голос".to_string()
    } else if matches!(
        lower.as_str(),
        "steam.exe" | "cs2.exe" | "dota2.exe" | "epicgameslauncher.exe" | "javaw.exe"
    ) || folder_lower.contains("steamapps")
        || folder_lower.contains("games")
    {
        "Игры".to_string()
    } else if matches!(
        lower.as_str(),
        "code.exe" | "cursor.exe" | "node.exe" | "python.exe" | "docker.exe"
    ) {
        "Разработка & AI".to_string()
    } else {
        "Приложение".to_string()
    }
}
