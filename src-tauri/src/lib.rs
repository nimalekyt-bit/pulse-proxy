pub mod fake_dns;
pub mod process_radar;
pub mod proxy_engine;

use fake_dns::{FakeDnsResolver, FakeIpEntry};
use process_radar::{DetectedApp, scan_running_apps};
use proxy_engine::{ProxyNode, ProxyProbeResult, parse_clipboard_proxies, probe_proxy_node};
use std::sync::Mutex;
use tauri::State;

pub struct AppEngineState {
    pub fake_dns: Mutex<FakeDnsResolver>,
}

#[tauri::command]
fn get_running_processes() -> Vec<DetectedApp> {
    scan_running_apps()
}

#[tauri::command]
fn probe_proxy(node: ProxyNode) -> ProxyProbeResult {
    probe_proxy_node(&node)
}

#[tauri::command]
fn parse_proxies_bulk(raw_text: String) -> Vec<ProxyNode> {
    parse_clipboard_proxies(&raw_text)
}

#[tauri::command]
fn resolve_fake_ip(domain: String, state: State<'_, AppEngineState>) -> String {
    if let Ok(mut dns) = state.fake_dns.lock() {
        dns.allocate_or_get(&domain)
    } else {
        "198.18.0.10".to_string()
    }
}

#[tauri::command]
fn get_fake_dns_table(state: State<'_, AppEngineState>) -> Vec<FakeIpEntry> {
    if let Ok(dns) = state.fake_dns.lock() {
        dns.entries()
    } else {
        Vec::new()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppEngineState {
            fake_dns: Mutex::new(FakeDnsResolver::new()),
        })
        .invoke_handler(tauri::generate_handler![
            get_running_processes,
            probe_proxy,
            parse_proxies_bulk,
            resolve_fake_ip,
            get_fake_dns_table,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PulseProxy application");
}
