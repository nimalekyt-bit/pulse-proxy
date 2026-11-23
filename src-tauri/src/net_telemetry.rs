use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RealSocketConnection {
    pub id: String,
    pub pid: u32,
    pub process_name: String,
    pub protocol: String, // "TCP" | "UDP"
    pub local_addr: String,
    pub local_port: u16,
    pub remote_addr: String,
    pub remote_port: u16,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessNetStats {
    pub pid: u32,
    pub tcp_connections: usize,
    pub udp_endpoints: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemNetworkSnapshot {
    pub download_bytes_per_sec: u64,
    pub upload_bytes_per_sec: u64,
    pub total_rx_bytes: u64,
    pub total_tx_bytes: u64,
    pub active_tcp_count: usize,
    pub active_udp_count: usize,
    pub connections: Vec<RealSocketConnection>,
    pub per_exe_connections: HashMap<String, usize>,
}

pub struct NetTelemetryTracker {
    last_rx_bytes: u64,
    last_tx_bytes: u64,
    last_sample_time: Instant,
    initialized: bool,
}

impl NetTelemetryTracker {
    pub fn new() -> Self {
        let (rx, tx) = read_total_interface_bytes();
        Self {
            last_rx_bytes: rx,
            last_tx_bytes: tx,
            last_sample_time: Instant::now(),
            initialized: true,
        }
    }

    pub fn sample_snapshot(&mut self, pid_to_exe: &HashMap<u32, String>) -> SystemNetworkSnapshot {
        let (rx, tx) = read_total_interface_bytes();
        let now = Instant::now();
        let elapsed_secs = now.duration_since(self.last_sample_time).as_secs_f64();

        let (dl_bps, ul_bps) = if self.initialized && elapsed_secs > 0.05 {
            let drx = rx.saturating_sub(self.last_rx_bytes);
            let dtx = tx.saturating_sub(self.last_tx_bytes);
            (
                (drx as f64 / elapsed_secs) as u64,
                (dtx as f64 / elapsed_secs) as u64,
            )
        } else {
            (0, 0)
        };

        self.last_rx_bytes = rx;
        self.last_tx_bytes = tx;
        self.last_sample_time = now;

        let (tcp_conns, udp_count, per_exe) = enumerate_real_sockets(pid_to_exe);
        let active_tcp_count = tcp_conns.len();

        SystemNetworkSnapshot {
            download_bytes_per_sec: dl_bps,
            upload_bytes_per_sec: ul_bps,
            total_rx_bytes: rx,
            total_tx_bytes: tx,
            active_tcp_count,
            active_udp_count: udp_count,
            connections: tcp_conns,
            per_exe_connections: per_exe,
        }
    }
}

#[cfg(target_os = "windows")]
#[allow(non_snake_case, non_camel_case_types)]
mod win_iphlp {
    #[repr(C)]
    pub struct MIB_TCPROW_OWNER_PID {
        pub dwState: u32,
        pub dwLocalAddr: u32,
        pub dwLocalPort: u32,
        pub dwRemoteAddr: u32,
        pub dwRemotePort: u32,
        pub dwOwningPid: u32,
    }

    #[repr(C)]
    pub struct MIB_UDPROW_OWNER_PID {
        pub dwLocalAddr: u32,
        pub dwLocalPort: u32,
        pub dwOwningPid: u32,
    }

    #[repr(C)]
    pub struct MIB_IFROW {
        pub wszName: [u16; 256],
        pub dwIndex: u32,
        pub dwType: u32,
        pub dwMtu: u32,
        pub dwSpeed: u32,
        pub dwPhysAddrLen: u32,
        pub bPhysAddr: [u8; 8],
        pub dwAdminStatus: u32,
        pub dwOperStatus: u32,
        pub dwLastChange: u32,
        pub dwInOctets: u32,
        pub dwInUcastPkts: u32,
        pub dwInNUcastPkts: u32,
        pub dwInDiscards: u32,
        pub dwInErrors: u32,
        pub dwInUnknownProtos: u32,
        pub dwOutOctets: u32,
        pub dwOutUcastPkts: u32,
        pub dwOutNUcastPkts: u32,
        pub dwOutDiscards: u32,
        pub dwOutErrors: u32,
        pub dwOutQLen: u32,
        pub dwDescrLen: u32,
        pub bDescr: [u8; 256],
    }

    #[link(name = "iphlpapi")]
    unsafe extern "system" {
        pub fn GetExtendedTcpTable(
            pTcpTable: *mut u8,
            pdwSize: *mut u32,
            bOrder: i32,
            ulAf: u32,
            TableClass: u32,
            Reserved: u32,
        ) -> u32;

        pub fn GetExtendedUdpTable(
            pUdpTable: *mut u8,
            pdwSize: *mut u32,
            bOrder: i32,
            ulAf: u32,
            TableClass: u32,
            Reserved: u32,
        ) -> u32;

        pub fn GetIfTable(pIfTable: *mut u8, pdwSize: *mut u32, bOrder: i32) -> u32;
    }
}

/// Reads actual hardware network adapter RX/TX byte counters via Win32 GetIfTable
fn read_total_interface_bytes() -> (u64, u64) {
    #[cfg(target_os = "windows")]
    unsafe {
        use win_iphlp::{GetIfTable, MIB_IFROW};
        let mut size: u32 = 0;
        let _ = GetIfTable(std::ptr::null_mut(), &mut size, 0);
        if size == 0 {
            return (0, 0);
        }
        let mut buf = vec![0u8; size as usize];
        if GetIfTable(buf.as_mut_ptr(), &mut size, 0) != 0 {
            return (0, 0);
        }

        let num_entries = *(buf.as_ptr() as *const u32) as usize;
        let rows_ptr = buf.as_ptr().add(4) as *const MIB_IFROW;
        let mut total_rx: u64 = 0;
        let mut total_tx: u64 = 0;

        for i in 0..num_entries {
            let row = &*rows_ptr.add(i);
            // Ignore loopback adapter (dwType == 24 is MIB_IF_TYPE_LOOPBACK)
            if row.dwType != 24 && (row.dwInOctets > 0 || row.dwOutOctets > 0) {
                total_rx += row.dwInOctets as u64;
                total_tx += row.dwOutOctets as u64;
            }
        }
        (total_rx, total_tx)
    }

    #[cfg(not(target_os = "windows"))]
    {
        (0, 0)
    }
}

/// Enumerates real active Windows TCP connections and UDP sockets with owning PIDs via GetExtendedTcpTable / GetExtendedUdpTable
fn enumerate_real_sockets(
    pid_to_exe: &HashMap<u32, String>,
) -> (Vec<RealSocketConnection>, usize, HashMap<String, usize>) {
    #[cfg(target_os = "windows")]
    unsafe {
        use win_iphlp::{
            GetExtendedTcpTable, GetExtendedUdpTable, MIB_TCPROW_OWNER_PID, MIB_UDPROW_OWNER_PID,
        };

        let mut connections = Vec::new();
        let mut per_exe: HashMap<String, usize> = HashMap::new();

        // 1. Read IPv4 TCP table (AF_INET = 2, TCP_TABLE_OWNER_PID_CONNECTIONS = 4)
        let mut tcp_size: u32 = 0;
        let _ = GetExtendedTcpTable(std::ptr::null_mut(), &mut tcp_size, 1, 2, 4, 0);
        if tcp_size > 0 {
            let mut buf = vec![0u8; tcp_size as usize];
            if GetExtendedTcpTable(buf.as_mut_ptr(), &mut tcp_size, 1, 2, 4, 0) == 0 {
                let count = *(buf.as_ptr() as *const u32) as usize;
                let rows_ptr = buf.as_ptr().add(4) as *const MIB_TCPROW_OWNER_PID;

                for i in 0..count {
                    let row = &*rows_ptr.add(i);
                    let remote_ip = Ipv4Addr::from(u32::from_be(row.dwRemoteAddr));
                    if remote_ip.is_unspecified() {
                        continue;
                    }
                    let local_ip = Ipv4Addr::from(u32::from_be(row.dwLocalAddr));
                    let local_port = u16::from_be((row.dwLocalPort & 0xFFFF) as u16);
                    let remote_port = u16::from_be((row.dwRemotePort & 0xFFFF) as u16);
                    let pid = row.dwOwningPid;

                    let exe_name = pid_to_exe
                        .get(&pid)
                        .cloned()
                        .unwrap_or_else(|| format!("PID:{}", pid));

                    *per_exe.entry(exe_name.to_lowercase()).or_insert(0) += 1;

                    let state_str = match row.dwState {
                        2 => "LISTEN",
                        3 => "SYN_SENT",
                        4 => "SYN_RCVD",
                        5 => "ESTABLISHED",
                        6 => "FIN_WAIT1",
                        7 => "FIN_WAIT2",
                        8 => "CLOSE_WAIT",
                        9 => "CLOSING",
                        10 => "LAST_ACK",
                        11 => "TIME_WAIT",
                        12 => "DELETE_TCB",
                        _ => "ACTIVE",
                    };

                    // Keep active established/connecting sockets in the live table
                    if (row.dwState == 5 || row.dwState == 3 || row.dwState == 8)
                        && connections.len() < 120
                    {
                        connections.push(RealSocketConnection {
                            id: format!("tcp-{}-{}:{}-{}", pid, local_port, remote_ip, remote_port),
                            pid,
                            process_name: exe_name,
                            protocol: "TCP".to_string(),
                            local_addr: local_ip.to_string(),
                            local_port,
                            remote_addr: remote_ip.to_string(),
                            remote_port,
                            state: state_str.to_string(),
                        });
                    }
                }
            }
        }

        // 2. Read IPv4 UDP table (AF_INET = 2, UDP_TABLE_OWNER_PID = 1)
        let mut udp_total_count = 0usize;
        let mut udp_size: u32 = 0;
        let _ = GetExtendedUdpTable(std::ptr::null_mut(), &mut udp_size, 1, 2, 1, 0);
        if udp_size > 0 {
            let mut buf = vec![0u8; udp_size as usize];
            if GetExtendedUdpTable(buf.as_mut_ptr(), &mut udp_size, 1, 2, 1, 0) == 0 {
                let count = *(buf.as_ptr() as *const u32) as usize;
                let rows_ptr = buf.as_ptr().add(4) as *const MIB_UDPROW_OWNER_PID;
                udp_total_count = count;

                for i in 0..count {
                    let row = &*rows_ptr.add(i);
                    let pid = row.dwOwningPid;
                    if pid == 0 {
                        continue;
                    }
                    if let Some(exe_name) = pid_to_exe.get(&pid) {
                        *per_exe.entry(exe_name.to_lowercase()).or_insert(0) += 1;
                    }
                }
            }
        }

        (connections, udp_total_count, per_exe)
    }

    #[cfg(not(target_os = "windows"))]
    {
        (Vec::new(), 0, HashMap::new())
    }
}
