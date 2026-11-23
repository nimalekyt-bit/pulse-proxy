use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::Ipv4Addr;

/// FakeIP DNS Pool (RFC 2544 benchmark subnet 198.18.0.0/15, standard for transparent proxy DNS)
/// Eliminates DNS leaks by returning a synthetic IPv4 immediately to the intercepted process
/// and resolving the real domain remotely through the upstream SOCKS5/HTTPS proxy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FakeIpEntry {
    pub fake_ip: String,
    pub domain: String,
    pub hits: u64,
}

pub struct FakeDnsResolver {
    base_ip: u32,
    next_offset: u32,
    ip_to_domain: HashMap<String, String>,
    domain_to_ip: HashMap<String, String>,
    hit_counts: HashMap<String, u64>,
}

impl FakeDnsResolver {
    pub fn new() -> Self {
        let base_ip = u32::from(Ipv4Addr::new(198, 18, 0, 10));
        let mut resolver = Self {
            base_ip,
            next_offset: 0,
            ip_to_domain: HashMap::new(),
            domain_to_ip: HashMap::new(),
            hit_counts: HashMap::new(),
        };
        // Pre-populate common domains for instant diagnostics
        resolver.allocate_or_get("api.openai.com");
        resolver.allocate_or_get("claude.ai");
        resolver.allocate_or_get("gateway.discord.gg");
        resolver.allocate_or_get("rtc-fra04.discord.gg");
        resolver
    }

    pub fn allocate_or_get(&mut self, domain: &str) -> String {
        let normalized = domain.trim().to_lowercase();
        if let Some(existing_ip) = self.domain_to_ip.get(&normalized) {
            *self.hit_counts.entry(normalized).or_insert(0) += 1;
            return existing_ip.clone();
        }

        let ip_num = self.base_ip + (self.next_offset % 65_000);
        self.next_offset += 1;
        let ip_str = Ipv4Addr::from(ip_num).to_string();

        self.ip_to_domain
            .insert(ip_str.clone(), normalized.clone());
        self.domain_to_ip
            .insert(normalized.clone(), ip_str.clone());
        self.hit_counts.insert(normalized, 1);

        ip_str
    }

    pub fn lookup_domain(&self, fake_ip: &str) -> Option<String> {
        self.ip_to_domain.get(fake_ip).cloned()
    }

    pub fn entries(&self) -> Vec<FakeIpEntry> {
        let mut out: Vec<FakeIpEntry> = self
            .domain_to_ip
            .iter()
            .map(|(domain, ip)| FakeIpEntry {
                fake_ip: ip.clone(),
                domain: domain.clone(),
                hits: *self.hit_counts.get(domain).unwrap_or(&1),
            })
            .collect();
        out.sort_by(|a, b| b.hits.cmp(&a.hits));
        out
    }
}
