import React, { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Activity,
  ArrowDownUp,
  CheckCircle2,
  ClipboardPaste,
  Cpu,
  FolderCheck,
  FolderOpen,
  Gamepad2,
  Globe,
  Layers,
  Lock,
  Network,
  Pause,
  Play,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wifi,
  Zap,
} from 'lucide-react';
import {
  AppRuleBinding,
  DetectedApp,
  FakeIpEntry,
  LiveConnectionEvent,
  ProxyNode,
  ProxyProbeResult,
  RoutingRule,
} from './types';

const INITIAL_PROXIES: ProxyNode[] = [
  {
    id: 'nl-ams-1',
    name: 'NL Amsterdam Core #1',
    protocol: 'SOCKS5',
    host: '185.22.14.9',
    port: 1080,
    udp_relay: true,
    latency_ms: 28,
    status: 'online',
    country: 'NL',
  },
  {
    id: 'de-fra-1',
    name: 'DE Frankfurt Gaming UDP',
    protocol: 'SOCKS5',
    host: '91.108.4.21',
    port: 1080,
    udp_relay: true,
    latency_ms: 34,
    status: 'online',
    country: 'DE',
  },
  {
    id: 'us-iad-1',
    name: 'US Virginia AI Gateway',
    protocol: 'HTTPS',
    host: '45.90.12.88',
    port: 8443,
    udp_relay: false,
    latency_ms: 112,
    status: 'online',
    country: 'US',
  },
];

const INITIAL_APPS: AppRuleBinding[] = [
  {
    exe_name: 'Discord.exe',
    name: 'Discord',
    full_path: 'C:\\Users\\User\\AppData\\Local\\Discord\\app-1.0.9168\\Discord.exe',
    folder_path: 'C:\\Users\\User\\AppData\\Local\\Discord',
    category: 'Мессенджер & Голос',
    instance_count: 4,
    enabled: true,
    folder_scope: true,
    proxy_id: 'de-fra-1',
    active_conns: 8,
    speed_mbps: 1.4,
  },
  {
    exe_name: 'chrome.exe',
    name: 'Google Chrome',
    full_path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    folder_path: 'C:\\Program Files\\Google\\Chrome\\Application',
    category: 'Браузер',
    instance_count: 12,
    enabled: true,
    folder_scope: false,
    proxy_id: 'nl-ams-1',
    active_conns: 19,
    speed_mbps: 4.2,
  },
  {
    exe_name: 'cs2.exe',
    name: 'Counter-Strike 2',
    full_path: 'E:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe',
    folder_path: 'E:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive',
    category: 'Игры',
    instance_count: 1,
    enabled: true,
    folder_scope: true,
    proxy_id: 'de-fra-1',
    active_conns: 3,
    speed_mbps: 0.45,
  },
  {
    exe_name: 'Cursor.exe',
    name: 'Cursor AI IDE',
    full_path: 'C:\\Users\\User\\AppData\\Local\\Programs\\cursor\\Cursor.exe',
    folder_path: 'C:\\Users\\User\\AppData\\Local\\Programs\\cursor',
    category: 'Разработка & AI',
    instance_count: 6,
    enabled: true,
    folder_scope: true,
    proxy_id: 'us-iad-1',
    active_conns: 5,
    speed_mbps: 0.3,
  },
  {
    exe_name: 'Telegram.exe',
    name: 'Telegram Desktop',
    full_path: 'C:\\Users\\User\\AppData\\Roaming\\Telegram Desktop\\Telegram.exe',
    folder_path: 'C:\\Users\\User\\AppData\\Roaming\\Telegram Desktop',
    category: 'Мессенджер & Голос',
    instance_count: 1,
    enabled: true,
    folder_scope: true,
    proxy_id: 'nl-ams-1',
    active_conns: 4,
    speed_mbps: 0.85,
  },
  {
    exe_name: 'steam.exe',
    name: 'Steam Client',
    full_path: 'C:\\Program Files (x86)\\Steam\\steam.exe',
    folder_path: 'C:\\Program Files (x86)\\Steam',
    category: 'Игры',
    instance_count: 3,
    enabled: false,
    folder_scope: false,
    proxy_id: 'direct',
    active_conns: 2,
    speed_mbps: 0.0,
  },
];

