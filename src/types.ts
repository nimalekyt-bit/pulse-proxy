export interface DetectedApp {
  pid: number;
  name: string;
  exe_name: string;
  full_path: string;
  folder_path: string;
  instance_count: number;
  category: string;
}

export interface AppRuleBinding {
  exe_name: string;
  name: string;
  full_path: string;
  folder_path: string;
  category: string;
  instance_count: number;
  enabled: boolean;
  folder_scope: boolean; // Route all child .exe files inside folder_path
  proxy_id: string;      // 'direct' | 'block' | proxyNode.id | proxyChain.id
  active_conns: number;
  speed_mbps: number;
}

export interface ProxyNode {
  id: string;
  name: string;
  protocol: 'SOCKS5' | 'SOCKS4' | 'SOCKS4A' | 'HTTPS' | 'HTTP' | string;
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
  custom_user_agent?: string | null;
  udp_relay: boolean;
  latency_ms?: number | null;
  status: 'online' | 'offline' | 'untested' | 'testing';
  country: string;
}

export interface ProxyChain {
  id: string;
  name: string;
  chain_type: 'simple' | 'redundancy' | 'load_balancing';
  proxy_ids: string[];
  enabled: boolean;
  timeout_sec: number;
}

export interface DiagnosticStage {
  stage_name: string;
  passed: boolean;
  duration_ms: number;
  detail: string;
}

export interface ProxyDiagnosticReport {
  proxy_id: string;
  overall_passed: boolean;
  total_latency_ms: number;
  stages: DiagnosticStage[];
  summary: string;
}

export interface ProxyProbeResult {
  id: string;
  reachable: boolean;
  protocol_handshake_ok: boolean;
  latency_ms?: number | null;
  status_message: string;
}

export interface RoutingRule {
  id: string;
  name: string;
  enabled: boolean;
  process_pattern: string; // e.g. "*", "chrome.exe; firefox.exe", "C:\\Games\\*"
  target_hosts: string;    // e.g. "*.openai.com, 192.168.0.0/16"
  ports: string;           // e.g. "*", "80; 443", "27015-27050"
  protocol: 'ANY' | 'TCP' | 'UDP';
  action: string;          // proxy.id | chain.id | 'direct' | 'block'
  is_builtin?: boolean;
}

export interface RuleMatchTestResult {
  matched_rule_id: string;
  matched_rule_name: string;
  action: string;
  dns_resolution: string;
  trace_notes: string[];
}

export interface EngineAdvancedOptions {
  dns_mode: 'auto' | 'remote_fakeip' | 'local_first';
  dns_exclusion_list: string;
  fake_ip_subnet: string;
  proxify_services_and_users: boolean;
  handle_direct_connections: boolean;
  loop_detection: boolean;
  http_proxy_all_ports: boolean;
  kill_switch_on_failure: boolean;
}

export interface FakeIpEntry {
  fake_ip: string;
  domain: string;
  hits: number;
}

export interface LiveConnectionEvent {
  id: string;
  timestamp: string;
  process_name: string;
  protocol: 'TCP' | 'UDP' | 'DNS';
  destination: string;
  fake_ip?: string;
  route_label: string;
  route_type: 'proxy' | 'chain' | 'direct' | 'block';
  latency_ms: number;
  bytes_Transferred: string;
}
