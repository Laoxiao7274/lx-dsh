// Remote-backend connection view: point this LX-DSH at another backend's web
// UI (address + access key, both listed in that backend's 设置 → 外网访问).
// Connected clients fully share the remote backend's sessions, live thinking
// stream, and control — this is the multi-client story. Also owns the local
// backend's LAN-bind toggle (serving side of the same story).
import { useEffect, useState } from 'react';
import { Globe, Link2, Loader2, Minus, PlugZap, Square, Unplug, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface RemoteSettings {
  remote: { url: string } | null;
  lanBind: boolean;
  connected: boolean;
}

export function RemoteView({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<RemoteSettings | null>(null);
  const [address, setAddress] = useState('');
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    void window.lx.settings.get().then((s: RemoteSettings) => {
      setSettings(s);
      if (s.remote !== null) {
        // Pre-fill the form from the persisted URL (token included in query).
        try {
          const url = new URL(s.remote.url);
          const key = url.searchParams.get('token') ?? '';
          url.search = '';
          setAddress(url.toString().replace(/\/$/, ''));
          setToken(key);
        } catch {
          setAddress(s.remote.url);
        }
      }
    });
  }, []);

  const connect = async () => {
    if (address.trim() === '' || connecting) return;
    setConnecting(true);
    try {
      const res = await window.lx.remote.connect(address, token);
      if (res.ok) {
        window.close();
      } else {
        setSettings((s) => (s === null ? s : { ...s, connected: false }));
      }
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    await window.lx.remote.disconnect();
    setSettings((s) => (s === null ? s : { ...s, connected: false, remote: null }));
  };

  const toggleLanBind = async (enabled: boolean) => {
    setSettings((s) => (s === null ? s : { ...s, lanBind: enabled }));
    await window.lx.settings.setLanBind(enabled);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* frameless strip */}
      <div
        className="flex h-9 shrink-0 items-center justify-end border-b border-sidebar-border bg-sidebar pr-1"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => window.lx.win.min()}>
            <Minus className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => window.lx.win.max()}>
            <Square className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:bg-err/12 hover:text-err" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-[460px] flex-col gap-5">
          <div className="flex items-center gap-2.5">
            <Globe className="size-5 text-brand-1" />
            <div>
              <div className="text-[15px] font-semibold">连接远端后端</div>
              <div className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                在另一台设备的 LX-DSH 设置页「外网访问」里复制 地址 和 访问密钥，粘贴到下面。
                连接后本窗口与远端共享全部会话，实时思考与操控完全同步。
              </div>
            </div>
          </div>

          {settings?.connected ? (
            <div className="rounded-xl border border-brand-1/30 bg-brand-1/6 p-3.5">
              <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <PlugZap className="size-4 text-brand-1" />
                已连接远端
              </div>
              <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {settings.remote?.url}
              </div>
              <Button size="sm" variant="outline" className="mt-3 gap-2" onClick={() => void disconnect()}>
                <Unplug className="size-3.5" />
                断开，使用本地后端
              </Button>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 rounded-xl border border-sidebar-border bg-card p-4">
            <div className="text-[13px] font-medium">远端地址</div>
            <Input
              placeholder="http://192.168.1.10:62278"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              spellCheck={false}
              autoFocus
            />
            <div className="text-[13px] font-medium">访问密钥</div>
            <Input
              placeholder="留空表示远端未启用密钥"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              spellCheck={false}
            />
            <Button size="sm" className="mt-1 gap-2" disabled={address.trim() === '' || connecting} onClick={() => void connect()}>
              {connecting ? <Loader2 data-icon="inline-start" className="size-3.5 animate-spin" /> : <Link2 data-icon="inline-start" className="size-3.5" />}
              {connecting ? '连接中…' : '连接'}
            </Button>
          </div>

          <Separator />

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-sidebar-border bg-card p-4">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--brand-1)]"
              checked={settings?.lanBind ?? false}
              disabled={settings?.connected === true}
              onChange={(e) => { void toggleLanBind(e.target.checked); }}
            />
            <div>
              <div className="text-[13px] font-medium">允许局域网设备连接本机后端</div>
              <div className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                让本机后端监听全部网卡（0.0.0.0），其他设备就能用上面的表单连过来。
                切换会重启本地后端；首次开启时 Windows 防火墙可能弹窗，需要放行。
                对应的地址与密钥在本应用设置页「外网访问」里查看。
              </div>
            </div>
          </label>

          <div className={cn('text-center text-[11px] text-muted-foreground/60', settings?.connected === true && 'opacity-0')}>
            连接远端后，本机不再启动本地后端
          </div>
        </div>
      </div>
    </div>
  );
}
