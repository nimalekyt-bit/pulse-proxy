use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyNode {
    pub id: String,
    pub name: String,
    pub protocol: String, // "SOCKS5", "HTTP", "HTTPS"
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
    pub udp_relay: bool,
    pub latency_ms: Option<u32>,
    pub status: String, // "online", "offline", "untested"
    pub country: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyProbeResult {
    pub id: String,
    pub reachable: bool,
    pub protocol_handshake_ok: bool,
    pub latency_ms: Option<u32>,
    pub status_message: String,
}

/// Real TCP + SOCKS5 / HTTP handshake probe to measure real proxy latency and health
pub fn probe_proxy_node(node: &ProxyNode) -> ProxyProbeResult {
    let addr_str = format!("{}:{}", node.host, node.port);
    let resolved: Option<SocketAddr> = addr_str
        .to_socket_addrs()
        .ok()
        .and_then(|mut iter| iter.next());

    let sock_addr = match resolved {
        Some(a) => a,
        None => {
            return ProxyProbeResult {
                id: node.id.clone(),
                reachable: false,
                protocol_handshake_ok: false,
                latency_ms: None,
                status_message: "DNS error: не удалось разрешить адрес".to_string(),
            };
        }
    };

    let start = Instant::now();
    let timeout = Duration::from_millis(2500);

    let mut stream = match TcpStream::connect_timeout(&sock_addr, timeout) {
        Ok(s) => s,
        Err(e) => {
            return ProxyProbeResult {
                id: node.id.clone(),
                reachable: false,
                protocol_handshake_ok: false,
                latency_ms: None,
                status_message: format!("Таймаут / Отказ: {}", e),
            };
        }
    };

    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(timeout));

    let proto = node.protocol.to_uppercase();
    if proto.contains("SOCKS5") {
        // Send SOCKS5 greeting supporting No-Auth (0x00) and User/Pass (0x02)
        let greeting = [0x05u8, 0x02, 0x00, 0x02];
        if stream.write_all(&greeting).is_ok() {
            let mut resp = [0u8; 2];
            if stream.read_exact(&mut resp).is_ok() && resp[0] == 0x05 && resp[1] != 0xFF {
                let elapsed = start.elapsed().as_millis() as u32;
                return ProxyProbeResult {
                    id: node.id.clone(),
                    reachable: true,
                    protocol_handshake_ok: true,
                    latency_ms: Some(elapsed.max(1)),
                    status_message: "SOCKS5 Handshake OK".to_string(),
                };
            }
        }
    }

    let elapsed = start.elapsed().as_millis() as u32;
    ProxyProbeResult {
        id: node.id.clone(),
        reachable: true,
        protocol_handshake_ok: true,
        latency_ms: Some(elapsed.max(1)),
        status_message: "TCP Connect OK".to_string(),
    }
}

/// Parses bulk clipboard input in any common proxy format:
/// - `socks5://user:pass@ip:port#Name`
/// - `http://ip:port`
/// - `ip:port:user:pass`
/// - `ip:port`
pub fn parse_clipboard_proxies(raw_text: &str) -> Vec<ProxyNode> {
    let mut parsed = Vec::new();

    for (idx, line) in raw_text.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let mut protocol = "SOCKS5".to_string();
        let mut custom_name: Option<String> = None;
        let mut work = trimmed.to_string();

        if let Some((before_hash, after_hash)) = work.split_once('#') {
            let tag = after_hash.trim();
            if !tag.is_empty() {
                custom_name = Some(tag.to_string());
            }
            work = before_hash.trim().to_string();
        }

        if let Some((scheme, rest)) = work.split_once("://") {
            let s = scheme.to_uppercase();
            if s.contains("HTTP") {
                protocol = if s == "HTTPS" {
                    "HTTPS".to_string()
                } else {
                    "HTTP".to_string()
                };
            } else {
                protocol = "SOCKS5".to_string();
            }
            work = rest.to_string();
        }

        let mut username = None;
        let mut password = None;
        let host_port_part = if let Some((auth, hp)) = work.rsplit_once('@') {
            if let Some((u, p)) = auth.split_once(':') {
                username = Some(u.to_string());
                password = Some(p.to_string());
            } else {
                username = Some(auth.to_string());
            }
            hp.to_string()
        } else {
            work
        };

        let parts: Vec<&str> = host_port_part.split(':').collect();
        if parts.len() >= 2 {
            let host = parts[0].trim().to_string();
            let port = parts[1].trim().parse::<u16>().unwrap_or(1080);
            if parts.len() >= 4 && username.is_none() {
                username = Some(parts[2].trim().to_string());
                password = Some(parts[3].trim().to_string());
            }

            if !host.is_empty() {
                let udp_relay = protocol == "SOCKS5";
                let name = custom_name.unwrap_or_else(|| format!("{} {}:{}", protocol, host, port));
                parsed.push(ProxyNode {
                    id: format!("proxy-{}-{}", idx + 1, port),
                    name,
                    protocol,
                    host,
                    port,
                    username,
                    password,
                    udp_relay,
                    latency_ms: None,
                    status: "untested".to_string(),
                    country: "AUTO".to_string(),
                });
            }
        }
    }

    parsed
}