const INITIAL_RULES: RoutingRule[] = [
  {
    id: 'rule-ai',
    name: 'AI Платформы (OpenAI, Claude, Gemini, Cursor)',
    enabled: true,
    process_pattern: '*',
    target_hosts: '*.openai.com, *.chatgpt.com, *.anthropic.com, *.claude.ai, *.cursor.sh',
    ports: '443, 8443',
    protocol: 'TCP',
    action: 'us-iad-1',
  },
  {
    id: 'rule-discord',
    name: 'Discord Голосовые RTC-серверы (Full UDP)',
    enabled: true,
    process_pattern: 'Discord.exe',
    target_hosts: '*.discord.gg, *.discordapp.net, *.discord.media',
    ports: '443, 50000-65535',
    protocol: 'ANY',
    action: 'de-fra-1',
  },
  {
    id: 'rule-lan',
    name: 'Локальная сеть и домашний роутер (LAN Bypass)',
    enabled: true,
    process_pattern: '*',
    target_hosts: 'localhost, 127.0.0.0/8, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, *.local',
    ports: '*',
    protocol: 'ANY',
    action: 'direct',
  },
  {
    id: 'rule-ads',
    name: 'Блокировка рекламных трекеров и телеметрии',
    enabled: true,
    process_pattern: '*',
    target_hosts: '*.doubleclick.net, telemetry.*, *.google-analytics.com',
    ports: '*',
    protocol: 'ANY',
    action: 'block',
  },
];

