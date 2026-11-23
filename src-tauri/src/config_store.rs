use crate::ppx_profile::{EngineAdvancedOptions, RoutingRule};
use crate::proxy_engine::{ProxyChain, ProxyNode, probe_proxy_node};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedAppBinding {
    pub exe_name: String,
    pub enabled: bool,
    pub folder_scope: bool,
    pub proxy_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PulseProxyConfig {
    pub proxies: Vec<ProxyNode>,
    pub chains: Vec<ProxyChain>,
    pub rules: Vec<RoutingRule>,
    pub default_rule_action: String,
    pub app_bindings: HashMap<String, SavedAppBinding>,
    pub options: EngineAdvancedOptions,
}

impl Default for PulseProxyConfig {
    fn default() -> Self {
        Self {
            // Zero mock proxies! Only real proxies added or discovered on the user's system.
            proxies: Vec::new(),
            chains: Vec::new(),
            rules: Vec::new(),
            default_rule_action: "direct".to_string(),
            app_bindings: HashMap::new(),
            options: EngineAdvancedOptions {
                dns_mode: "remote_fakeip".to_string(),
                dns_exclusion_list: "%ComputerName%; localhost; *.local; *.lan; 192.168.*".to_string(),
                fake_ip_subnet: "198.18.0.0/15".to_string(),
                proxify_services_and_users: false,
                handle_direct_connections: true,
                loop_detection: true,
                http_proxy_all_ports: true,
                kill_switch_on_failure: true,
            },
        }
    }
}

fn config_file_path() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        let dir = PathBuf::from(appdata).join("PulseProxy");
        let _ = fs::create_dir_all(&dir);
        dir.join("config.json")
    } else {
        PathBuf::from("pulseproxy_config.json")
    }
}

pub fn load_config_from_disk() -> PulseProxyConfig {
    let path = config_file_path();
    if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(cfg) = serde_json::from_str::<PulseProxyConfig>(&raw) {
            return cfg;
        }
    }
    PulseProxyConfig::default()
}

pub fn save_config_to_disk(cfg: &PulseProxyConfig) -> Result<(), String> {
    let path = config_file_path();
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

/// Scans real local ports on 127.0.0.1 for any active local proxy clients (v2rayN, Clash, Sing-box, Nekoray, Tor, SSH)
pub fn discover_real_local_proxies() -> Vec<ProxyNode> {
    let candidates = [
        (1080u16, "SOCKS5", "Local SOCKS5 (127.0.0.1:1080)"),
        (10808u16, "SOCKS5", "v2rayN / Xray Local (127.0.0.1:10808)"),
        (10809u16, "HTTP", "v2rayN HTTP (127.0.0.1:10809)"),
        (2080u16, "SOCKS5", "NekoRay / Sing-box (127.0.0.1:2080)"),
        (7890u16, "SOCKS5", "Clash / Mihomo Mixed (127.0.0.1:7890)"),
        (9050u16, "SOCKS5", "Tor SOCKS5 (127.0.0.1:9050)"),
    ];

    let mut found = Vec::new();
    for (port, proto, label) in candidates {
        let candidate = ProxyNode {
            id: format!("local-{}", port),
            name: label.to_string(),
            protocol: proto.to_string(),
            host: "127.0.0.1".to_string(),
            port,
            username: None,
            password: None,
            custom_user_agent: None,
            udp_relay: proto == "SOCKS5",
            latency_ms: None,
            status: "untested".to_string(),
            country: "LOCAL".to_string(),
        };

        let probe = probe_proxy_node(&candidate);
        if probe.reachable {
            found.push(ProxyNode {
                latency_ms: probe.latency_ms,
                status: "online".to_string(),
                ..candidate
            });
        }
    }
    found
}
