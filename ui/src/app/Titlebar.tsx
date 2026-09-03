// Brand mark shared by the startup shell and plugin window. The titlebar
// itself is gone — the frameless window's chrome lives in the dsh web UI's
// Session Header (harness/packages/client/ui-lx-shell).
import logoUrl from '@/assets/lx-logo.png';

// Brand mark: the lx-code logo (rounded square, pre-baked in ui/src/assets).
export function BrandMark({ className }: { className?: string }) {
  return <img src={logoUrl} className={className} alt="" draggable={false} />;
}