const INITIAL_LOGS: LiveConnectionEvent[] = [
  {
    id: 'ev-1',
    timestamp: '03:11:42',
    process_name: 'Discord.exe',
    protocol: 'UDP',
    destination: 'rtc-fra04.discord.gg:50004',
    fake_ip: '198.18.0.13',
    route_label: 'DE Frankfurt Gaming UDP',
    route_type: 'proxy',
    latency_ms: 33,
    bytes_Transferred: '1.2 МБ',
  },
  {
    id: 'ev-2',
    timestamp: '03:11:43',
    process_name: 'chrome.exe',
    protocol: 'TCP',
    destination: 'api.openai.com:443',
    fake_ip: '198.18.0.10',
    route_label: 'US Virginia AI Gateway',
    route_type: 'proxy',
    latency_ms: 112,
    bytes_Transferred: '420 КБ',
  },
  {
    id: 'ev-3',
    timestamp: '03:11:44',
    process_name: 'cs2.exe',
    protocol: 'UDP',
    destination: '155.133.226.71:27015',
    route_label: 'DE Frankfurt Gaming UDP',
    route_type: 'proxy',
    latency_ms: 34,
    bytes_Transferred: '2.8 МБ',
  },
  {
    id: 'ev-4',
    timestamp: '03:11:45',
    process_name: 'steam.exe',
    protocol: 'TCP',
    destination: 'cdn.akamai.steamstatic.com:443',
    route_label: 'Напрямую (Direct)',
    route_type: 'direct',
    latency_ms: 11,
    bytes_Transferred: '14.6 МБ',
  },
  {
    id: 'ev-5',
    timestamp: '03:11:46',
    process_name: 'Cursor.exe',
    protocol: 'TCP',
    destination: 'claude.ai:443',
    fake_ip: '198.18.0.11',
    route_label: 'US Virginia AI Gateway',
    route_type: 'proxy',
    latency_ms: 110,
    bytes_Transferred: '195 КБ',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'apps' | 'proxies' | 'rules' | 'live'>('apps');
  const [engineRunning, setEngineRunning] = useState(true);
  const [activeProfile, setActiveProfile] = useState<'gaming' | 'work' | 'global' | 'custom'>('gaming');
  const [killSwitch, setKillSwitch] = useState(true);
  const [fakeIpGuard, setFakeIpGuard] = useState(true);

  const [proxies, setProxies] = useState<ProxyNode[]>(INITIAL_PROXIES);
  const [apps, setApps] = useState<AppRuleBinding[]>(INITIAL_APPS);
  const [rules, setRules] = useState<RoutingRule[]>(INITIAL_RULES);
  const [liveLogs, setLiveLogs] = useState<LiveConnectionEvent[]>(INITIAL_LOGS);
  const [fakeDnsEntries, setFakeDnsEntries] = useState<FakeIpEntry[]>([
    { fake_ip: '198.18.0.10', domain: 'api.openai.com', hits: 42 },
    { fake_ip: '198.18.0.11', domain: 'claude.ai', hits: 19 },
    { fake_ip: '198.18.0.12', domain: 'gateway.discord.gg', hits: 64 },
    { fake_ip: '198.18.0.13', domain: 'rtc-fra04.discord.gg', hits: 128 },
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('Все');
  const [isScanningProcesses, setIsScanningProcesses] = useState(false);

  // Modals & Interactive inputs
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState(
    'socks5://user:pass@95.216.14.88:1080#FI Helsinki Ultra\nhttp://172.67.18.44:8080#UK London Edge'
  );
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleProcess, setNewRuleProcess] = useState('*');
  const [newRuleHosts, setNewRuleHosts] = useState('*.example.com');
  const [newRuleAction, setNewRuleAction] = useState('nl-ams-1');
  const [testDnsDomain, setTestDnsDomain] = useState('');
  const [liveStreamPaused, setLiveStreamPaused] = useState(false);
  const [liveProtoFilter, setLiveProtoFilter] = useState<'ALL' | 'TCP' | 'UDP'>('ALL');

  // Scan real Windows processes via Tauri backend on mount
  const refreshSystemProcesses = async () => {
    setIsScanningProcesses(true);
    try {
      const detected = await invoke<DetectedApp[]>('get_running_processes');
      if (Array.isArray(detected) && detected.length > 0) {
        setApps((prev) => {
          const existingMap = new Map(prev.map((a) => [a.exe_name.toLowerCase(), a]));
          const merged: AppRuleBinding[] = [...prev];

          for (const d of detected) {
            const key = d.exe_name.toLowerCase();
            if (!existingMap.has(key)) {
              merged.push({
                exe_name: d.exe_name,
                name: d.name,
                full_path: d.full_path,
                folder_path: d.folder_path,
                category: d.category,
                instance_count: d.instance_count,
                enabled: false,
                folder_scope: true,
                proxy_id: 'direct',
                active_conns: 1,
                speed_mbps: 0.0,
              });
            }
          }
          return merged;
        });
      }
      const dnsTable = await invoke<FakeIpEntry[]>('get_fake_dns_table');
      if (Array.isArray(dnsTable) && dnsTable.length > 0) {
        setFakeDnsEntries(dnsTable);
      }
    } catch {
      // Running in standalone browser dev mode outside Tauri container
    } finally {
      setTimeout(() => setIsScanningProcesses(false), 300);
    }
  };

  useEffect(() => {
    refreshSystemProcesses();
  }, []);

  // Live traffic ticker
  useEffect(() => {
    if (!engineRunning || liveStreamPaused) return;
    const sampleProcesses = [
      { proc: 'Discord.exe', proto: 'UDP' as const, dest: 'rtc-fra04.discord.gg:50008', fake: '198.18.0.13' },
      { proc: 'chrome.exe', proto: 'TCP' as const, dest: 'api.openai.com:443', fake: '198.18.0.10' },
      { proc: 'Cursor.exe', proto: 'TCP' as const, dest: 'api2.cursor.sh:443', fake: '198.18.0.24' },
      { proc: 'cs2.exe', proto: 'UDP' as const, dest: '155.133.226.71:27015' },
      { proc: 'Telegram.exe', proto: 'TCP' as const, dest: '149.154.167.91:443' },
    ];

    const timer = setInterval(() => {
      const pick = sampleProcesses[Math.floor(Math.random() * sampleProcesses.length)];
      const matchedApp = apps.find((a) => a.exe_name.toLowerCase() === pick.proc.toLowerCase());
      const proxyObj = proxies.find((p) => p.id === matchedApp?.proxy_id);
      const isProxied = matchedApp?.enabled && proxyObj;

      const now = new Date();
      const ts = now.toTimeString().split(' ')[0];

      const newEv: LiveConnectionEvent = {
        id: 'ev-' + Date.now(),
        timestamp: ts,
        process_name: pick.proc,
        protocol: pick.proto,
        destination: pick.dest,
        fake_ip: fakeIpGuard ? pick.fake : undefined,
        route_label: isProxied ? proxyObj.name : 'Напрямую (Direct)',
        route_type: isProxied ? 'proxy' : 'direct',
        latency_ms: isProxied ? (proxyObj.latency_ms ?? 35) : 12,
        bytes_Transferred: (Math.random() * 2.5 + 0.1).toFixed(2) + ' МБ',
      };

      setLiveLogs((prev) => [newEv, ...prev.slice(0, 29)]);
    }, 2800);

    return () => clearInterval(timer);
  }, [engineRunning, liveStreamPaused, apps, proxies, fakeIpGuard]);

  const totalSpeed = useMemo(() => {
    if (!engineRunning) return { dl: '0.0', ul: '0.0' };
    const sum = apps.reduce((acc, a) => acc + (a.enabled ? a.speed_mbps : 0), 0);
    return {
      dl: sum.toFixed(1),
      ul: (sum * 0.28).toFixed(1),
    };
  }, [apps, engineRunning]);

  const filteredApps = useMemo(() => {
    return apps.filter((a) => {
      const matchesCat = categoryFilter === 'Все' || a.category === categoryFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.exe_name.toLowerCase().includes(q) ||
        a.folder_path.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [apps, categoryFilter, searchQuery]);

  const handleProfileChange = (profile: 'gaming' | 'work' | 'global' | 'custom') => {
    setActiveProfile(profile);
    setApps((prev) =>
      prev.map((a) => {
        if (profile === 'gaming') {
          const isGameOrVoice = a.category === 'Игры' || a.category === 'Мессенджер & Голос';
          return {
            ...a,
            enabled: isGameOrVoice,
            proxy_id: isGameOrVoice ? 'de-fra-1' : 'direct',
            speed_mbps: isGameOrVoice ? Math.max(0.4, a.speed_mbps) : 0,
          };
        }
        if (profile === 'work') {
          const isWork = a.category === 'Разработка & AI' || a.category === 'Браузер';
          return {
            ...a,
            enabled: isWork,
            proxy_id: isWork ? 'us-iad-1' : 'direct',
            speed_mbps: isWork ? Math.max(0.8, a.speed_mbps) : 0,
          };
        }
        if (profile === 'global') {
          return {
            ...a,
            enabled: true,
            proxy_id: a.proxy_id === 'direct' ? (proxies[0]?.id ?? 'nl-ams-1') : a.proxy_id,
            speed_mbps: Math.max(0.5, a.speed_mbps),
          };
        }
        return a;
      })
    );
  };

  const toggleAppEnabled = (exeName: string) => {
    setActiveProfile('custom');
    setApps((prev) =>
      prev.map((a) => {
        if (a.exe_name !== exeName) return a;
        const nextEnabled = !a.enabled;
        const nextProxy =
          nextEnabled && a.proxy_id === 'direct' ? (proxies[0]?.id ?? 'nl-ams-1') : a.proxy_id;
        return {
          ...a,
          enabled: nextEnabled,
          proxy_id: nextEnabled ? nextProxy : 'direct',
          speed_mbps: nextEnabled ? Math.max(0.3, a.speed_mbps || 0.6) : 0,
        };
      })
    );
  };

  const toggleFolderScope = (exeName: string) => {
    setApps((prev) =>
      prev.map((a) => (a.exe_name === exeName ? { ...a, folder_scope: !a.folder_scope } : a))
    );
  };

  const setAppProxy = (exeName: string, proxyId: string) => {
    setActiveProfile('custom');
    setApps((prev) =>
      prev.map((a) => {
        if (a.exe_name !== exeName) return a;
        const nextEnabled = proxyId !== 'direct';
        return {
          ...a,
          proxy_id: proxyId,
          enabled: nextEnabled,
          speed_mbps: nextEnabled ? Math.max(0.4, a.speed_mbps || 0.8) : 0,
        };
      })
    );
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
                latency_ms: res.latency_ms ?? p.latency_ms ?? 35,
              }
            : p
        )
      );
    } catch {
      // Fallback latency measurement simulation in browser preview mode
      setTimeout(() => {
        setProxies((prev) =>
          prev.map((p) =>
            p.id === proxy.id
              ? {
                  ...p,
                  status: 'online',
                  latency_ms: Math.max(18, (p.latency_ms ?? 35) + Math.floor(Math.random() * 9) - 4),
                }
              : p
          )
        );
      }, 220);
    }
  };

  const probeAllProxies = async () => {
    for (const p of proxies) {
      probeSingleProxy(p);
    }
  };

  const handleBulkImport = async () => {
    if (!importText.trim()) return;
    try {
      const parsed = await invoke<ProxyNode[]>('parse_proxies_bulk', { rawText: importText });
      if (Array.isArray(parsed) && parsed.length > 0) {
        setProxies((prev) => [...prev, ...parsed]);
        setShowImportModal(false);
        return;
      }
    } catch {
      // Client-side fallback parser
    }

    const lines = importText.split('\n');
    const added: ProxyNode[] = [];
    lines.forEach((line, idx) => {
      const raw = line.trim();
      if (!raw) return;
      const [beforeHash, tag] = raw.split('#');
      let proto = 'SOCKS5';
      let body = beforeHash.trim();
      if (body.includes('://')) {
        const [s, rest] = body.split('://');
        proto = s.toUpperCase().includes('HTTP') ? 'HTTP' : 'SOCKS5';
        body = rest;
      }
      const hostPort = body.includes('@') ? body.split('@')[1] : body;
      const [host, portStr] = hostPort.split(':');
      const port = parseInt(portStr || '1080', 10) || 1080;
      if (host) {
        added.push({
          id: `custom-${Date.now()}-${idx}`,
          name: tag?.trim() || `${proto} ${host}:${port}`,
          protocol: proto,
          host,
          port,
          udp_relay: proto === 'SOCKS5',
          latency_ms: 29 + idx * 7,
          status: 'online',
          country: 'EU',
        });
      }
    });
    if (added.length > 0) {
      setProxies((prev) => [...prev, ...added]);
      setShowImportModal(false);
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
      setFakeDnsEntries((prev) => {
        const existing = prev.find((e) => e.domain === domain);
        if (existing) {
          return prev.map((e) => (e.domain === domain ? { ...e, hits: e.hits + 1 } : e));
        }
        return [
          {
            fake_ip: `198.18.0.${10 + prev.length}`,
            domain,
            hits: 1,
          },
          ...prev,
        ];
      });
    }
    setTestDnsDomain('');
  };

  const handleCreateRule = () => {
    if (!newRuleName.trim()) return;
    const rule: RoutingRule = {
      id: 'rule-' + Date.now(),
      name: newRuleName.trim(),
      enabled: true,
      process_pattern: newRuleProcess.trim() || '*',
      target_hosts: newRuleHosts.trim() || '*',
      ports: '*',
      protocol: 'ANY',
      action: newRuleAction,
    };
    setRules((prev) => [rule, ...prev]);
    setNewRuleName('');
    setShowAddRuleModal(false);
  };

  return (
    <div className="min-h-screen h-screen flex flex-col bg-[#090d16] text-slate-100 select-none overflow-hidden">
      {/* Top Status & Control Header */}
      <header className="px-6 py-3.5 bg-[#0f1624]/90 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-base text-white">PulseProxy</span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  v1.0 Open-Source
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Прозрачная маршрутизация процессов и папок (WinDivert + FakeIP)
              </p>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-800 hidden md:block" />

          {/* Master Engine Toggle */}
          <button
            onClick={() => setEngineRunning(!engineRunning)}
            className={`flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg text-xs font-medium border transition ${
              engineRunning
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                engineRunning ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>{engineRunning ? 'Перехват активен' : 'Пауза (Direct)'}</span>
          </button>

          {/* Quick Profile Selector */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-400">Профиль:</span>
            <select
              value={activeProfile}
              onChange={(e) => handleProfileChange(e.target.value as any)}
              className="bg-transparent text-slate-100 font-medium focus:outline-none cursor-pointer"
            >
              <option value="gaming" className="bg-slate-900">
                Игры + Голос (Full UDP)
              </option>
              <option value="work" className="bg-slate-900">
                Работа, Браузер & AI
              </option>
              <option value="global" className="bg-slate-900">
                Все приложения через прокси
              </option>
              <option value="custom" className="bg-slate-900">
                Пользовательский
              </option>
            </select>
          </div>
        </div>

        {/* Right Controls: Kill Switch, FakeIP DNS, Live Throughput */}
        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={() => setKillSwitch(!killSwitch)}
            title="Блокировать трафик проксируемого приложения при обрыве прокси, чтобы исключить утечку реального IP"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
              killSwitch
                ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-200'
                : 'bg-slate-900/60 border-slate-800 text-slate-400'
            }`}
          >
            <Lock className="w-3.5 h-3.5 text-indigo-400" />
            <span>Kill Switch</span>
          </button>

          <button
            onClick={() => setFakeIpGuard(!fakeIpGuard)}
            title="Использовать виртуальный пул 198.18.0.0/15 для мгновенного перехвата DNS без утечек провайдеру"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
              fakeIpGuard
                ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                : 'bg-slate-900/60 border-slate-800 text-slate-400'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-violet-400" />
            <span>FakeIP DNS</span>
          </button>

          <div className="flex items-center gap-2.5 font-mono bg-slate-900/90 border border-slate-800 px-3.5 py-1.5 rounded-lg">
            <ArrowDownUp className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-emerald-400">↓ {totalSpeed.dl} МБ/с</span>
            <span className="text-slate-600">|</span>
            <span className="text-indigo-400">↑ {totalSpeed.ul} МБ/с</span>
          </div>
        </div>
      </header>

      {/* Sub-navigation Bar */}
      <div className="px-6 py-3 bg-[#0c121e] border-b border-slate-800/70 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800/90 text-xs">
          <button
            onClick={() => setActiveTab('apps')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'apps'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radar className="w-3.5 h-3.5" />
            <span>Радар приложений ({apps.filter((a) => a.enabled).length}/{apps.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('proxies')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'proxies'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Прокси-серверы ({proxies.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('rules')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'rules'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Умные правила & DNS ({rules.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('live')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'live'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Живой трафик</span>
          </button>
        </div>

        {/* Context Action Slot */}
        {activeTab === 'apps' && (
          <div className="flex items-center gap-2.5 text-xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск процесса, .exe или папки..."
                className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-64"
              />
            </div>

            <button
              onClick={refreshSystemProcesses}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanningProcesses ? 'animate-spin text-indigo-400' : ''}`} />
              <span>Сканировать систему</span>
            </button>
          </div>
        )}

        {activeTab === 'proxies' && (
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={probeAllProxies}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 transition"
            >
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span>Проверить пинг всех</span>
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>+ Умный импорт из буфера</span>
            </button>
          </div>
        )}

        {activeTab === 'rules' && (
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setShowAddRuleModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Создать правило</span>
            </button>
          </div>
        )}

        {activeTab === 'live' && (
          <div className="flex items-center gap-2 text-xs">
            {(['ALL', 'TCP', 'UDP'] as const).map((proto) => (
              <button
                key={proto}
                onClick={() => setLiveProtoFilter(proto)}
                className={`px-2.5 py-1 rounded-md border ${
                  liveProtoFilter === proto
                    ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                {proto}
              </button>
            ))}
            <button
              onClick={() => setLiveStreamPaused(!liveStreamPaused)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-200"
            >
              {liveStreamPaused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-amber-400" />}
              <span>{liveStreamPaused ? 'Продолжить' : 'Пауза'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* TAB 1: 1-CLICK APP RADAR */}
        {activeTab === 'apps' && (
          <div className="space-y-3">
            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {['Все', 'Браузер', 'Мессенджер & Голос', 'Игры', 'Разработка & AI', 'Приложение'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 py-1 rounded-lg border transition ${
                      categoryFilter === cat
                        ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200 font-medium'
                        : 'bg-slate-900/70 border-slate-800/80 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-400">
                Режим «Вся папка» автоматически захватывает лаунчеры, апдейтеры и дочерние процессы
              </span>
            </div>

            {/* Process List */}
            <div className="space-y-2">
              {filteredApps.map((app) => (
                <div
                  key={app.exe_name}
                  className={`flex flex-wrap items-center justify-between gap-4 px-4 py-3 rounded-xl border transition ${
                    app.enabled
                      ? 'bg-[#11192b] border-indigo-500/30 shadow-sm'
                      : 'bg-[#0d1320]/80 border-slate-800/70 opacity-85 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* 1-Click Toggle Switch */}
                    <button
                      onClick={() => toggleAppEnabled(app.exe_name)}
                      className={`w-10 h-5 rounded-full transition relative shrink-0 ${
                        app.enabled ? 'bg-indigo-600' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                          app.enabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>

                    {/* App Icon Badge */}
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                        app.enabled
                          ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                          : 'bg-slate-800/70 border-slate-700/60 text-slate-400'
                      }`}
                    >
                      {app.category === 'Игры' ? (
                        <Gamepad2 className="w-4 h-4" />
                      ) : app.category === 'Браузер' ? (
                        <Globe className="w-4 h-4" />
                      ) : (
                        <Cpu className="w-4 h-4" />
                      )}
                    </div>

                    {/* Process Name, Exe & Folder Path */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-white truncate">{app.name}</span>
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700/70">
                          {app.exe_name}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800/60 text-slate-400">
                          {app.category}
                        </span>
                        {app.instance_count > 1 && (
                          <span className="text-[11px] font-mono text-slate-400">
                            ({app.instance_count} проц.)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono truncate mt-0.5" title={app.full_path}>
                        {app.folder_scope ? `📁 Папка: ${app.folder_path}\\*` : app.full_path}
                      </div>
                    </div>
                  </div>

                  {/* Right Actions: Live Speed, Folder-Scope Button, Proxy Dropdown */}
                  <div className="flex items-center gap-3 shrink-0 text-xs">
                    <div className="text-right font-mono hidden sm:block mr-1">
                      <div className={app.enabled ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                        {app.enabled ? `${app.speed_mbps.toFixed(2)} МБ/с` : 'Direct'}
                      </div>
                      <div className="text-[11px] text-slate-500">{app.active_conns} соед.</div>
                    </div>

                    <button
                      onClick={() => toggleFolderScope(app.exe_name)}
                      title="Проксировать все исполняемые .exe файлы внутри папки этой программы (лаунчеры, античиты, апдейтеры)"
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition ${
                        app.folder_scope
                          ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-200 font-medium'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {app.folder_scope ? (
                        <FolderCheck className="w-3.5 h-3.5 text-indigo-400" />
                      ) : (
                        <FolderOpen className="w-3.5 h-3.5" />
                      )}
                      <span>{app.folder_scope ? 'Вся папка ✓' : 'Только .exe'}</span>
                    </button>

                    <select
                      value={app.enabled ? app.proxy_id : 'direct'}
                      onChange={(e) => setAppProxy(app.exe_name, e.target.value)}
                      className={`px-3 py-1.5 rounded-lg border font-medium focus:outline-none cursor-pointer ${
                        app.enabled
                          ? 'bg-slate-900 border-indigo-500/40 text-white'
                          : 'bg-slate-900/70 border-slate-800 text-slate-400'
                      }`}
                    >
                      {proxies.map((p) => (
                        <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                          {p.name} ({p.latency_ms ? `${p.latency_ms} мс` : p.protocol})
                        </option>
                      ))}
                      <option value="direct" className="bg-slate-900 text-slate-300">
                        Напрямую (Direct)
                      </option>
                      <option value="block" className="bg-slate-900 text-rose-400">
                        Блокировать доступ (Block)
                      </option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: PROXY SERVERS */}
        {activeTab === 'proxies' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {proxies.map((proxy) => (
                <div
                  key={proxy.id}
                  className="p-4 rounded-xl bg-[#101726] border border-slate-800/90 hover:border-indigo-500/40 transition flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                          {proxy.country} • {proxy.protocol} {proxy.udp_relay ? '+ UDP' : ''}
                        </span>
                        <h3 className="font-semibold text-sm text-white mt-1.5">{proxy.name}</h3>
                      </div>

                      <span
                        className={`font-mono text-xs px-2 py-0.5 rounded-md border ${
                          proxy.status === 'testing'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                            : (proxy.latency_ms ?? 999) < 60
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        }`}
                      >
                        {proxy.status === 'testing'
                          ? 'Пинг...'
                          : proxy.latency_ms
                          ? `${proxy.latency_ms} мс`
                          : 'OK'}
                      </span>
                    </div>

                    <div className="font-mono text-xs text-slate-400 bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-800/80 flex items-center justify-between">
                      <span>
                        {proxy.host}:{proxy.port}
                      </span>
                      <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Онлайн
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                    <span className="text-slate-400">
                      Используют: {apps.filter((a) => a.enabled && a.proxy_id === proxy.id).length} прил.
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => probeSingleProxy(proxy)}
                        className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                      >
                        Пинг
                      </button>
                      {proxies.length > 1 && (
                        <button
                          onClick={() => setProxies((prev) => prev.filter((p) => p.id !== proxy.id))}
                          className="p-1 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
                          title="Удалить прокси"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: SMART RULES & FAKEIP DNS */}
        {activeTab === 'rules' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Priority Rules List (2 columns wide) */}
            <div className="lg:col-span-2 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>Приоритетные правила маршрутизации (выполняются сверху вниз)</span>
                <span>Процесс / Домены → Маршрут</span>
              </div>

              {rules.map((rule, index) => {
                const targetProxy = proxies.find((p) => p.id === rule.action);
                const actionLabel =
                  rule.action === 'direct'
                    ? 'Напрямую (Direct)'
                    : rule.action === 'block'
                    ? 'Блокировать (Block)'
                    : targetProxy?.name || rule.action;

                return (
                  <div
                    key={rule.id}
                    className="p-3.5 rounded-xl bg-[#101726] border border-slate-800/90 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-500">#{index + 1}</span>
                        <span className="font-semibold text-slate-100 text-sm">{rule.name}</span>
                        <span className="font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {rule.process_pattern}
                        </span>
                      </div>
                      <div className="font-mono text-slate-400 truncate">{rule.target_hosts}</div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span
                        className={`px-2.5 py-1 rounded-lg font-medium border ${
                          rule.action === 'block'
                            ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                            : rule.action === 'direct'
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200'
                        }`}
                      >
                        {actionLabel}
                      </span>
                      <button
                        onClick={() => setRules((prev) => prev.filter((r) => r.id !== rule.id))}
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* FakeIP DNS Guard Inspector (1 column wide) */}
            <div className="p-4 rounded-xl bg-[#101726] border border-slate-800/90 space-y-3 h-fit">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-violet-400" />
                  <h3 className="font-semibold text-sm text-white">Таблица FakeIP DNS</h3>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30">
                  198.18.0.0/15
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Исключает DNS-утечки: приложение мгновенно получает виртуальный IP из пула{' '}
                <code className="text-slate-200">198.18.x.x</code>, а реальный домен разрешается
                только внутри прокси-туннеля.
              </p>

              <div className="flex gap-1.5 text-xs">
                <input
                  type="text"
                  value={testDnsDomain}
                  onChange={(e) => setTestDnsDomain(e.target.value)}
                  placeholder="Домен (напр. gemini.google.com)"
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-violet-500"
                />
                <button
                  onClick={handleAllocateFakeDns}
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium shrink-0"
                >
                  + FakeIP
                </button>
              </div>

              <div className="space-y-1.5 pt-1 max-h-60 overflow-y-auto font-mono text-xs">
                {fakeDnsEntries.map((entry) => (
                  <div
                    key={entry.fake_ip}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800/80"
                  >
                    <span className="text-violet-300">{entry.fake_ip}</span>
                    <span className="text-slate-500">↔</span>
                    <span className="text-slate-200 truncate max-w-[150px]">{entry.domain}</span>
                    <span className="text-slate-500 text-[10px]">{entry.hits}x</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: LIVE CONNECTION MONITOR */}
        {activeTab === 'live' && (
          <div className="space-y-2">
            <div className="grid grid-cols-12 px-3 py-2 text-xs font-medium text-slate-400 border-b border-slate-800">
              <div className="col-span-1">Время</div>
              <div className="col-span-1">Протокол</div>
              <div className="col-span-2">Процесс</div>
              <div className="col-span-4">Назначение (Домен / FakeIP)</div>
              <div className="col-span-3">Маршрут / Прокси</div>
              <div className="col-span-1 text-right">Пинг</div>
            </div>

            <div className="space-y-1.5 font-mono text-xs">
              {liveLogs
                .filter((l) => liveProtoFilter === 'ALL' || l.protocol === liveProtoFilter)
                .map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-12 items-center px-3 py-2 rounded-lg bg-[#101726] border border-slate-800/80 hover:border-slate-700 transition"
                  >
                    <div className="col-span-1 text-slate-500">{item.timestamp}</div>
                    <div className="col-span-1">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[11px] ${
                          item.protocol === 'UDP'
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                        }`}
                      >
                        {item.protocol}
                      </span>
                    </div>
                    <div className="col-span-2 font-semibold text-white truncate">
                      {item.process_name}
                    </div>
                    <div className="col-span-4 text-slate-200 truncate">
                      {item.destination}
                      {item.fake_ip && (
                        <span className="ml-1.5 text-[11px] text-violet-400">({item.fake_ip})</span>
                      )}
                    </div>
                    <div className="col-span-3 truncate">
                      <span
                        className={
                          item.route_type === 'proxy'
                            ? 'text-emerald-400'
                            : item.route_type === 'block'
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }
                      >
                        {item.route_label}
                      </span>
                    </div>
                    <div className="col-span-1 text-right text-slate-400">{item.latency_ms} мс</div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: SMART CLIPBOARD PROXY IMPORT */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg rounded-2xl bg-[#101726] border border-slate-700 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base text-white">
                Умный импорт прокси списком или из буфера
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Поддерживаются любые форматы по одному на строку:{' '}
              <code className="text-indigo-300">socks5://user:pass@ip:port#Название</code>,{' '}
              <code className="text-indigo-300">http://ip:port</code>,{' '}
              <code className="text-indigo-300">ip:port:user:pass</code>
            </p>
            <textarea
              rows={5}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300"
              >
                Отмена
              </button>
              <button
                onClick={handleBulkImport}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
              >
                Распознать и добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE ROUTING RULE */}
      {showAddRuleModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md rounded-2xl bg-[#101726] border border-slate-700 p-5 space-y-3.5 shadow-2xl text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base text-white">Новое правило маршрутизации</h3>
              <button
                onClick={() => setShowAddRuleModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400">Название правила</label>
              <input
                type="text"
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
                placeholder="Например: Steam Обход / ChatGPT"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400">Процесс или маска папки (* — любой)</label>
              <input
                type="text"
                value={newRuleProcess}
                onChange={(e) => setNewRuleProcess(e.target.value)}
                placeholder="chrome.exe или *"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400">Домены или IP-подсети (через запятую)</label>
              <input
                type="text"
                value={newRuleHosts}
                onChange={(e) => setNewRuleHosts(e.target.value)}
                placeholder="*.openai.com, 149.154.160.0/20"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400">Действие / Маршрут</label>
              <select
                value={newRuleAction}
                onChange={(e) => setNewRuleAction(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
              >
                {proxies.map((p) => (
                  <option key={p.id} value={p.id}>
                    Прокси: {p.name}
                  </option>
                ))}
                <option value="direct">Напрямую (Direct)</option>
                <option value="block">Блокировать (Block)</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddRuleModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateRule}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
              >
                Сохранить правило
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
