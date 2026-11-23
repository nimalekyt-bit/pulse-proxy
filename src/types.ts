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
  proxy_id: string;      // 'direct' | 'block' | proxyNode.id
  active_conns: number;
  speed_mbps: number;
}

export interface ProxyNode {
  id: string;
  name: string;
  protocol: 'SOCKS5' | 'HTTP' | 'HTTPS' | string;
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
  udp_relay: boolean;
  latency_ms?: number | null;
  status: 'online' | 'offline' | 'untested' | 'testing';
  country: string;
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
  process_pattern: string; // e.g. "*", "chrome.exe", "C:\\Games\\*"
  target_hosts: string;    // e.g. "*.openai.com, *.anthropic.com"
  ports: string;           // e.g. "*", "443, 8443", "27015-27050"
  protocol: 'ANY' | 'TCP' | 'UDP';
  action: string;          // proxy.id | 'direct' | 'block'
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
  route_type: 'proxy' | 'direct' | 'block';
  latency_ms: number;
  bytes_Transferred: string;
}
