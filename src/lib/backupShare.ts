import { backupFilename, type BackupFile } from './backup'

export function backupToFile(data: BackupFile): File {
  return new File([JSON.stringify(data)], backupFilename(data.exportedAt), { type: 'application/json' })
}

export interface ShareDeps {
  canShareFiles(file: File): boolean
  share(file: File): Promise<void>
  download(file: File): void
}

export type DeliverOutcome = 'shared' | 'downloaded' | 'cancelled'

/** iOS：分享面板 → 存储到文件（iCloud Drive）；桌面或不支持时下载 */
export async function deliverBackup(file: File, deps: ShareDeps): Promise<DeliverOutcome> {
  if (deps.canShareFiles(file)) {
    try {
      await deps.share(file)
      return 'shared'
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return 'cancelled'
    }
  }
  deps.download(file)
  return 'downloaded'
}

export function browserShareDeps(): ShareDeps {
  return {
    canShareFiles: (file) => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }),
    share: (file) => navigator.share({ files: [file], title: 'Mnemo 备份' }),
    download: (file) => {
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    },
  }
}

export async function readBackupFile(file: File): Promise<unknown> {
  const text = await file.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('不是有效的备份文件')
  }
}
