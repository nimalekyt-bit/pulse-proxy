import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  FileCode2,
  GitBranch,
  Lock,
  Pause,
  Play,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Server,
  Settings2,
  Shield,
  SlidersHorizontal,
  Terminal,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import {
  AppRuleBinding,
  DetectedApp,
  EngineAdvancedOptions,
  FakeIpEntry,
  ProxyChain,
  ProxyDiagnosticReport,
  ProxyNode,
  ProxyProbeResult,
  PulseProxyConfig,
  RealSocketConnection,
  RoutingRule,
  RuleMatchTestResult,
  SavedAppBinding,
  SystemNetworkSnapshot,
} from './types';

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
  }
  if (bytesPerSec >= 1024) {
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  }
  return `${bytesPerSec} B/s`;
}

function formatTotalBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function isUserApplication(app: AppRuleBinding): boolean {
  if (app.enabled || app.active_conns > 0) return true;
  if (app.category !== 'Приложение') return true;
  const exe = app.exe_name.toLowerCase();
  const lowerPath = app.full_path.toLowerCase();
  if (
    exe.includes('service') ||
    exe.includes('helper') ||
    exe.includes('hal') ||
    exe.includes('host') ||
    exe.includes('handler') ||
    exe.includes('notification') ||
    exe.includes('broker') ||
    exe.includes('crash') ||
    lowerPath.includes('\\windows\\')
  ) {
    return false;
  }
  return true;
}

