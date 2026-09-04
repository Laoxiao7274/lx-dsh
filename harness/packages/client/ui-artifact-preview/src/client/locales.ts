/** `artifactPreview` namespace dictionaries. */
import type { ArtifactKind } from './classify.ts'

export const NS = 'artifactPreview'

/** Dictionary key union for the artifact-preview namespace. */
export type ArtifactPreviewKey =
  | 'row.label' | 'row.mediaCount' | 'row.fileCount'
  | 'panel.title' | 'panel.close' | 'panel.collapse' | 'panel.reload' | 'panel.external'
  | 'panel.back' | 'panel.forward'
  | 'tab.close'
  | 'view.copy' | 'view.copied' | 'view.footnotes'
  | 'status.loading' | 'status.ready.text' | 'status.ready.bytes' | 'status.error' | 'status.fallback'
  | 'state.empty.title' | 'state.empty.body'
  | 'state.error.title' | 'state.error.body' | 'state.error.retry' | 'state.error.locate'
  | 'state.binary.title' | 'state.binary.body' | 'state.binary.open' | 'state.binary.copyPath'
  | 'state.tooLarge.title' | 'state.tooLarge.body'
  | 'view.openOriginal' | 'view.openSystemPlayer' | 'view.webExternal'
  | `kind.${ArtifactKind}`

const KIND_LABELS_ZH: Record<ArtifactKind, string> = {
  markdown: '文档', code: '代码', csv: '表格', json: 'JSON',
  image: '图片', video: '视频', audio: '音频',
  web: '网页', binary: '文件',
}

const KIND_LABELS_EN: Record<ArtifactKind, string> = {
  markdown: 'Doc', code: 'Code', csv: 'Table', json: 'JSON',
  image: 'Image', video: 'Video', audio: 'Audio',
  web: 'Web', binary: 'File',
}

/** Chinese dictionary. */
export const zh: Record<ArtifactPreviewKey, string> = {
  'row.label': '产物',
  'row.mediaCount': '媒体',
  'row.fileCount': '文件',
  'panel.title': '产物预览',
  'panel.close': '关闭预览',
  'panel.collapse': '收缩面板',
  'panel.reload': '重新读取',
  'panel.external': '在系统应用打开',
  'panel.back': '后退',
  'panel.forward': '前进',
  'tab.close': '关闭标签',
  'view.copy': '复制',
  'view.copied': '已复制',
  'view.footnotes': '脚注',
  'status.loading': '读取中',
  'status.ready.text': '已渲染',
  'status.ready.bytes': '已就绪',
  'status.error': '读取失败',
  'status.fallback': '回退',
  'state.empty.title': '没有打开的预览',
  'state.empty.body': '点击对话里的产物卡片，可以在这里并开多个标签页。',
  'state.error.title': '文件已不存在或无权访问',
  'state.error.body': '产物路径是写入时的快照，文件可能被移动或删除。',
  'state.error.retry': '重新读取',
  'state.error.locate': '在文件夹中定位',
  'state.binary.title': '二进制文件，不适合预览',
  'state.binary.body': '这类产物交给系统应用打开更可靠。',
  'state.binary.open': '在系统默认应用打开',
  'state.binary.copyPath': '复制路径',
  'state.tooLarge.title': '文件超出预览上限',
  'state.tooLarge.body': '这个文件超过了预览读取的大小上限。',
  'view.openOriginal': '查看原图',
  'view.openSystemPlayer': '用系统播放器打开',
  'view.webExternal': '外部链接用系统浏览器打开',
  ...Object.fromEntries(
    (Object.keys(KIND_LABELS_ZH) as ArtifactKind[]).map(kind => [`kind.${kind}`, KIND_LABELS_ZH[kind]]),
  ) as Record<`kind.${ArtifactKind}`, string>,
}

/** English dictionary. */
export const en: Record<ArtifactPreviewKey, string> = {
  'row.label': 'Produced',
  'row.mediaCount': 'media',
  'row.fileCount': 'files',
  'panel.title': 'Artifact preview',
  'panel.close': 'Close preview',
  'panel.collapse': 'Collapse panel',
  'panel.reload': 'Reload',
  'panel.external': 'Open in system app',
  'panel.back': 'Back',
  'panel.forward': 'Forward',
  'tab.close': 'Close tab',
  'view.copy': 'Copy',
  'view.copied': 'Copied',
  'view.footnotes': 'Footnotes',
  'status.loading': 'Reading',
  'status.ready.text': 'Rendered',
  'status.ready.bytes': 'Ready',
  'status.error': 'Read failed',
  'status.fallback': 'Fallback',
  'state.empty.title': 'No preview open',
  'state.empty.body': 'Click an artifact in the conversation to open it here in tabs.',
  'state.error.title': 'File no longer exists or is unreadable',
  'state.error.body': 'The produced path is a snapshot from write time; the file may have moved.',
  'state.error.retry': 'Retry',
  'state.error.locate': 'Locate in folder',
  'state.binary.title': 'Binary file, not previewable',
  'state.binary.body': 'This artifact is more reliably opened by its system application.',
  'state.binary.open': 'Open with system default app',
  'state.binary.copyPath': 'Copy path',
  'state.tooLarge.title': 'File exceeds the preview cap',
  'state.tooLarge.body': 'This file is above the size limit for preview reads.',
  'view.openOriginal': 'View original',
  'view.openSystemPlayer': 'Open in system player',
  'view.webExternal': 'External links open in the system browser',
  ...Object.fromEntries(
    (Object.keys(KIND_LABELS_EN) as ArtifactKind[]).map(kind => [`kind.${kind}`, KIND_LABELS_EN[kind]]),
  ) as Record<`kind.${ArtifactKind}`, string>,
}
