/** General Settings row revealing the Host's remote-access connection facts. */
import { useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteAccessState } from './remote-access-store.ts'
import css from './RemoteAccessRow.module.css'

/** Registration-side remote-access face. */
export interface RemoteAccessRowInjected {
  hooks: {
    /** Connection-facts source bound as useRemoteAccess. */
    remoteAccess: SnapshotStore<RemoteAccessState>
  }
  /** Toggle the information area (first reveal loads the facts). */
  toggleRemoteAccess: () => void
}

/** Full Settings-row props. */
export type RemoteAccessRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings'>
  & InjectFace<RemoteAccessRowInjected>/**
 * Render the remote-access row: a reveal switch plus the copyable
 * connection facts (authenticated URL, LAN addresses) it gates.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function RemoteAccessRow({ useRemoteAccess, toggleRemoteAccess, t }: RemoteAccessRowProps) {
  const state = useRemoteAccess(value => value)
  const [copied, setCopied] = useState<string | undefined>(undefined)

  const copy = (text: string, id: string): void => {
    void writeClipboard(text).then((ok) => {
      if (!ok) return
      setCopied(id)
      window.setTimeout(() => { setCopied(current => current === id ? undefined : current) }, 1500)
    })
  }

  return (
    <div className={css.row}>
      <div className={css.head}>
        <div className={css.rowText}>
          <div className={css.title}>{t('remoteAccess.title')}</div>
          <div className={css.desc}>{t('remoteAccess.description')}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={state.revealed}
          aria-label={t('remoteAccess.title')}
          className={state.revealed ? css.switchOn : css.switch}
          onClick={toggleRemoteAccess}
        >
          <span className={css.thumb} />
        </button>
      </div>
      {state.revealed
        ? (
          <div className={css.info}>
            {state.status === 'loading' || state.status === 'idle'
              ? <div className={css.fact}>{t('remoteAccess.loading')}</div>
              : null}
            {state.status === 'unavailable'
              ? <div className={css.fact} role="alert">{t('remoteAccess.unavailable')}</div>
              : null}
            {state.status === 'ready'
              ? (
                <>
                  <div className={css.factRow}>
                    <span className={css.factLabel}>{t('remoteAccess.url')}</span>
                    <code className={css.factValue}>{state.url}</code>
                    <button
                      type="button"
                      className={css.copy}
                      onClick={() => { copy(state.url, 'url') }}
                    >
                      {copied === 'url' ? t('remoteAccess.copied') : t('remoteAccess.copy')}
                    </button>
                  </div>
                  <div className={css.factRow}>
                    <span className={css.factLabel}>{t('remoteAccess.token')}</span>
                    <code className={css.factValue}>{state.token === '' ? '—' : state.token}</code>
                    <button
                      type="button"
                      className={css.copy}
                      onClick={() => { copy(state.token, 'token') }}
                      disabled={state.token === ''}
                    >
                      {copied === 'token' ? t('remoteAccess.copied') : t('remoteAccess.copy')}
                    </button>
                  </div>
                  {state.lanAddresses.map(address => (
                    <div className={css.factRow} key={address}>
                      <span className={css.factLabel}>{t('remoteAccess.lan')}</span>
                      <code className={css.factValue}>{`http://${address}/`}</code>
                      <button
                        type="button"
                        className={css.copy}
                        onClick={() => { copy(`http://${address}/`, address) }}
                      >
                        {copied === address ? t('remoteAccess.copied') : t('remoteAccess.copy')}
                      </button>
                    </div>
                  ))}
                  {state.loopbackOnly
                    ? <div className={css.hint}>{t('remoteAccess.loopbackHint')}</div>
                    : <div className={css.hint}>{t('remoteAccess.exposedHint')}</div>}
                </>
              )
              : null}
          </div>
        )
        : null}
    </div>
  )
}
