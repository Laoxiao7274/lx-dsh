// Plugin management view: list non-official plugins, install/uninstall, view details.
import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Minus,
  Package,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { PluginInfo } from '@/dsh/types';
import { toast } from 'sonner';

export function PluginView({ onClose }: { onClose: () => void }) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [installDialog, setInstallDialog] = useState(false);
  const [installName, setInstallName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<PluginInfo | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.lx.plugins.list();
      setPlugins(list);
    } catch (err) {
      toast.error('加载插件列表失败: ' + String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const install = async () => {
    const name = installName.trim();
    if (!name) return;
    setInstallDialog(false);
    setInstallName('');
    setBusy(name);
    toast.info(`正在安装 ${name}…`);
    try {
      const res = await window.lx.plugins.install(name);
      if (res.ok) {
        toast.success(`${name} 安装成功`);
        await refresh();
      } else {
        toast.error(`安装失败: ${res.error ?? '未知错误'}`);
      }
    } catch (err) {
      toast.error(`安装失败: ${String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const uninstall = async (plugin: PluginInfo) => {
    setBusy(plugin.name);
    toast.info(`正在卸载 ${plugin.name}…`);
    try {
      const res = await window.lx.plugins.uninstall(plugin.name);
      if (res.ok) {
        toast.success(`${plugin.name} 已卸载`);
        await refresh();
      } else {
        toast.error(`卸载失败: ${res.error ?? '未知错误'}`);
      }
    } catch (err) {
      toast.error(`卸载失败: ${String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      {/* header — frameless window drag region + window controls */}
      <div
        className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-5 py-3"
        style={{ WebkitAppRegion: 'drag' as string }}
      >
        <div className="flex items-center gap-2.5" style={{ WebkitAppRegion: 'no-drag' as string }}>
          <Package className="size-4.5 text-brand-2" />
          <h2 className="text-[14px] font-semibold tracking-tight">插件管理</h2>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {plugins.length} 个非官方插件
          </Badge>
        </div>
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' as string }}>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setInstallDialog(true)}>
            <Plus className="size-3.5" />
            安装插件
          </Button>
          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={() => window.lx.win.min()}>
            <Minus className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:bg-err/12 hover:text-err" onClick={() => window.close()}>
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* plugin list */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-3xl px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span className="ml-2 text-[13px]">加载中…</span>
            </div>
          ) : plugins.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Package className="size-8 opacity-30" />
              <p className="mt-3 text-[13px]">还没有安装非官方插件</p>
              <p className="mt-1 text-[11px] text-muted-foreground/60">
                点击「安装插件」输入 npm 包名（如 @laoxiao7274/dsh-web-search）
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {plugins.map((p) => (
                <PluginCard
                  key={p.name}
                  plugin={p}
                  busy={busy === p.name}
                  onSelect={() => setSelected(p)}
                  onUninstall={() => void uninstall(p)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* install dialog */}
      <Dialog open={installDialog} onOpenChange={setInstallDialog}>
        <DialogContent className="max-w-md border-sidebar-border bg-surface-1">
          <DialogHeader>
            <DialogTitle className="text-[15px]">安装插件</DialogTitle>
            <DialogDescription className="text-[12px]">
              输入 npm 包名或 tarball 路径，插件将安装到 web profile。
            </DialogDescription>
          </DialogHeader>
          <Input
            value={installName}
            onChange={(e) => setInstallName(e.target.value)}
            placeholder="@scope/dsh-plugin 或 ./plugin.tgz"
            className="font-mono text-[12px]"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && installName.trim()) void install();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setInstallDialog(false)}>
              取消
            </Button>
            <Button size="sm" disabled={!installName.trim()} onClick={() => void install()}>
              安装
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* detail dialog */}
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg border-sidebar-border bg-surface-1">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              {selected?.name}
              <Badge variant="secondary" className="font-mono text-[10px]">v{selected?.version}</Badge>
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              {selected?.description || '无描述'}
            </DialogDescription>
          </DialogHeader>
          {selected?.readme ? (
            <div className="max-h-60 overflow-y-auto rounded-lg bg-code-bg p-3">
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
                {selected.readme}
              </pre>
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground/60">该插件没有 README。</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                if (selected) void uninstall(selected);
                setSelected(null);
              }}
              disabled={busy === selected?.name}
            >
              <Trash2 className="size-3.5" />
              卸载
            </Button>
            <Button size="sm" onClick={() => setSelected(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PluginCard({
  plugin,
  busy,
  onSelect,
  onUninstall,
}: {
  plugin: PluginInfo;
  busy: boolean;
  onSelect: () => void;
  onUninstall: () => void;
}) {
  return (
    <div className="group flex items-start gap-3 rounded-xl border border-sidebar-border bg-surface-1 p-4 transition-colors hover:border-primary/30">
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8">
        <Package className="size-4 text-brand-2" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-foreground">{plugin.name}</span>
          <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">v{plugin.version}</Badge>
          {plugin.source === 'self' ? (
            <Badge className="shrink-0 bg-brand-1/10 text-brand-1 hover:bg-brand-1/10" >
              自制
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 text-muted-foreground">
              第三方
            </Badge>
          )}
        </div>
        {plugin.description ? (
          <p className="mt-1 truncate text-[12px] text-muted-foreground">{plugin.description}</p>
        ) : null}
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
            onClick={onSelect}
          >
            <ExternalLink className="size-3" />
            详情
          </Button>
          <Separator orientation="vertical" className="h-4" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px] text-err hover:bg-err/8 hover:text-err"
            onClick={onUninstall}
            disabled={busy}
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
            卸载
          </Button>
        </div>
      </div>
      <div className="shrink-0">
        <CheckCircle2 className="size-4 text-ok/50" />
      </div>
    </div>
  );
}
