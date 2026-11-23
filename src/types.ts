export interface DetectedApp {
  pid: number;
  name: string;
  exe_name: string;
  full_path: string;
  folder_path: string;
  instance_count: number;
  category: string;
}

export interface SavedAppBinding {
  exe_name: string;
  enabled: boolean;
  folder_scope: boolean;
  proxy_id: string;
}

export interface AppRuleBinding {
  pid: number;
  exe_name: string;
  name: string;
  full_path: string;
  folder_path: string;
  category: string;
  instance_count: number;
  enabled: boolean;
  folder_scope: boolean;
  proxy_id: string; // 'direct' | 'block' | proxyNode.id | proxyChain.id
  active_conns: number;
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
  process_pattern: string;
  target_hosts: string;
  ports: string;
  protocol: 'ANY' | 'TCP' | 'UDP' | string;
  action: string;
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
  dns_mode: 'auto' | 'remote_fakeip' | 'local_first' | string;
  dns_exclusion_list: string;
  fake_ip_subnet: string;
  proxify_services_and_users: boolean;
  handle_direct_connections: boolean;
  loop_detection: boolean;
  http_proxy_all_ports: boolean;
  kill_switch_on_failure: boolean;
}

export interface PulseProxyConfig {
  proxies: ProxyNode[];
  chains: ProxyChain[];
  rules: RoutingRule[];
  default_rule_action: string;
  app_bindings: Record<string, SavedAppBinding>;
  options: EngineAdvancedOptions;
}

export interface FakeIpEntry {
  fake_ip: string;
  domain: string;
  hits: number;
}

export interface RealSocketConnection {
  id: string;
  pid: number;
  process_name: string;
  protocol: string;
  local_addr: string;
  local_port: number;
  remote_addr: string;
  remote_port: number;
  state: string;
}

export interface SystemNetworkSnapshot {
  download_bytes_per_sec: number;
  upload_bytes_per_sec: number;
  total_rx_bytes: number;
  total_tx_bytes: number;
  active_tcp_count: number;
  active_udp_count: number;
  connections: RealSocketConnection[];
  per_exe_connections: Record<string, number>;
}
