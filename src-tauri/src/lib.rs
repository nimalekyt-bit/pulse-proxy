pub mod fake_dns;
pub mod ppx_profile;
pub mod process_radar;
pub mod proxy_engine;

use fake_dns::{FakeDnsResolver, FakeIpEntry};
use ppx_profile::{RuleMatchTestResult, RoutingRule, evaluate_connection, export_proxifier_ppx};
use process_radar::{DetectedApp, scan_running_apps};
use proxy_engine::{
    ProxyChain, ProxyDiagnosticReport, ProxyNode, ProxyProbeResult, parse_clipboard_proxies,
    probe_proxy_node, run_full_proxy_diagnostics,
};
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
fn run_proxy_checker(
    node: ProxyNode,
    target_host: String,
    target_port: u16,
) -> ProxyDiagnosticReport {
    run_full_proxy_diagnostics(&node, &target_host, target_port)
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
fn flush_fake_dns(state: State<'_, AppEngineState>) -> Vec<FakeIpEntry> {
    if let Ok(mut dns) = state.fake_dns.lock() {
        dns.flush();
        dns.entries()
    } else {
        Vec::new()
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

#[tauri::command]
fn test_rule_evaluation(
    process_name: String,
    target_host: String,
    target_port: u16,
    protocol: String,
    rules: Vec<RoutingRule>,
    dns_mode: String,
) -> RuleMatchTestResult {
    evaluate_connection(
        &process_name,
        &target_host,
        target_port,
        &protocol,
        &rules,
        &dns_mode,
    )
}

#[tauri::command]
fn export_ppx_profile(
    proxies: Vec<ProxyNode>,
    chains: Vec<ProxyChain>,
    rules: Vec<RoutingRule>,
) -> String {
    export_proxifier_ppx(&proxies, &chains, &rules)
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
            run_proxy_checker,
            parse_proxies_bulk,
            resolve_fake_ip,
            flush_fake_dns,
            get_fake_dns_table,
            test_rule_evaluation,
            export_ppx_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PulseProxy application");
}
