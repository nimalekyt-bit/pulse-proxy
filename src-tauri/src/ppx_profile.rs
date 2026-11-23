use crate::proxy_engine::{ProxyChain, ProxyNode};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingRule {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub process_pattern: String, // e.g. "chrome.exe; firefox.exe; C:\\Games\\*"
    pub target_hosts: String,    // e.g. "*.openai.com; 192.168.0.0/16; 10.0.0.1-10.0.0.255"
    pub ports: String,           // e.g. "80; 443; 27015-27050"
    pub protocol: String,        // "ANY" | "TCP" | "UDP"
    pub action: String,          // proxy.id | chain.id | "direct" | "block"
    pub is_builtin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineAdvancedOptions {
    pub dns_mode: String, // "auto" | "remote_fakeip" | "local_first"
    pub dns_exclusion_list: String,
    pub fake_ip_subnet: String,
    pub proxify_services_and_users: bool,
    pub handle_direct_connections: bool,
    pub loop_detection: bool,
    pub http_proxy_all_ports: bool,
    pub kill_switch_on_failure: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleMatchTestResult {
    pub matched_rule_id: String,
    pub matched_rule_name: String,
    pub action: String,
    pub dns_resolution: String,
    pub trace_notes: Vec<String>,
}

/// Evaluates a hypothetical connection against the ordered rules list (exactly like Proxifier's rule engine)
pub fn evaluate_connection(
    process_name: &str,
    target_host: &str,
    target_port: u16,
    protocol: &str,
    rules: &[RoutingRule],
    dns_mode: &str,
) -> RuleMatchTestResult {
    let mut trace = Vec::new();
    let proc_lower = process_name.trim().to_lowercase();
    let host_lower = target_host.trim().to_lowercase();
    let proto_upper = protocol.trim().to_uppercase();

    // 1. Check built-in Localhost rule first
    if host_lower == "localhost"
        || host_lower == "127.0.0.1"
        || host_lower == "::1"
        || host_lower.starts_with("127.")
    {
        trace.push("Совпадение с системным правилом Localhost (127.0.0.1 / ::1)".to_string());
        return RuleMatchTestResult {
            matched_rule_id: "rule-localhost".to_string(),
            matched_rule_name: "Localhost (Встроенное правило)".to_string(),
            action: "direct".to_string(),
            dns_resolution: "Локальный (Localhost)".to_string(),
            trace_notes: trace,
        };
    }

    // 2. Evaluate user rules top-to-bottom
    for (idx, rule) in rules.iter().enumerate() {
        if !rule.enabled {
            continue;
        }

        let proc_ok = match_pattern_list(&proc_lower, &rule.process_pattern);
        let host_ok = match_pattern_list(&host_lower, &rule.target_hosts);
        let port_ok = match_port_list(target_port, &rule.ports);
        let proto_ok = rule.protocol == "ANY" || rule.protocol.to_uppercase() == proto_upper;

        if proc_ok && host_ok && port_ok && proto_ok {
            trace.push(format!(
                "Правило #{} «{}» совпало: процесс [{}], хост [{}], порт [{}]",
                idx + 1,
                rule.name,
                rule.process_pattern,
                rule.target_hosts,
                rule.ports
            ));
            let dns_desc = if rule.action == "direct" {
                "Локальный системный DNS".to_string()
            } else if dns_mode == "remote_fakeip" {
                "Через прокси (FakeIP 198.18.0.0/15 — без DNS-утечек)".to_string()
            } else {
                "Автоматическое определение DNS".to_string()
            };
            return RuleMatchTestResult {
                matched_rule_id: rule.id.clone(),
                matched_rule_name: rule.name.clone(),
                action: rule.action.clone(),
                dns_resolution: dns_desc,
                trace_notes: trace,
            };
        }
    }

    trace.push("Ни одно пользовательское правило не подошло → применено правило Default".to_string());
    RuleMatchTestResult {
        matched_rule_id: "rule-default".to_string(),
        matched_rule_name: "Default (По умолчанию)".to_string(),
        action: "direct".to_string(),
        dns_resolution: "Локальный системный DNS".to_string(),
        trace_notes: trace,
    }
}

fn match_pattern_list(value: &str, pattern_list: &str) -> bool {
    let trimmed = pattern_list.trim();
    if trimmed.is_empty() || trimmed == "*" || trimmed.eq_ignore_ascii_case("any") {
        return true;
    }

    for part in trimmed.split(|c| c == ';' || c == ',') {
        let p = part.trim().to_lowercase();
        if p.is_empty() {
            continue;
        }
        if p == "*" || p == value {
            return true;
        }
        if wildcard_match(&p, value) {
            return true;
        }
    }
    false
}

fn wildcard_match(pattern: &str, text: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    let parts: Vec<&str> = pattern.split('*').collect();
    if parts.len() == 1 {
        return pattern == text;
    }
    let mut pos = 0usize;
    for (i, seg) in parts.iter().enumerate() {
        if seg.is_empty() {
            continue;
        }
        if i == 0 && !pattern.starts_with('*') {
            if !text.starts_with(seg) {
                return false;
            }
            pos = seg.len();
        } else if i == parts.len() - 1 && !pattern.ends_with('*') {
            if !text[pos..].ends_with(seg) {
                return false;
            }
            return true;
        } else if let Some(found) = text[pos..].find(seg) {
            pos += found + seg.len();
        } else {
            return false;
        }
    }
    true
}

fn match_port_list(port: u16, port_expr: &str) -> bool {
    let trimmed = port_expr.trim();
    if trimmed.is_empty() || trimmed == "*" || trimmed.eq_ignore_ascii_case("any") {
        return true;
    }

    for token in trimmed.split(|c| c == ';' || c == ',') {
        let t = token.trim();
        if t.is_empty() || t == "*" {
            return true;
        }
        if let Some((start_s, end_s)) = t.split_once('-') {
            if let (Ok(s), Ok(e)) = (start_s.trim().parse::<u16>(), end_s.trim().parse::<u16>()) {
                if port >= s && port <= e {
                    return true;
                }
            }
        } else if let Ok(single) = t.parse::<u16>() {
            if port == single {
                return true;
            }
        }
    }
    false
}

/// Exports current configuration into authentic Proxifier `.ppx` XML format
pub fn export_proxifier_ppx(
    proxies: &[ProxyNode],
    chains: &[ProxyChain],
    rules: &[RoutingRule],
) -> String {
    let mut xml = String::new();
    xml.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
    xml.push_str("<ProxifierProfile version=\"102\" platform=\"Windows\" product_id=\"0\" product_minver=\"400\">\n");
    xml.push_str("  <Options>\n");
    xml.push_str("    <Resolve>\n");
    xml.push_str("      <AutoModeDetection enabled=\"true\" />\n");
    xml.push_str("      <ViaProxy enabled=\"true\" />\n");
    xml.push_str("      <ExclusionList>%ComputerName%; localhost; *.local</ExclusionList>\n");
    xml.push_str("    </Resolve>\n");
    xml.push_str("    <Encryption mode=\"basic\" />\n");
    xml.push_str("    <HttpProxiesSupport enabled=\"true\" />\n");
    xml.push_str("    <HandleDirectConnections enabled=\"true\" />\n");
    xml.push_str("    <ConnectionLoopDetection enabled=\"true\" />\n");
    xml.push_str("    <ProcessServices enabled=\"true\" />\n");
    xml.push_str("    <ProcessOtherUsers enabled=\"true\" />\n");
    xml.push_str("  </Options>\n");

    xml.push_str("  <ProxyList>\n");
    for (i, p) in proxies.iter().enumerate() {
        let num_id = 100 + i;
        xml.push_str(&format!(
            "    <Proxy id=\"{}\" type=\"{}\">\n      <Address>{}</Address>\n      <Port>{}</Port>\n      <Options>48</Options>\n    </Proxy>\n",
            num_id, p.protocol, p.host, p.port
        ));
    }
    xml.push_str("  </ProxyList>\n");

    xml.push_str("  <ChainList>\n");
    for (i, c) in chains.iter().enumerate() {
        let num_id = 200 + i;
        xml.push_str(&format!(
            "    <Chain id=\"{}\" type=\"{}\">\n      <Name>{}</Name>\n    </Chain>\n",
            num_id, c.chain_type, c.name
        ));
    }
    xml.push_str("  </ChainList>\n");

    xml.push_str("  <RuleList>\n");
    for r in rules {
        let action_type = if r.action == "direct" {
            "Direct"
        } else if r.action == "block" {
            "Block"
        } else {
            "Proxy"
        };
        xml.push_str(&format!(
            "    <Rule enabled=\"{}\">\n      <Name>{}</Name>\n      <Applications>{}</Applications>\n      <Targets>{}</Targets>\n      <Ports>{}</Ports>\n      <Action type=\"{}\">{}</Action>\n    </Rule>\n",
            r.enabled, r.name, r.process_pattern, r.target_hosts, r.ports, action_type, r.action
        ));
    }
    xml.push_str("  </RuleList>\n");
    xml.push_str("</ProxifierProfile>\n");
    xml
}