export default function App() {
  const [activeSection, setActiveSection] = useState<'apps' | 'rules' | 'proxies' | 'chains' | 'dns'>('apps');
  const [engineRunning, setEngineRunning] = useState(true);
  const [bottomDockOpen, setBottomDockOpen] = useState(true);
  const [configLoaded, setConfigLoaded] = useState(false);

  // 100% Real State — Zero Mocks
  const [proxies, setProxies] = useState<ProxyNode[]>([]);
  const [chains, setChains] = useState<ProxyChain[]>([]);
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [defaultRuleAction, setDefaultRuleAction] = useState<string>('direct');
  const [savedBindings, setSavedBindings] = useState<Record<string, SavedAppBinding>>({});
  const [detectedApps, setDetectedApps] = useState<DetectedApp[]>([]);

  const [advOptions, setAdvOptions] = useState<EngineAdvancedOptions>({
    dns_mode: 'remote_fakeip',
    dns_exclusion_list: '%ComputerName%; localhost; *.local; *.lan; 192.168.*',
    fake_ip_subnet: '198.18.0.0/15',
    proxify_services_and_users: false,
    handle_direct_connections: true,
    loop_detection: true,
    http_proxy_all_ports: true,
    kill_switch_on_failure: true,
  });

  // Real Windows Network Snapshot from iphlpapi.dll
  const [netSnapshot, setNetSnapshot] = useState<SystemNetworkSnapshot>({
    download_bytes_per_sec: 0,
    upload_bytes_per_sec: 0,
    total_rx_bytes: 0,
    total_tx_bytes: 0,
    active_tcp_count: 0,
    active_udp_count: 0,
    connections: [],
    per_exe_connections: {},
  });
  const [bandwidthHistory, setBandwidthHistory] = useState<number[]>(Array(28).fill(0));
  const [fakeDnsEntries, setFakeDnsEntries] = useState<FakeIpEntry[]>([]);

  // Filters
  const [appScopeFilter, setAppScopeFilter] = useState<'active_net' | 'user_apps' | 'proxied_only' | 'all_system'>('active_net');
  const [searchQuery, setSearchQuery] = useState('');
  const [isScanningProcesses, setIsScanningProcesses] = useState(false);
  const [liveStreamPaused, setLiveStreamPaused] = useState(false);
  const [connSearchFilter, setConnSearchFilter] = useState('');

  // Modals
  const [showAddProxyModal, setShowAddProxyModal] = useState(false);
  const [newProxyName, setNewProxyName] = useState('');
  const [newProxyProto, setNewProxyProto] = useState<'SOCKS5' | 'SOCKS4' | 'SOCKS4A' | 'HTTPS' | 'HTTP'>('SOCKS5');
  const [newProxyHost, setNewProxyHost] = useState('127.0.0.1');
  const [newProxyPort, setNewProxyPort] = useState(1080);
  const [newProxyUser, setNewProxyUser] = useState('');
  const [newProxyPass, setNewProxyPass] = useState('');

  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');

  const [showChainModal, setShowChainModal] = useState(false);
  const [newChainName, setNewChainName] = useState('');
  const [newChainType, setNewChainType] = useState<'simple' | 'redundancy' | 'load_balancing'>('simple');
  const [newChainProxies, setNewChainProxies] = useState<string[]>([]);

  const [diagnosticReport, setDiagnosticReport] = useState<ProxyDiagnosticReport | null>(null);
  const [diagnosticProxyName, setDiagnosticProxyName] = useState<string>('');
  const [isCheckingProxy, setIsCheckingProxy] = useState(false);

  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleProcess, setNewRuleProcess] = useState('*');
  const [newRuleHosts, setNewRuleHosts] = useState('*');
  const [newRulePorts, setNewRulePorts] = useState('*');
  const [newRuleProto, setNewRuleProto] = useState<'ANY' | 'TCP' | 'UDP'>('ANY');
  const [newRuleAction, setNewRuleAction] = useState('direct');

  const [testProc, setTestProc] = useState('chrome.exe');
  const [testHost, setTestHost] = useState('1.1.1.1');
  const [testPort, setTestPort] = useState(443);
  const [ruleTestResult, setRuleTestResult] = useState<RuleMatchTestResult | null>(null);

  const [ppxXmlModal, setPpxXmlModal] = useState<string | null>(null);
  const [testDnsDomain, setTestDnsDomain] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2800);
  };

  const resolveRouteName = (actionId: string) => {
    if (actionId === 'direct') return 'Direct';
    if (actionId === 'block') return 'Block';
    const c = chains.find((ch) => ch.id === actionId);
    if (c) return `Chain: ${c.name}`;
    const p = proxies.find((pr) => pr.id === actionId);
    return p ? `${p.name} (${p.host}:${p.port})` : actionId;
  };

  // Load persisted config + real running Windows processes on startup
  useEffect(() => {
    async function init() {
      try {
        const cfg = await invoke<PulseProxyConfig>('load_user_config');
        if (cfg) {
          setProxies(cfg.proxies || []);
          setChains(cfg.chains || []);
          setRules(cfg.rules || []);
          setDefaultRuleAction(cfg.default_rule_action || 'direct');
          setSavedBindings(cfg.app_bindings || {});
          if (cfg.options) setAdvOptions(cfg.options);
        }
      } catch {
        // First run or standalone
      } finally {
        setConfigLoaded(true);
      }

      await refreshSystemProcesses();
    }
    init();
  }, []);

  // Persist config to %APPDATA%\PulseProxy\config.json whenever user modifies proxies/chains/rules/bindings
  const saveTimerRef = useRef<any>(null);
  useEffect(() => {
    if (!configLoaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const payload: PulseProxyConfig = {
        proxies,
        chains,
        rules,
        default_rule_action: defaultRuleAction,
        app_bindings: savedBindings,
        options: advOptions,
      };
      invoke('save_user_config', { config: payload }).catch(() => {});
    }, 350);
  }, [proxies, chains, rules, defaultRuleAction, savedBindings, advOptions, configLoaded]);

  const refreshSystemProcesses = async () => {
    setIsScanningProcesses(true);
    try {
      const detected = await invoke<DetectedApp[]>('get_running_processes');
      if (Array.isArray(detected)) {
        setDetectedApps(detected);
      }
      const dnsTable = await invoke<FakeIpEntry[]>('get_fake_dns_table');
      if (Array.isArray(dnsTable)) {
        setFakeDnsEntries(dnsTable);
      }
    } catch {
      // Outside Tauri
    } finally {
      setTimeout(() => setIsScanningProcesses(false), 180);
    }
  };

  // Poll REAL Windows TCP/UDP socket table and REAL NIC throughput every 1.5s
  useEffect(() => {
    let active = true;
    const pollTelemetry = async () => {
      if (liveStreamPaused) return;
      try {
        const snap = await invoke<SystemNetworkSnapshot>('get_network_snapshot');
        if (!active || !snap) return;
        setNetSnapshot(snap);
        setBandwidthHistory((prev) => [
          ...prev.slice(1),
          snap.download_bytes_per_sec + snap.upload_bytes_per_sec,
        ]);
      } catch {
        // Outside Tauri
      }
    };

    pollTelemetry();
    const interval = setInterval(pollTelemetry, 1500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [liveStreamPaused]);

  // Combine real detected Windows processes with persisted user proxy bindings and real active socket counts
  const apps: AppRuleBinding[] = useMemo(() => {
    return detectedApps.map((d) => {
      const key = d.exe_name.toLowerCase();
      const saved = savedBindings[key];
      const isGenericRoot =
        d.folder_path.endsWith('Program Files') ||
        d.folder_path.endsWith('Program Files (x86)') ||
        d.folder_path.endsWith('System32');
      const conns = netSnapshot.per_exe_connections[key] ?? 0;

      return {
        pid: d.pid,
        exe_name: d.exe_name,
        name: d.name,
        full_path: d.full_path,
        folder_path: d.folder_path,
        category: d.category,
        instance_count: d.instance_count,
        enabled: saved ? saved.enabled : false,
        folder_scope: saved ? saved.folder_scope : !isGenericRoot,
        proxy_id: saved ? saved.proxy_id : 'direct',
        active_conns: conns,
      };
    });
  }, [detectedApps, savedBindings, netSnapshot.per_exe_connections]);

  const activeNetAppsCount = useMemo(
    () => apps.filter((a) => a.active_conns > 0 || a.enabled).length,
    [apps]
  );
  const userAppsCount = useMemo(() => apps.filter(isUserApplication).length, [apps]);
  const proxiedAppsCount = useMemo(() => apps.filter((a) => a.enabled).length, [apps]);

  const filteredApps = useMemo(() => {
    const list = apps.filter((a) => {
      if (appScopeFilter === 'active_net' && a.active_conns === 0 && !a.enabled) return false;
      if (appScopeFilter === 'proxied_only' && !a.enabled) return false;
      if (appScopeFilter === 'user_apps' && !isUserApplication(a)) return false;

      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.exe_name.toLowerCase().includes(q) ||
        a.full_path.toLowerCase().includes(q)
      );
    });

    // Sort: proxied apps first, then by active connections descending, then alphabetically
    return list.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      if (b.active_conns !== a.active_conns) return b.active_conns - a.active_conns;
      return a.name.localeCompare(b.name);
    });
  }, [apps, appScopeFilter, searchQuery]);

  // Evaluate route for each real active socket connection
  const getSocketRouteLabel = (conn: RealSocketConnection): { label: string; isProxied: boolean; isBlocked: boolean } => {
    if (!engineRunning) return { label: 'Direct (Paused)', isProxied: false, isBlocked: false };
    if (conn.remote_addr === '127.0.0.1' || conn.remote_addr === '0.0.0.0') {
      return { label: 'Direct (Localhost)', isProxied: false, isBlocked: false };
    }
    const key = conn.process_name.toLowerCase();
    const binding = savedBindings[key];
    if (binding && binding.enabled) {
      if (binding.proxy_id === 'block') return { label: 'Block', isProxied: false, isBlocked: true };
      if (binding.proxy_id !== 'direct') {
        return { label: resolveRouteName(binding.proxy_id), isProxied: true, isBlocked: false };
      }
    }
    return {
      label: resolveRouteName(defaultRuleAction),
      isProxied: defaultRuleAction !== 'direct' && defaultRuleAction !== 'block',
      isBlocked: defaultRuleAction === 'block',
    };
  };

  const updateAppBinding = (exeName: string, patch: Partial<SavedAppBinding>) => {
    const key = exeName.toLowerCase();
    setSavedBindings((prev) => {
      const current = prev[key] || {
        exe_name: exeName,
        enabled: false,
        folder_scope: true,
        proxy_id: proxies[0]?.id || 'direct',
      };
      const updated = { ...current, ...patch };
      return { ...prev, [key]: updated };
    });
  };

  const handleToggleApp = (app: AppRuleBinding) => {
    if (!app.enabled && proxies.length === 0 && chains.length === 0) {
      notify('Сначала добавьте хотя бы один прокси-сервер во вкладке «Прокси-серверы»');
      setActiveSection('proxies');
      return;
    }
    const nextEnabled = !app.enabled;
    const defaultTarget =
      app.proxy_id !== 'direct'
        ? app.proxy_id
        : proxies[0]?.id || chains[0]?.id || 'direct';
    updateAppBinding(app.exe_name, {
      enabled: nextEnabled,
      proxy_id: nextEnabled ? defaultTarget : 'direct',
    });
  };

  const handleDiscoverLocalProxies = async () => {
    notify('Сканирование локальных портов 127.0.0.1 (1080, 2080, 7890, 10808, 10809, 9050)...');
    try {
      const found = await invoke<ProxyNode[]>('discover_local_proxies');
      if (Array.isArray(found) && found.length > 0) {
        setProxies((prev) => {
          const existingIds = new Set(prev.map((p) => `${p.host}:${p.port}`));
          const unique = found.filter((f) => !existingIds.has(`${f.host}:${f.port}`));
          return [...prev, ...unique];
        });
        notify(`Найдено активных локальных прокси: ${found.length}`);
      } else {
        notify('Активных локальных прокси на стандартных портах 127.0.0.1 не обнаружено');
      }
    } catch {
      notify('Не удалось выполнить сканирование портов');
    }
  };

  const handleAddSingleProxy = async () => {
    const host = newProxyHost.trim();
    if (!host || !newProxyPort) return;
    const node: ProxyNode = {
      id: `proxy-${Date.now()}`,
      name: newProxyName.trim() || `${newProxyProto} ${host}:${newProxyPort}`,
      protocol: newProxyProto,
      host,
      port: Number(newProxyPort),
      username: newProxyUser.trim() || null,
      password: newProxyPass.trim() || null,
      udp_relay: newProxyProto === 'SOCKS5',
      latency_ms: null,
      status: 'testing',
      country: host === '127.0.0.1' || host === 'localhost' ? 'LOCAL' : 'EXT',
    };
    setProxies((prev) => [...prev, node]);
    setShowAddProxyModal(false);
    setNewProxyName('');
    await probeSingleProxy(node);
  };

  const probeSingleProxy = async (proxy: ProxyNode) => {
    setProxies((prev) =>
      prev.map((p) => (p.id === proxy.id ? { ...p, status: 'testing' } : p))
    );
    try {
      const res = await invoke<ProxyProbeResult>('probe_proxy', { node: proxy });
      setProxies((prev) =>
        prev.map((p) =>
          p.id === proxy.id
            ? {
                ...p,
                status: res.reachable ? 'online' : 'offline',
                latency_ms: res.latency_ms ?? null,
              }
            : p
        )
      );
      if (!res.reachable) {
        notify(`${proxy.host}:${proxy.port} недоступен (${res.status_message})`);
      }
    } catch (e) {
      setProxies((prev) =>
        prev.map((p) => (p.id === proxy.id ? { ...p, status: 'offline', latency_ms: null } : p))
      );
    }
  };

  const probeAllProxies = async () => {
    if (proxies.length === 0) return;
    for (const p of proxies) {
      probeSingleProxy(p);
    }
  };

  const openFullProxyDiagnostic = async (proxy: ProxyNode) => {
    setDiagnosticProxyName(`${proxy.name} (${proxy.host}:${proxy.port})`);
    setIsCheckingProxy(true);
    setDiagnosticReport(null);
    try {
      const report = await invoke<ProxyDiagnosticReport>('run_proxy_checker', {
        node: proxy,
        targetHost: '1.1.1.1',
        targetPort: 443,
      });
      setDiagnosticReport(report);
      setProxies((prev) =>
        prev.map((p) =>
          p.id === proxy.id
            ? {
                ...p,
                status: report.overall_passed ? 'online' : 'offline',
                latency_ms: report.overall_passed ? report.total_latency_ms : null,
              }
            : p
        )
      );
    } catch (e) {
      notify('Ошибка вызова системного чекера');
    } finally {
      setIsCheckingProxy(false);
    }
  };

  const handleBulkImport = async () => {
    if (!importText.trim()) return;
    try {
      const parsed = await invoke<ProxyNode[]>('parse_proxies_bulk', { rawText: importText });
      if (Array.isArray(parsed) && parsed.length > 0) {
        setProxies((prev) => [...prev, ...parsed]);
        setShowImportModal(false);
        setImportText('');
        notify(`Импортировано прокси: ${parsed.length}`);
        for (const p of parsed) {
          probeSingleProxy(p);
        }
      } else {
        notify('Не удалось распознать ни одного прокси. Проверьте формат ip:port');
      }
    } catch {
      notify('Ошибка парсинга');
    }
  };

  const handleCreateChain = () => {
    if (!newChainName.trim() || newChainProxies.length === 0) return;
    const ch: ProxyChain = {
      id: 'chain-' + Date.now(),
      name: newChainName.trim(),
      chain_type: newChainType,
      proxy_ids: newChainProxies,
      enabled: true,
      timeout_sec: 8,
    };
    setChains((prev) => [...prev, ch]);
    setNewChainName('');
    setNewChainProxies([]);
    setShowChainModal(false);
    notify(`Цепочка ${ch.name} создана`);
  };

  const moveRule = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= rules.length) return;
    setRules((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(targetIdx, 0, item);
      return copy;
    });
  };

  const cloneRule = (rule: RoutingRule) => {
    const copy: RoutingRule = {
      ...rule,
      id: 'rule-' + Date.now(),
      name: `${rule.name} (Copy)`,
    };
    setRules((prev) => [...prev, copy]);
  };

  const handleCreateRule = () => {
    if (!newRuleName.trim()) return;
    const rule: RoutingRule = {
      id: 'rule-' + Date.now(),
      name: newRuleName.trim(),
      enabled: true,
      process_pattern: newRuleProcess.trim() || '*',
      target_hosts: newRuleHosts.trim() || '*',
      ports: newRulePorts.trim() || '*',
      protocol: newRuleProto,
      action: newRuleAction,
    };
    setRules((prev) => [rule, ...prev]);
    setNewRuleName('');
    setShowAddRuleModal(false);
  };

  const createRuleFromRealSocket = (conn: RealSocketConnection) => {
    const newRule: RoutingRule = {
      id: 'rule-sock-' + Date.now(),
      name: `${conn.process_name} -> ${conn.remote_addr}:${conn.remote_port}`,
      enabled: true,
      process_pattern: conn.process_name,
      target_hosts: conn.remote_addr,
      ports: String(conn.remote_port),
      protocol: conn.protocol,
      action: proxies[0]?.id || chains[0]?.id || 'direct',
    };
    setRules((prev) => [newRule, ...prev]);
    notify(`Создано правило: ${conn.process_name} -> ${conn.remote_addr}:${conn.remote_port}`);
  };

  const runRuleSimulator = async () => {
    try {
      const res = await invoke<RuleMatchTestResult>('test_rule_evaluation', {
        processName: testProc,
        targetHost: testHost,
        targetPort: Number(testPort) || 443,
        protocol: 'TCP',
        rules,
        dnsMode: advOptions.dns_mode,
      });
      setRuleTestResult(res);
    } catch {
      // Ignore
    }
  };

  const handleExportPpx = async () => {
    try {
      const xml = await invoke<string>('export_ppx_profile', {
        proxies,
        chains,
        rules,
      });
      setPpxXmlModal(xml);
    } catch {
      // Ignore
    }
  };

  const handleFlushDns = async () => {
    try {
      const table = await invoke<FakeIpEntry[]>('flush_fake_dns');
      setFakeDnsEntries(table);
      notify('Кэш FakeIP очищен');
    } catch {
      // Ignore
    }
  };

  const handleAllocateFakeDns = async () => {
    const domain = testDnsDomain.trim().toLowerCase();
    if (!domain) return;
    try {
      await invoke<string>('resolve_fake_ip', { domain });
      const table = await invoke<FakeIpEntry[]>('get_fake_dns_table');
      setFakeDnsEntries(table);
    } catch {
      // Ignore
    }
    setTestDnsDomain('');
  };

  const maxBw = useMemo(() => Math.max(1024 * 64, ...bandwidthHistory), [bandwidthHistory]);

  const filteredConnections = useMemo(() => {
    const q = connSearchFilter.toLowerCase().trim();
    if (!q) return netSnapshot.connections;
    return netSnapshot.connections.filter(
      (c) =>
        c.process_name.toLowerCase().includes(q) ||
        c.remote_addr.includes(q) ||
        String(c.remote_port).includes(q)
    );
  }, [netSnapshot.connections, connSearchFilter]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0b0c0e] text-[#e4e6eb] select-none overflow-hidden text-xs">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-4 right-4 z-50 px-3.5 py-2 rounded bg-[#181a20] text-[#e4e6eb] text-xs font-medium shadow-2xl border border-[#2c303a] flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Main Split Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* LEFT SIDEBAR */}
        <aside className="w-[220px] bg-[#0f1115] border-r border-[#1e2128] flex flex-col justify-between shrink-0">
          <div>
            {/* Brand & Engine Status */}
            <div className="px-3.5 py-3 border-b border-[#1e2128] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    engineRunning ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-amber-400'
                  }`}
                />
                <span className="font-semibold text-[13px] tracking-tight text-white">
                  PulseProxy
                </span>
              </div>

              <button
                onClick={() => setEngineRunning(!engineRunning)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border transition ${
                  engineRunning
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}
              >
                {engineRunning ? 'ACTIVE' : 'BYPASS'}
              </button>
            </div>

            {/* Navigation */}
            <nav className="p-2 space-y-0.5">
              <div className="px-2 py-1 text-[10px] font-mono uppercase text-[#6c727f] tracking-wider">
                Управление
              </div>

              {[
                {
                  id: 'apps' as const,
                  label: 'Процессы Windows',
                  badge: `${proxiedAppsCount}/${apps.length}`,
                  icon: SlidersHorizontal,
                },
                {
                  id: 'proxies' as const,
                  label: 'Прокси-серверы',
                  badge: String(proxies.length),
                  icon: Server,
                },
                {
                  id: 'chains' as const,
                  label: 'Цепочки (Chains)',
                  badge: String(chains.length),
                  icon: GitBranch,
                },
                {
                  id: 'rules' as const,
                  label: 'Правила (Rules)',
                  badge: String(rules.length + 2),
                  icon: Shield,
                },
                {
                  id: 'dns' as const,
                  label: 'DNS & Параметры',
                  badge: advOptions.dns_mode === 'remote_fakeip' ? 'FakeIP' : 'Auto',
                  icon: Settings2,
                },
              ].map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition ${
                      active
                        ? 'bg-[#1c2029] text-white font-medium border-l-2 border-[#38bdf8]'
                        : 'text-[#8e95a2] hover:bg-[#15181e] hover:text-[#d0d4dc]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#38bdf8]' : 'text-[#6c727f]'}`} />
                      <span>{item.label}</span>
                    </div>
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.2 rounded ${
                        active ? 'bg-[#262b36] text-[#e4e6eb]' : 'text-[#6c727f]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Bottom Real System NIC Telemetry */}
          <div className="p-3 border-t border-[#1e2128] bg-[#0c0d10] space-y-2.5">
            <div className="text-[10px] font-mono uppercase text-[#6c727f] tracking-wider">
              Сетевой интерфейс (NIC)
            </div>
            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-[#7c828d]">Приём (RX):</span>
                <span className="text-emerald-400 font-medium">
                  {formatRate(netSnapshot.download_bytes_per_sec)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#7c828d]">Отправка (TX):</span>
                <span className="text-[#38bdf8] font-medium">
                  {formatRate(netSnapshot.upload_bytes_per_sec)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#6c727f] pt-1 border-t border-[#171a21]">
                <span>Сокеты TCP / UDP:</span>
                <span>
                  {netSnapshot.active_tcp_count} / {netSnapshot.active_udp_count}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#6c727f]">
                <span>Всего за сессию:</span>
                <span>{formatTotalBytes(netSnapshot.total_rx_bytes)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#1e2128] flex flex-col gap-1.5">
              <button
                onClick={() =>
                  setAdvOptions((prev) => ({
                    ...prev,
                    kill_switch_on_failure: !prev.kill_switch_on_failure,
                  }))
                }
                className={`w-full flex items-center justify-between px-2.5 py-1 rounded border text-[11px] transition ${
                  advOptions.kill_switch_on_failure
                    ? 'bg-[#151921] border-[#2c3342] text-[#e4e6eb]'
                    : 'bg-transparent border-[#1e2128] text-[#6c727f]'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-[#38bdf8]" />
                  <span>Kill Switch</span>
                </span>
                <span className="font-mono text-[10px]">
                  {advOptions.kill_switch_on_failure ? 'ON' : 'OFF'}
                </span>
              </button>

              <button
                onClick={handleExportPpx}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded bg-[#15181e] hover:bg-[#1c2029] border border-[#242830] text-[#c8cdd6] text-[11px] transition"
              >
                <FileCode2 className="w-3.5 h-3.5 text-[#8e95a2]" />
                <span>Экспорт .PPX профиля</span>
              </button>
            </div>
          </div>
        </aside>

        {/* CENTER & BOTTOM WORKBENCH */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0b0c0e]">
          {/* Section Toolbar Header */}
          <header className="h-10 px-4 bg-[#0f1115] border-b border-[#1e2128] flex items-center justify-between gap-4 shrink-0">
            {activeSection === 'apps' && (
              <>
                <div className="flex items-center gap-1">
                  {[
                    {
                      id: 'active_net' as const,
                      label: `С активной сетью (${activeNetAppsCount})`,
                    },
                    {
                      id: 'user_apps' as const,
                      label: `Программы (${userAppsCount})`,
                    },
                    {
                      id: 'proxied_only' as const,
                      label: `Проксируемые (${proxiedAppsCount})`,
                    },
                    {
                      id: 'all_system' as const,
                      label: `Все процессы (${apps.length})`,
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setAppScopeFilter(tab.id)}
                      className={`px-2.5 py-1 rounded text-xs transition ${
                        appScopeFilter === tab.id
                          ? 'bg-[#1c2029] text-white font-medium border border-[#2c313d]'
                          : 'text-[#7c828d] hover:text-[#c8cdd6]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[#6c727f] absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Фильтр по .exe или пути..."
                      className="pl-7 pr-2.5 py-1 rounded bg-[#14171d] border border-[#242830] text-[#e4e6eb] placeholder-[#6c727f] focus:outline-none focus:border-[#38bdf8] w-52 text-xs"
                    />
                  </div>
                  <button
                    onClick={refreshSystemProcesses}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#14171d] hover:bg-[#1c2029] border border-[#242830] text-[#c8cdd6] transition"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${isScanningProcesses ? 'animate-spin text-[#38bdf8]' : ''}`}
                    />
                    <span>Обновить</span>
                  </button>
                </div>
              </>
            )}

            {activeSection === 'proxies' && (
              <>
                <div className="font-medium text-white">
                  Прокси-серверы ({proxies.length})
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDiscoverLocalProxies}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#14171d] hover:bg-[#1c2029] border border-[#242830] text-[#c8cdd6]"
                  >
                    <Radar className="w-3.5 h-3.5 text-[#38bdf8]" />
                    <span>Найти локальные (127.0.0.1)</span>
                  </button>
                  {proxies.length > 0 && (
                    <button
                      onClick={probeAllProxies}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#14171d] hover:bg-[#1c2029] border border-[#242830] text-[#c8cdd6]"
                    >
                      <Wifi className="w-3 h-3 text-emerald-400" />
                      <span>Пинг всех</span>
                    </button>
                  )}
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#14171d] hover:bg-[#1c2029] border border-[#242830] text-[#c8cdd6]"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    <span>Импорт списком</span>
                  </button>
                  <button
                    onClick={() => setShowAddProxyModal(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#090d16] font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Добавить прокси</span>
                  </button>
                </div>
              </>
            )}

            {activeSection === 'chains' && (
              <>
                <div className="font-medium text-white">
                  Цепочки прокси ({chains.length})
                </div>
                <button
                  onClick={() => {
                    if (proxies.length === 0) {
                      notify('Сначала добавьте прокси-серверы');
                      setActiveSection('proxies');
                      return;
                    }
                    setShowChainModal(true);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#090d16] font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Создать цепочку</span>
                </button>
              </>
            )}

            {activeSection === 'rules' && (
              <>
                <div className="font-medium text-white">
                  Таблица правил маршрутизации (Proxification Rules)
                </div>
                <button
                  onClick={() => setShowAddRuleModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#090d16] font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Новое правило</span>
                </button>
              </>
            )}

            {activeSection === 'dns' && (
              <div className="font-medium text-white">
                Разрешение имён (Name Resolution) и системные параметры
              </div>
            )}
          </header>

          {/* Primary Data Grid Viewport */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* VIEW 1: REAL RUNNING WINDOWS PROCESSES */}
            {activeSection === 'apps' && (
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-[#12141a] border-b border-[#1e2128] text-[11px] font-mono uppercase text-[#6c727f] select-none">
                  <tr>
                    <th className="py-2 pl-4 pr-2 w-10">Вкл</th>
                    <th className="py-2 px-3 w-56">Процесс Windows</th>
                    <th className="py-2 px-3">Реальный путь исполняемого файла</th>
                    <th className="py-2 px-3 w-36">Охват</th>
                    <th className="py-2 px-3 w-64">Назначенный маршрут</th>
                    <th className="py-2 pl-3 pr-4 w-28 text-right">Сокеты (ОС)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#171a20] text-xs">
                  {filteredApps.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-[#6c727f]">
                        Нет процессов, подходящих под выбранный фильтр.
                      </td>
                    </tr>
                  ) : (
                    filteredApps.map((app) => (
                      <tr
                        key={app.exe_name}
                        className={`transition-colors ${
                          app.enabled
                            ? 'bg-[#121722]/90 hover:bg-[#161c2a]'
                            : 'hover:bg-[#111318] text-[#9ca3af]'
                        }`}
                      >
                        <td className="py-2 pl-4 pr-2">
                          <input
                            type="checkbox"
                            checked={app.enabled}
                            onChange={() => handleToggleApp(app)}
                            className="accent-[#38bdf8] w-3.5 h-3.5 cursor-pointer rounded-sm"
                          />
                        </td>

                        <td className="py-2 px-3">
                          <div className="font-medium text-[#e4e6eb] truncate">{app.name}</div>
                          <div className="font-mono text-[11px] text-[#6c727f] flex items-center gap-1.5">
                            <span>{app.exe_name}</span>
                            <span>[PID {app.pid}]</span>
                            {app.instance_count > 1 && <span>({app.instance_count})</span>}
                          </div>
                        </td>

                        <td
                          className="py-2 px-3 font-mono text-[11px] text-[#7c828d] max-w-md truncate"
                          title={app.full_path}
                        >
                          {app.folder_scope && app.folder_path
                            ? `${app.folder_path}\\*`
                            : app.full_path}
                        </td>

                        <td className="py-2 px-3">
                          <button
                            onClick={() =>
                              updateAppBinding(app.exe_name, {
                                folder_scope: !app.folder_scope,
                              })
                            }
                            className={`px-2 py-1 rounded border text-[11px] font-mono transition ${
                              app.folder_scope
                                ? 'bg-[#18202c] border-[#2b3a4e] text-[#38bdf8]'
                                : 'bg-[#12141a] border-[#22262f] text-[#7c828d] hover:text-[#c8cdd6]'
                            }`}
                          >
                            {app.folder_scope ? 'Вся папка (*)' : 'Только .exe'}
                          </button>
                        </td>

                        <td className="py-2 px-3">
                          <select
                            value={app.enabled ? app.proxy_id : 'direct'}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateAppBinding(app.exe_name, {
                                proxy_id: val,
                                enabled: val !== 'direct',
                              });
                            }}
                            className={`w-full px-2.5 py-1 rounded border text-xs focus:outline-none cursor-pointer ${
                              app.enabled
                                ? 'bg-[#161a23] border-[#2c3545] text-white font-medium'
                                : 'bg-[#12141a] border-[#1e2128] text-[#7c828d]'
                            }`}
                          >
                            <option value="direct">Direct (Напрямую)</option>
                            <option value="block">Block (Блокировать доступ)</option>
                            {proxies.length > 0 && (
                              <optgroup label="Прокси-серверы" className="bg-[#12141a]">
                                {proxies.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.host}:{p.port})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {chains.length > 0 && (
                              <optgroup label="Цепочки (Chains)" className="bg-[#12141a]">
                                {chains.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    Chain: {c.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </td>

                        <td className="py-2 pl-3 pr-4 text-right font-mono">
                          <span
                            className={
                              app.active_conns > 0 ? 'text-emerald-400 font-medium' : 'text-[#6c727f]'
                            }
                          >
                            {app.active_conns} сокет.
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* VIEW 2: REAL CONFIGURED PROXY SERVERS */}
            {activeSection === 'proxies' && (
              <div>
                {proxies.length === 0 ? (
                  <div className="p-10 text-center space-y-3">
                    <div className="text-[#8e95a2] text-sm font-medium">
                      Список прокси-серверов пуст (никаких мок-серверов)
                    </div>
                    <p className="text-[#6c727f] max-w-md mx-auto">
                      Добавьте свой реальный SOCKS5 / SOCKS4 / HTTPS прокси, вставьте список из буфера обмена или просканируйте локальные порты 127.0.0.1 (если запущен v2rayN, Clash, Sing-box или NekoRay).
                    </p>
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <button
                        onClick={handleDiscoverLocalProxies}
                        className="px-3 py-1.5 rounded bg-[#161a22] hover:bg-[#1f2530] border border-[#2a303c] text-[#e4e6eb] font-medium"
                      >
                        Найти локальные прокси (127.0.0.1)
                      </button>
                      <button
                        onClick={() => setShowAddProxyModal(true)}
                        className="px-3 py-1.5 rounded bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#090d16] font-semibold"
                      >
                        + Добавить прокси вручную
                      </button>
                    </div>
                  </div>
                ) : (
                  <table className="w-full border-collapse text-left">
                    <thead className="sticky top-0 bg-[#12141a] border-b border-[#1e2128] text-[11px] font-mono uppercase text-[#6c727f]">
                      <tr>
                        <th className="py-2 pl-4 pr-2 w-20">Статус</th>
                        <th className="py-2 px-3">Название</th>
                        <th className="py-2 px-3">Хост : Порт</th>
                        <th className="py-2 px-3">Протокол</th>
                        <th className="py-2 px-3">Реальный пинг</th>
                        <th className="py-2 pl-3 pr-4 text-right">Проверка / Управление</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#171a20] text-xs">
                      {proxies.map((proxy) => (
                        <tr key={proxy.id} className="hover:bg-[#12151c]">
                          <td className="py-2.5 pl-4 pr-2 font-mono">
                            {proxy.status === 'online' ? (
                              <span className="text-emerald-400">ONLINE</span>
                            ) : proxy.status === 'offline' ? (
                              <span className="text-rose-400">OFFLINE</span>
                            ) : (
                              <span className="text-amber-400">...</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-white">{proxy.name}</td>
                          <td className="py-2.5 px-3 font-mono text-[#c8cdd6]">
                            {proxy.host}:{proxy.port}
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            <span className="px-2 py-0.5 rounded bg-[#161a22] border border-[#262b36] text-[#38bdf8]">
                              {proxy.protocol} {proxy.udp_relay ? '+ UDP' : ''}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            {proxy.latency_ms != null ? (
                              <span className="text-emerald-400">{proxy.latency_ms} ms</span>
                            ) : (
                              <span className="text-[#6c727f]">—</span>
                            )}
                          </td>
                          <td className="py-2.5 pl-3 pr-4 text-right space-x-1.5">
                            <button
                              onClick={() => openFullProxyDiagnostic(proxy)}
                              className="px-2.5 py-1 rounded bg-[#161a22] hover:bg-[#1f2530] border border-[#2a303c] text-[#e4e6eb] font-medium"
                            >
                              Check (3-Stage)...
                            </button>
                            <button
                              onClick={() => probeSingleProxy(proxy)}
                              className="px-2 py-1 rounded bg-[#14171e] hover:bg-[#1c2029] border border-[#222630] text-[#9ca3af]"
                            >
                              Ping
                            </button>
                            <button
                              onClick={() =>
                                setProxies((prev) => prev.filter((p) => p.id !== proxy.id))
                              }
                              className="p-1 rounded hover:bg-rose-500/20 text-[#7c828d] hover:text-rose-400 align-middle"
                            >
                              <Trash2 className="w-3.5 h-3.5 inline" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* VIEW 3: PROXY CHAINS */}
            {activeSection === 'chains' && (
              <div className="p-4">
                {chains.length === 0 ? (
                  <div className="p-8 text-center border border-[#1e2128] rounded bg-[#101217] space-y-2">
                    <div className="text-[#8e95a2] font-medium">Нет созданных цепочек прокси</div>
                    <p className="text-[#6c727f]">
                      Создайте последовательную цепочку (Simple Multi-Hop), резервирование (Redundancy) или балансировку (Load Balancing) из ваших прокси-серверов.
                    </p>
                  </div>
                ) : (
                  <div className="border border-[#1e2128] rounded overflow-hidden">
                    <table className="w-full border-collapse text-left">
                      <thead className="bg-[#12141a] border-b border-[#1e2128] text-[11px] font-mono uppercase text-[#6c727f]">
                        <tr>
                          <th className="py-2 pl-4 pr-2">Название цепочки</th>
                          <th className="py-2 px-3">Режим</th>
                          <th className="py-2 px-3">Узлы</th>
                          <th className="py-2 pl-3 pr-4 text-right">Удалить</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#171a20] text-xs">
                        {chains.map((chain) => (
                          <tr key={chain.id} className="hover:bg-[#12151c]">
                            <td className="py-2.5 pl-4 pr-2 font-medium text-white">{chain.name}</td>
                            <td className="py-2.5 px-3 font-mono text-[#38bdf8]">
                              {chain.chain_type}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[#c8cdd6]">
                              {chain.proxy_ids
                                .map((pid) => proxies.find((p) => p.id === pid)?.name || pid)
                                .join(' -> ')}
                            </td>
                            <td className="py-2.5 pl-3 pr-4 text-right">
                              <button
                                onClick={() =>
                                  setChains((prev) => prev.filter((c) => c.id !== chain.id))
                                }
                                className="p-1 rounded hover:bg-rose-500/20 text-[#7c828d] hover:text-rose-400"
                              >
                                <Trash2 className="w-3.5 h-3.5 inline" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* VIEW 4: PROXIFICATION RULES */}
            {activeSection === 'rules' && (
              <div className="p-4 space-y-4">
                <div className="border border-[#1e2128] rounded overflow-hidden">
                  <table className="w-full border-collapse text-left">
                    <thead className="bg-[#12141a] border-b border-[#1e2128] text-[11px] font-mono uppercase text-[#6c727f]">
                      <tr>
                        <th className="py-2 pl-3 pr-2 w-12">#</th>
                        <th className="py-2 px-3 w-52">Правило</th>
                        <th className="py-2 px-3 w-56">Приложения</th>
                        <th className="py-2 px-3">Целевые хосты / IP</th>
                        <th className="py-2 px-3 w-28">Порты</th>
                        <th className="py-2 px-3 w-52">Действие</th>
                        <th className="py-2 pl-2 pr-3 w-28 text-right">Порядок</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#171a20] text-xs">
                      <tr className="bg-[#0e1014] text-[#7c828d]">
                        <td className="py-2 pl-3 pr-2 font-mono">SYS</td>
                        <td className="py-2 px-3 font-medium text-[#c8cdd6]">Localhost</td>
                        <td className="py-2 px-3 font-mono">Any (*)</td>
                        <td className="py-2 px-3 font-mono">localhost; 127.0.0.1; ::1</td>
                        <td className="py-2 px-3 font-mono">*</td>
                        <td className="py-2 px-3 font-mono text-emerald-400">Direct</td>
                        <td className="py-2 pl-2 pr-3 text-right font-mono text-[10px]">SYSTEM</td>
                      </tr>

                      {rules.map((rule, index) => (
                        <tr
                          key={rule.id}
                          className={`hover:bg-[#13161d] ${!rule.enabled ? 'opacity-50' : ''}`}
                        >
                          <td className="py-2 pl-3 pr-2">
                            <input
                              type="checkbox"
                              checked={rule.enabled}
                              onChange={() =>
                                setRules((prev) =>
                                  prev.map((r) =>
                                    r.id === rule.id ? { ...r, enabled: !r.enabled } : r
                                  )
                                )
                              }
                              className="accent-[#38bdf8]"
                            />
                          </td>
                          <td className="py-2 px-3 font-medium text-white">{rule.name}</td>
                          <td className="py-2 px-3 font-mono text-[11px] text-[#38bdf8] truncate max-w-[200px]">
                            {rule.process_pattern}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-[#9ca3af] truncate max-w-xs">
                            {rule.target_hosts}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-[#7c828d]">
                            {rule.ports}
                          </td>
                          <td className="py-2 px-3">
                            <select
                              value={rule.action}
                              onChange={(e) =>
                                setRules((prev) =>
                                  prev.map((r) =>
                                    r.id === rule.id ? { ...r, action: e.target.value } : r
                                  )
                                )
                              }
                              className="w-full px-2 py-1 rounded bg-[#151820] border border-[#262b36] text-white text-xs"
                            >
                              <option value="direct">Direct</option>
                              <option value="block">Block</option>
                              {proxies.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                              {chains.map((c) => (
                                <option key={c.id} value={c.id}>
                                  Chain: {c.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 pl-2 pr-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => moveRule(index, -1)}
                                disabled={index === 0}
                                className="p-1 rounded hover:bg-[#1e222b] disabled:opacity-30"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => moveRule(index, 1)}
                                disabled={index === rules.length - 1}
                                className="p-1 rounded hover:bg-[#1e222b] disabled:opacity-30"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => cloneRule(rule)}
                                className="p-1 rounded hover:bg-[#1e222b]"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() =>
                                  setRules((prev) => prev.filter((r) => r.id !== rule.id))
                                }
                                className="p-1 rounded hover:bg-rose-500/20 text-[#7c828d] hover:text-rose-400"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      <tr className="bg-[#11141b]">
                        <td className="py-2 pl-3 pr-2 font-mono text-[#38bdf8]">DEF</td>
                        <td className="py-2 px-3 font-medium text-white">Default Rule</td>
                        <td className="py-2 px-3 font-mono text-[#7c828d]">Any (*)</td>
                        <td className="py-2 px-3 font-mono text-[#7c828d]">Any host (*)</td>
                        <td className="py-2 px-3 font-mono text-[#7c828d]">*</td>
                        <td className="py-2 px-3">
                          <select
                            value={defaultRuleAction}
                            onChange={(e) => setDefaultRuleAction(e.target.value)}
                            className="w-full px-2 py-1 rounded bg-[#151820] border border-[#2c3444] text-white text-xs"
                          >
                            <option value="direct">Direct (Напрямую)</option>
                            <option value="block">Block (Блокировать всё)</option>
                            {proxies.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                            {chains.map((c) => (
                              <option key={c.id} value={c.id}>
                                Chain: {c.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pl-2 pr-3 text-right font-mono text-[10px] text-[#7c828d]">
                          DEFAULT
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Rule Evaluation Tester */}
                <div className="p-3 rounded bg-[#101217] border border-[#1e2128] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono uppercase text-[10px] text-[#6c727f]">
                      Проверка правила:
                    </span>
                    <input
                      type="text"
                      value={testProc}
                      onChange={(e) => setTestProc(e.target.value)}
                      placeholder="Процесс (.exe)"
                      className="px-2.5 py-1 rounded bg-[#161920] border border-[#262a34] font-mono text-xs w-36"
                    />
                    <input
                      type="text"
                      value={testHost}
                      onChange={(e) => setTestHost(e.target.value)}
                      placeholder="Хост или IP"
                      className="px-2.5 py-1 rounded bg-[#161920] border border-[#262a34] font-mono text-xs w-44"
                    />
                    <input
                      type="number"
                      value={testPort}
                      onChange={(e) => setTestPort(Number(e.target.value))}
                      className="px-2 py-1 rounded bg-[#161920] border border-[#262a34] font-mono text-xs w-20"
                    />
                    <button
                      onClick={runRuleSimulator}
                      className="px-3 py-1 rounded bg-[#1e2430] hover:bg-[#283040] border border-[#323b4e] text-white font-medium"
                    >
                      Проверить
                    </button>
                  </div>

                  {ruleTestResult && (
                    <div className="flex items-center gap-4 font-mono text-xs">
                      <span>
                        Сработало: <strong className="text-white">{ruleTestResult.matched_rule_name}</strong>
                      </span>
                      <span>
                        Маршрут:{' '}
                        <strong className="text-emerald-400">
                          {resolveRouteName(ruleTestResult.action)}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* VIEW 5: DNS & ADVANCED OPTIONS */}
            {activeSection === 'dns' && (
              <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="p-3.5 rounded bg-[#101217] border border-[#1e2128] space-y-3">
                  <div className="font-semibold text-white border-b border-[#1e2128] pb-2">
                    Разрешение доменных имён (Name Resolution)
                  </div>
                  {[
                    {
                      id: 'remote_fakeip',
                      title: 'Resolve hostnames through proxy (FakeIP)',
                      desc: 'Перехват DNS через пул 198.18.0.0/15, резолв на стороне прокси.',
                    },
                    {
                      id: 'auto',
                      title: 'Detect DNS settings automatically',
                      desc: 'Автоматический выбор режима DNS по доступности сети.',
                    },
                    {
                      id: 'local_first',
                      title: 'Try to resolve via local DNS service first',
                      desc: 'Локальный системный DNS Windows с фолбэком на прокси.',
                    },
                  ].map((m) => (
                    <label
                      key={m.id}
                      onClick={() =>
                        setAdvOptions((prev) => ({ ...prev, dns_mode: m.id as any }))
                      }
                      className={`block p-2.5 rounded border cursor-pointer ${
                        advOptions.dns_mode === m.id
                          ? 'bg-[#161c26] border-[#38bdf8] text-white'
                          : 'bg-[#0c0e12] border-[#1e2128] text-[#8e95a2]'
                      }`}
                    >
                      <div className="font-medium">{m.title}</div>
                      <div className="text-[11px] text-[#6c727f] mt-0.5">{m.desc}</div>
                    </label>
                  ))}

                  <div>
                    <label className="text-[11px] text-[#7c828d] block mb-1">
                      Список исключений DNS (Exclusion List):
                    </label>
                    <input
                      type="text"
                      value={advOptions.dns_exclusion_list}
                      onChange={(e) =>
                        setAdvOptions((prev) => ({
                          ...prev,
                          dns_exclusion_list: e.target.value,
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded bg-[#14171e] border border-[#242830] font-mono text-xs text-white"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded bg-[#101217] border border-[#1e2128] space-y-2.5">
                  <div className="font-semibold text-white border-b border-[#1e2128] pb-2">
                    Параметры перехвата (Profile -&gt; Advanced)
                  </div>
                  {[
                    {
                      key: 'proxify_services_and_users' as const,
                      title: 'Services and Other Users (SYSTEM / LocalService)',
                    },
                    {
                      key: 'loop_detection' as const,
                      title: 'Infinite Connection Loop Detection',
                    },
                    {
                      key: 'handle_direct_connections' as const,
                      title: 'Handle Direct Connections in Monitor',
                    },
                    {
                      key: 'http_proxy_all_ports' as const,
                      title: 'Allow HTTP CONNECT on all TCP ports',
                    },
                    {
                      key: 'kill_switch_on_failure' as const,
                      title: 'Strict Kill Switch on proxy failure',
                    },
                  ].map((opt) => (
                    <label
                      key={opt.key}
                      className="flex items-center gap-2.5 p-2 rounded bg-[#0c0e12] border border-[#1e2128] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={advOptions[opt.key]}
                        onChange={() =>
                          setAdvOptions((prev) => ({ ...prev, [opt.key]: !prev[opt.key] }))
                        }
                        className="accent-[#38bdf8]"
                      />
                      <span className="text-[#d0d4dc]">{opt.title}</span>
                    </label>
                  ))}
                </div>

                <div className="p-3.5 rounded bg-[#101217] border border-[#1e2128] space-y-2.5">
                  <div className="flex items-center justify-between border-b border-[#1e2128] pb-2">
                    <span className="font-semibold text-white">Таблица FakeIP (198.18.0.0/15)</span>
                    <button
                      onClick={handleFlushDns}
                      className="px-2 py-0.5 rounded bg-[#1c2029] hover:bg-rose-500/20 text-[#9ca3af] hover:text-rose-300 text-[11px]"
                    >
                      Flush DNS
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={testDnsDomain}
                      onChange={(e) => setTestDnsDomain(e.target.value)}
                      placeholder="Выделить FakeIP для домена..."
                      className="flex-1 px-2 py-1 rounded bg-[#14171e] border border-[#242830] font-mono"
                    />
                    <button
                      onClick={handleAllocateFakeDns}
                      className="px-2.5 py-1 rounded bg-[#1e2430] border border-[#30394b] text-white"
                    >
                      Выделить
                    </button>
                  </div>
                  <div className="space-y-1 max-h-56 overflow-y-auto font-mono text-[11px]">
                    {fakeDnsEntries.length === 0 ? (
                      <div className="py-6 text-center text-[#6c727f]">
                        Кэш FakeIP пуст
                      </div>
                    ) : (
                      fakeDnsEntries.map((e) => (
                        <div
                          key={e.fake_ip}
                          className="flex items-center justify-between px-2 py-1 rounded bg-[#0c0e12] border border-[#1a1d24]"
                        >
                          <span className="text-[#38bdf8]">{e.fake_ip}</span>
                          <span className="text-[#c8cdd6] truncate max-w-[150px]">{e.domain}</span>
                          <span className="text-[#6c727f]">{e.hits}x</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* PERSISTENT BOTTOM DOCK: REAL WINDOWS TCP/UDP SOCKETS & NIC TRAFFIC GRAPH */}
          <section
            className={`border-t border-[#1e2128] bg-[#0d0f13] flex flex-col shrink-0 transition-all ${
              bottomDockOpen ? 'h-[215px]' : 'h-8'
            }`}
          >
            <div className="h-8 px-4 bg-[#111319] border-b border-[#1e2128] flex items-center justify-between shrink-0">
              <button
                onClick={() => setBottomDockOpen(!bottomDockOpen)}
                className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-[#9ca3af] hover:text-white"
              >
                <Terminal className="w-3.5 h-3.5 text-[#38bdf8]" />
                <span>
                  Активные соединения Windows ({netSnapshot.active_tcp_count} TCP /{' '}
                  {netSnapshot.active_udp_count} UDP)
                </span>
                {bottomDockOpen ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
              </button>

              {bottomDockOpen && (
                <div className="flex items-center gap-2 text-[11px]">
                  <input
                    type="text"
                    value={connSearchFilter}
                    onChange={(e) => setConnSearchFilter(e.target.value)}
                    placeholder="Фильтр соединений (процесс / IP)..."
                    className="px-2 py-0.5 rounded bg-[#161920] border border-[#242830] text-[#e4e6eb] font-mono w-52"
                  />
                  <button
                    onClick={() => setLiveStreamPaused(!liveStreamPaused)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#161920] border border-[#242830] text-[#c8cdd6]"
                  >
                    {liveStreamPaused ? (
                      <Play className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Pause className="w-3 h-3 text-amber-400" />
                    )}
                    <span>{liveStreamPaused ? 'Resume' : 'Pause'}</span>
                  </button>
                </div>
              )}
            </div>

            {bottomDockOpen && (
              <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Real Hardware NIC Bandwidth Graph */}
                <div className="w-[230px] p-3 border-r border-[#1e2128] flex flex-col justify-between shrink-0 bg-[#0b0c0f]">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#6c727f] font-mono uppercase">NIC Traffic</span>
                    <span className="font-mono text-emerald-400">
                      {formatRate(netSnapshot.download_bytes_per_sec)}
                    </span>
                  </div>

                  <div className="h-24 flex items-end gap-[2px] pt-2 border-b border-[#1e2128]">
                    {bandwidthHistory.map((val, i) => {
                      const pct = Math.min(100, Math.max(3, Math.round((val / maxBw) * 100)));
                      return (
                        <div
                          key={i}
                          style={{ height: `${pct}%` }}
                          className="flex-1 bg-[#38bdf8]/75 transition-all duration-300"
                        />
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-[#6c727f]">
                    <span>TX: {formatRate(netSnapshot.upload_bytes_per_sec)}</span>
                    <span>iphlpapi.dll</span>
                  </div>
                </div>

                {/* Real Active Windows Sockets Table */}
                <div className="flex-1 overflow-y-auto font-mono text-[11px]">
                  <table className="w-full border-collapse text-left">
                    <thead className="sticky top-0 bg-[#101218] border-b border-[#1a1d24] text-[10px] text-[#6c727f]">
                      <tr>
                        <th className="py-1 pl-3 pr-2 w-16">PID</th>
                        <th className="py-1 px-2 w-40">Процесс</th>
                        <th className="py-1 px-2 w-36">Локальный адрес</th>
                        <th className="py-1 px-2">Удалённый узел</th>
                        <th className="py-1 px-2 w-28">Состояние</th>
                        <th className="py-1 px-2 w-44">Маршрут</th>
                        <th className="py-1 pl-2 pr-3 text-right w-24">Правило</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#15181f]">
                      {filteredConnections.map((conn) => {
                        const routeInfo = getSocketRouteLabel(conn);
                        return (
                          <tr key={conn.id} className="hover:bg-[#13161e]">
                            <td className="py-1 pl-3 pr-2 text-[#6c727f]">{conn.pid}</td>
                            <td className="py-1 px-2 text-white font-medium truncate max-w-[160px]">
                              {conn.process_name}
                            </td>
                            <td className="py-1 px-2 text-[#7c828d]">
                              {conn.local_addr}:{conn.local_port}
                            </td>
                            <td className="py-1 px-2 text-[#c8cdd6]">
                              {conn.remote_addr}:{conn.remote_port}
                            </td>
                            <td className="py-1 px-2 text-[#7c828d]">{conn.state}</td>
                            <td className="py-1 px-2 truncate">
                              <span
                                className={
                                  routeInfo.isBlocked
                                    ? 'text-rose-400'
                                    : routeInfo.isProxied
                                    ? 'text-emerald-400'
                                    : 'text-[#8e95a2]'
                                }
                              >
                                {routeInfo.label}
                              </span>
                            </td>
                            <td className="py-1 pl-2 pr-3 text-right font-sans">
                              <button
                                onClick={() => createRuleFromRealSocket(conn)}
                                className="px-1.5 py-0.2 rounded bg-[#181c24] hover:bg-[#222834] border border-[#2a303d] text-[#c8cdd6] text-[10px]"
                              >
                                + В правило
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* MODAL: ADD SINGLE PROXY */}
      {showAddProxyModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md rounded bg-[#12141a] border border-[#2a2f3a] p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-[#1e2128] pb-2">
              <span className="font-semibold text-white">Добавить прокси-сервер</span>
              <button onClick={() => setShowAddProxyModal(false)} className="text-[#7c828d] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-[#7c828d] block mb-1">Название (необязательно)</label>
                <input
                  type="text"
                  value={newProxyName}
                  onChange={(e) => setNewProxyName(e.target.value)}
                  placeholder="Напр. Мой VPS Амстердам"
                  className="w-full px-2.5 py-1.5 rounded bg-[#0c0e12] border border-[#242830] text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[#7c828d] block mb-1">Протокол</label>
                  <select
                    value={newProxyProto}
                    onChange={(e) => setNewProxyProto(e.target.value as any)}
                    className="w-full px-2 py-1.5 rounded bg-[#0c0e12] border border-[#242830] text-white"
                  >
                    <option value="SOCKS5">SOCKS5</option>
                    <option value="SOCKS4">SOCKS4</option>
                    <option value="SOCKS4A">SOCKS4A</option>
                    <option value="HTTPS">HTTPS</option>
                    <option value="HTTP">HTTP</option>
                  </select>
                </div>
                <div>
                  <label className="text-[#7c828d] block mb-1">IP / Хост</label>
                  <input
                    type="text"
                    value={newProxyHost}
                    onChange={(e) => setNewProxyHost(e.target.value)}
                    placeholder="127.0.0.1"
                    className="w-full px-2.5 py-1.5 rounded bg-[#0c0e12] border border-[#242830] text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[#7c828d] block mb-1">Порт</label>
                  <input
                    type="number"
                    value={newProxyPort}
                    onChange={(e) => setNewProxyPort(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded bg-[#0c0e12] border border-[#242830] text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[#7c828d] block mb-1">Логин (если есть)</label>
                  <input
                    type="text"
                    value={newProxyUser}
                    onChange={(e) => setNewProxyUser(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#0c0e12] border border-[#242830] text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[#7c828d] block mb-1">Пароль (если есть)</label>
                  <input
                    type="password"
                    value={newProxyPass}
                    onChange={(e) => setNewProxyPass(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#0c0e12] border border-[#242830] text-white font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddProxyModal(false)}
                className="px-3 py-1.5 rounded bg-[#1c2029] text-[#c8cdd6]"
              >
                Отмена
              </button>
              <button
                onClick={handleAddSingleProxy}
                className="px-3 py-1.5 rounded bg-[#38bdf8] text-[#090d16] font-semibold"
              >
                Добавить и проверить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: 3-STAGE PROXY CHECKER */}
      {(isCheckingProxy || diagnosticReport) && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg rounded bg-[#12141a] border border-[#2a2f3a] p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-[#1e2128] pb-2.5">
              <div className="font-semibold text-white">
                Proxy Checker: {diagnosticProxyName}
              </div>
              <button
                onClick={() => {
                  setDiagnosticReport(null);
                  setIsCheckingProxy(false);
                }}
                className="text-[#7c828d] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isCheckingProxy && (
              <div className="py-6 text-center text-[#9ca3af]">
                Выполняется реальное подключение к сокету и проверка рукопожатия...
              </div>
            )}

            {diagnosticReport && (
              <div className="space-y-2">
                {diagnosticReport.stages.map((st, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded bg-[#0c0e12] border border-[#1e2128] flex items-center justify-between"
                  >
                    <div>
                      <div className={st.passed ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
                        {st.passed ? '[PASS] ' : '[FAIL] '}
                        {st.stage_name}
                      </div>
                      <div className="font-mono text-[11px] text-[#7c828d] mt-0.5">{st.detail}</div>
                    </div>
                    <span className="font-mono text-[#c8cdd6]">{st.duration_ms} ms</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: CREATE CHAIN */}
      {showChainModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md rounded bg-[#12141a] border border-[#2a2f3a] p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-[#1e2128] pb-2">
              <span className="font-semibold text-white">Создать цепочку прокси (Proxy Chain)</span>
              <button onClick={() => setShowChainModal(false)} className="text-[#7c828d] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={newChainName}
              onChange={(e) => setNewChainName(e.target.value)}
              placeholder="Название цепочки"
              className="w-full px-2.5 py-1.5 rounded bg-[#0c0e12] border border-[#242830] text-white"
            />
            <select
              value={newChainType}
              onChange={(e) => setNewChainType(e.target.value as any)}
              className="w-full px-2.5 py-1.5 rounded bg-[#0c0e12] border border-[#242830] text-white"
            >
              <option value="simple">Simple Chain (Последовательно Multi-Hop)</option>
              <option value="redundancy">Redundancy (Резервирование / Failover)</option>
              <option value="load_balancing">Load Balancing (Балансировка)</option>
            </select>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {proxies.map((p) => {
                const sel = newChainProxies.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex items-center justify-between p-2 rounded bg-[#0c0e12] border border-[#1e2128] cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={() =>
                          setNewChainProxies((prev) =>
                            sel ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                          )
                        }
                        className="accent-[#38bdf8]"
                      />
                      <span>{p.name}</span>
                    </span>
                    <span className="font-mono text-[#7c828d]">{p.protocol}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowChainModal(false)}
                className="px-3 py-1.5 rounded bg-[#1c2029] text-[#c8cdd6]"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateChain}
                className="px-3 py-1.5 rounded bg-[#38bdf8] text-[#090d16] font-semibold"
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PPX PROFILE */}
      {ppxXmlModal !== null && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl rounded bg-[#12141a] border border-[#2a2f3a] p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-[#1e2128] pb-2">
              <span className="font-semibold text-white">Профиль Proxifier (.ppx XML)</span>
              <button onClick={() => setPpxXmlModal(null)} className="text-[#7c828d] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              rows={12}
              value={ppxXmlModal}
              onChange={(e) => setPpxXmlModal(e.target.value)}
              className="w-full p-2.5 rounded bg-[#090a0d] border border-[#1e2128] font-mono text-[11px] text-[#c8cdd6]"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(ppxXmlModal);
                  notify('Скопировано в буфер обмена');
                }}
                className="px-3 py-1.5 rounded bg-[#38bdf8] text-[#090d16] font-semibold"
              >
                Копировать XML
              </button>
              <button
                onClick={() => setPpxXmlModal(null)}
                className="px-3 py-1.5 rounded bg-[#1c2029] text-[#c8cdd6]"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: IMPORT PROXIES */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg rounded bg-[#12141a] border border-[#2a2f3a] p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-[#1e2128] pb-2">
              <span className="font-semibold text-white">Пакетный импорт прокси</span>
              <button onClick={() => setShowImportModal(false)} className="text-[#7c828d] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[#7c828d]">
              Вставьте реальные прокси (по одному на строку): <code>socks5://user:pass@ip:port#Name</code> или <code>ip:port:user:pass</code>
            </p>
            <textarea
              rows={5}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="socks5://127.0.0.1:1080#Local"
              className="w-full p-2.5 rounded bg-[#090a0d] border border-[#1e2128] font-mono text-xs text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-3 py-1.5 rounded bg-[#1c2029] text-[#c8cdd6]"
              >
                Отмена
              </button>
              <button
                onClick={handleBulkImport}
                className="px-3 py-1.5 rounded bg-[#38bdf8] text-[#090d16] font-semibold"
              >
                Импортировать и проверить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD RULE */}
      {showAddRuleModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md rounded bg-[#12141a] border border-[#2a2f3a] p-4 space-y-2.5 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-[#1e2128] pb-2">
              <span className="font-semibold text-white">Новое правило маршрутизации</span>
              <button onClick={() => setShowAddRuleModal(false)} className="text-[#7c828d] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={newRuleName}
              onChange={(e) => setNewRuleName(e.target.value)}
              placeholder="Имя правила"
              className="w-full px-2.5 py-1.5 rounded bg-[#0c0e12] border border-[#242830] text-white"
            />
            <input
              type="text"
              value={newRuleProcess}
              onChange={(e) => setNewRuleProcess(e.target.value)}
              placeholder="Процессы (chrome.exe; *updater*.exe)"
              className="w-full px-2.5 py-1.5 rounded bg-[#0c0e12] border border-[#242830] text-white font-mono"
            />
            <input
              type="text"
              value={newRuleHosts}
              onChange={(e) => setNewRuleHosts(e.target.value)}
              placeholder="Хосты (*.openai.com; 192.168.0.0/16)"
              className="w-full px-2.5 py-1.5 rounded bg-[#0c0e12] border border-[#242830] text-white font-mono"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={newRulePorts}
                onChange={(e) => setNewRulePorts(e.target.value)}
                placeholder="Порты (80; 443)"
                className="w-full px-2.5 py-1.5 rounded bg-[#0c0e12] border border-[#242830] text-white font-mono"
              />
              <select
                value={newRuleAction}
                onChange={(e) => setNewRuleAction(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-[#0c0e12] border border-[#242830] text-white"
              >
                <option value="direct">Direct</option>
                <option value="block">Block</option>
                {proxies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                {chains.map((c) => (
                  <option key={c.id} value={c.id}>
                    Chain: {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddRuleModal(false)}
                className="px-3 py-1.5 rounded bg-[#1c2029] text-[#c8cdd6]"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateRule}
                className="px-3 py-1.5 rounded bg-[#38bdf8] text-[#090d16] font-semibold"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
