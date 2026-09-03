/**
 * Workspace pick/add flow. WorkspacePickFlow is the reusable core (menu +
 * path error dialog) consumed directly by WorkspaceBrowser (same package) and
 * wrapped by WorkspacePicker for the conversation empty-state slot
 * registration. Directory picking itself lives in the composed flow package's
 * slot occupant (see the contract module doc): this core only opens the flow,
 * adopts the picked path, and owns the error surface. Adding a workspace has
 * exactly one route — pick a host directory, new or existing — because the
 * occupant's own create-folder affordance already covers creating one.
 * Connecting a remote backend is navigation, not adoption: the form saves a
 * browser-local bookmark and opens the remote Host's own UI.
 */
import type { ReactNode, RefObject } from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  Button, IconFolderClose16, IconGlobeOutline14, IconPlusOutline16, Input, Menu, Modal,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  WorkspaceId, WorkspaceSnapshot, WorkspaceView,
} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteBookmark, RemoteBookmarkId } from './remote-connections.ts'
import { normalizeRemoteOrigin, remoteBookmarkUrl } from './remote-connections.ts'
import type { DirectoryFlowOwnerProps, WorkspacePickerProps } from './contract/slots.ts'
import css from './WorkspacePicker.module.css'

const ADD_WORKSPACE = '::add-workspace'
const CONNECT_REMOTE = '::connect-remote'
/** Menu-entry prefix separating bookmark rows from real Workspace ids. */
const REMOTE_PREFIX = 'remote:'

/** Core flow props: the owner supplies popover control and pick semantics. */
export interface WorkspacePickFlowProps {
  /** The standard locale seat, forwarded by whichever slot entry hosts the flow. */
  t: WorkspacePickerProps['t']
  /** Popover visibility (anchor button toggle state, owner-local). */
  open: boolean
  /** The anchor button element — the popover's placement anchor. */
  anchorRef?: RefObject<HTMLElement | null> | undefined
  /** Selector hook over the workspace list (framework standard hook). */
  useWorkspaces: <S>(selector: (state: WorkspaceSnapshot) => S) => S
  /** Adopt a picked host directory as a real Workspace. */
  createWorkspace: (input: { path: string }) => Promise<WorkspaceView>
  /** Bound occupancy selector hook for this surface's directory-flow hole (empty leaves the surface with no add action). */
  useDirectoryFlow: SnapshotSelectorHook<boolean>
  /** Render this surface's directory-flow hole with the owner conversation (the entry's narrowed renderSlot). */
  renderDirectoryFlow: (owner: DirectoryFlowOwnerProps) => ReactNode
  /** A real Workspace was picked or created. */
  onPick: (workspaceId: WorkspaceId) => void
  /** Close the popover (outside click / Escape / post-pick). */
  onClose: () => void
  /** Only offer the add action, hide existing workspaces. */
  addOnly?: boolean
  /** Menu opening direction relative to the anchor. */
  side?: 'bottom' | 'top' | 'right'
  /** Currently active workspace (trailing check in the picker list). */
  selectedId?: WorkspaceId | undefined
  /** Selector hook over the saved remote-backend bookmarks (undefined leaves the surface without remote rows). */
  useRemoteConnections?: <S>(selector: (state: { bookmarks: RemoteBookmark[] }) => S) => S
  /** Bookmark write set (save/remove), bound from the declared store. */
  remoteActions?: {
    addBookmark: (bookmark: Omit<RemoteBookmark, 'id' | 'createdAt'>) => void
    removeBookmark: (id: RemoteBookmarkId) => void
  }
}

/**
 * Render the pick menu plus the adoption error dialog.
 * @param props - owner-controlled flow props.
 * @returns menu + dialog elements.
 */
export function WorkspacePickFlow({
  t,
  open,
  anchorRef,
  useWorkspaces,
  createWorkspace,
  useDirectoryFlow,
  renderDirectoryFlow,
  onPick,
  onClose,
  addOnly = false,
  side = 'bottom',
  selectedId,
  useRemoteConnections,
  remoteActions,
}: WorkspacePickFlowProps) {
  const workspaceSnapshot = useWorkspaces(state => state)
  const workspaces = workspaceSnapshot.items
  const bookmarks = useRemoteConnections?.(state => state.bookmarks) ?? []
  const getAnchorRect = useCallback(
    () => anchorRef?.current?.getBoundingClientRect() ?? null,
    [anchorRef],
  )
  const [errorOpen, setErrorOpen] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [flowOpen, setFlowOpen] = useState(false)
  const [pickingFolder, setPickingFolder] = useState(false)
  const [remoteOpen, setRemoteOpen] = useState(false)
  // One picking interaction at a time: while the flow is open (native chooser
  // pending, browse dialog up) or its pick is being adopted, every other
  // menu action stays disabled — a late outcome must not race a concurrent
  // selection or adoption.
  const flowBusy = flowOpen || pickingFolder || remoteOpen

  // The occupied hole gates the picking affordance: with no composed flow the
  // entry simply is not there (the seam's documented no-flow default). The
  // framework-bound hook keeps occupancy live: flow plugins activate (and
  // HMR-reload) independently of this menu's renders.
  const flowAvailable = useDirectoryFlow(occupied => occupied)
  // An occupant that unloads mid-interaction leaves nobody to cancel: an
  // open flow over an empty hole withdraws so the menu actions come back.
  // flowOpen is a dependency because the flow can also OPEN over an already
  // empty hole (Choose again after the occupant unloaded with the error
  // dialog up) — that transition must snap back too, not just occupancy loss.
  useEffect(() => {
    if (flowOpen && !flowAvailable) setFlowOpen(false)
  }, [flowOpen, flowAvailable])
  const addEntries: MenuEntry[] = [
    ...flowAvailable
      ? [{ id: ADD_WORKSPACE, label: t('menu.addWorkspace'), icon: <IconPlusOutline16 size={16} />, disabled: flowBusy }]
      : [],
    { id: CONNECT_REMOTE, label: t('remote.connect'), icon: <IconGlobeOutline14 size={16} />, disabled: flowBusy },
  ]
  // With workspaces listed, the add action pins below the scroll region
  // (divider + always visible); otherwise it IS the menu. Saved remote
  // bookmarks list above the add entries as ordinary menu rows.
  const bookmarkEntries: MenuEntry[] = bookmarks.map(bookmark => ({
    id: `${REMOTE_PREFIX}${bookmark.id}`,
    label: bookmark.title,
    icon: <IconGlobeOutline14 size={16} />,
    disabled: flowBusy,
  }))
  const pinAdd = !addOnly && (workspaces.length > 0 || bookmarkEntries.length > 0)
  const items: MenuEntry[] = pinAdd
    ? [
      ...workspaces.map(workspace => ({
        id: workspace.workspaceId,
        label: workspace.title,
        icon: <IconFolderClose16 size={16} />,
        disabled: flowBusy,
      })),
      ...bookmarkEntries,
    ]
    : addEntries
  // Nothing listed and nothing to add with (a composition that mounts this
  // package without any directory-picker): an empty popover would claim a
  // choice that does not exist, so the anchor gesture shows nothing at all.
  const menuIsEmpty = items.length === 0

  const closeModal = (): void => {
    setErrorOpen(false)
    setModalError(null)
  }

  /** Adopt a picked directory; failures land in the folder-error dialog (Choose again reopens the flow). */
  const adoptDirectory = (path: string): Promise<void> =>
    createWorkspace({ path }).then((workspace) => {
      setFlowOpen(false)
      onPick(workspace.workspaceId)
    }).catch((reason: unknown) => {
      setModalError(reason instanceof Error ? reason.message : String(reason))
      setFlowOpen(false)
      setErrorOpen(true)
    })

  const openDirectoryFlow = useCallback((): void => {
    onClose()
    setErrorOpen(false)
    setModalError(null)
    setFlowOpen(true)
  }, [onClose])

  // A menu exists to disambiguate between targets. With no workspaces listed
  // and the add action the only entry left, the anchor gesture IS that action:
  // a one-row popover would cost a click and offer nothing to choose between.
  // The owner's open request is consumed the same way selecting the entry
  // would consume it (close the popover, raise the flow). An empty list is
  // only final once the baseline lands — until then the menu stays up with its
  // loading status instead of jumping into a flow the arriving list would have
  // made unnecessary; the add-only surface lists nothing and never waits.
  const listSettled = addOnly || workspaceSnapshot.phase === 'ready'
  // The collapse-into-add gesture requires the directory flow to actually be
  // there: without an occupant the only entry is the remote connect, which
  // must stay a menu choice rather than an auto-action (and the auto-open
  // would fight the flow-availability withdrawal below in a render loop).
  const addIsTheOnlyEntry = !pinAdd && listSettled && flowAvailable && addEntries.length === 1
  // `flowBusy` gates this exactly as it disables the equivalent menu entry: a
  // pick still being adopted owns the surface until it settles.
  useEffect(() => {
    if (open && addIsTheOnlyEntry && !flowBusy) openDirectoryFlow()
  }, [open, addIsTheOnlyEntry, flowBusy, openDirectoryFlow])

  /** Owner side of the flow conversation: adopt keeps the flow open (busy) until the Host answers. */
  const flowOwner: DirectoryFlowOwnerProps = {
    open: flowOpen,
    busy: pickingFolder,
    onPicked: (path) => {
      setPickingFolder(true)
      void adoptDirectory(path).finally(() => { setPickingFolder(false) })
    },
    onCancel: () => { setFlowOpen(false) },
    onError: (message) => {
      setFlowOpen(false)
      setModalError(message)
      setErrorOpen(true)
    },
  }

  const handleSelect = (id: string): void => {
    if (id === ADD_WORKSPACE) {
      openDirectoryFlow()
      return
    }
    if (id === CONNECT_REMOTE) {
      onClose()
      setRemoteOpen(true)
      return
    }
    if (id.startsWith(REMOTE_PREFIX)) {
      const bookmark = bookmarks.find(
        candidate => `${REMOTE_PREFIX}${candidate.id}` === id,
      )
      if (bookmark !== undefined) {
        onClose()
        window.open(remoteBookmarkUrl(bookmark), '_blank', 'noopener')
      }
      return
    }
    onPick(id as WorkspaceId)
  }

  return (
    <>
      <Menu
        open={open && !addIsTheOnlyEntry && !menuIsEmpty}
        anchor={null}
        items={items}
        {...pinAdd ? { footer: addEntries } : {}}
        selectedId={selectedId}
        onSelect={handleSelect}
        onClose={onClose}
        side={side}
        portal
        getAnchorRect={getAnchorRect}
      />
      {open && !addIsTheOnlyEntry && !menuIsEmpty && workspaceSnapshot.phase === 'pending' && <div className={css.menuStatus} role="status">{t('picker.loading')}</div>}
      {renderDirectoryFlow(flowOwner)}
      <RemoteConnectModal
        open={remoteOpen}
        t={t}
        bookmarks={bookmarks}
        onClose={() => { setRemoteOpen(false) }}
        onSave={(bookmark) => {
          remoteActions?.addBookmark(bookmark)
          setRemoteOpen(false)
          const root = bookmark.token === '' ? bookmark.origin : `${bookmark.origin}/`
          window.open(
            bookmark.token === '' ? root : `${root}?token=${encodeURIComponent(bookmark.token)}`,
            '_blank',
            'noopener',
          )
        }}
        onRemove={(id) => { remoteActions?.removeBookmark(id) }}
      />
      <Modal
        open={errorOpen}
        onClose={closeModal}
        closeLabel={t('close')}
        title={t('folderError.title')}
        footer={(
          <>
            <Button variant="outline" className={css.modalAction} onClick={closeModal}>{t('cancel')}</Button>
            {/* Retrying needs an occupant to serve the flow; without one the
              * button would open a flow nobody can answer or cancel. */}
            <Button variant="primary" className={css.modalAction} disabled={!flowAvailable} onClick={openDirectoryFlow}>{t('folderError.retry')}</Button>
          </>
        )}
      >
        <div className={css.modalError} role="alert">{modalError}</div>
      </Modal>
    </>
  )
}

/**
 * The conversation empty-state registration: adapts the owner share to the
 * core flow (all state and semantics live in the flow / the owner).
 * @param props - empty-state slot props (owner share + injected creation callback).
 * @returns the flow element.
 */
export function WorkspacePicker({
  open,
  anchorRef,
  useWorkspaces,
  selectedId,
  onPick,
  onClose,
  createWorkspace,
  useDirectoryFlow,
  useStore,
  actions,
  renderSlot,
  t,
}: WorkspacePickerProps) {
  return (
    <WorkspacePickFlow
      t={t}
      open={open}
      anchorRef={anchorRef}
      useWorkspaces={useWorkspaces}
      createWorkspace={createWorkspace}
      useDirectoryFlow={useDirectoryFlow}
      renderDirectoryFlow={owner => renderSlot('conversation.hero.workspace.directoryFlow', owner)}
      selectedId={selectedId}
      onPick={onPick}
      onClose={onClose}
      useRemoteConnections={useStore}
      remoteActions={actions}
    />
  )
}

/** Remote-connection modal props: the form and the bookmark management list. */
export interface RemoteConnectModalProps {
  /** Modal visibility. */
  open: boolean
  /** The standard locale seat. */
  t: WorkspacePickerProps['t']
  /** Saved bookmarks rendered as a removable management list. */
  bookmarks: readonly RemoteBookmark[]
  /** Close without saving. */
  onClose: () => void
  /** Save one bookmark (the caller opens it afterwards). */
  onSave: (bookmark: Omit<RemoteBookmark, 'id' | 'createdAt'>) => void
  /** Remove one saved bookmark. */
  onRemove: (id: RemoteBookmarkId) => void
}

/**
 * Render the remote-backend connect form: name, address, optional token,
 * plus the removable list of saved bookmarks.
 * @param props - modal props.
 * @returns the modal element.
 */
export function RemoteConnectModal({ open, t, bookmarks, onClose, onSave, onRemove }: RemoteConnectModalProps) {
  const [title, setTitle] = useState('')
  const [address, setAddress] = useState('')
  const [token, setToken] = useState('')
  const [invalid, setInvalid] = useState(false)

  const submit = (): void => {
    const origin = normalizeRemoteOrigin(address)
    if (origin === undefined) {
      setInvalid(true)
      return
    }
    const name = title.trim() === '' ? address.trim() : title.trim()
    onSave({ title: name, origin, token: token.trim() })
    setTitle('')
    setAddress('')
    setToken('')
    setInvalid(false)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeLabel={t('close')}
      title={t('remote.title')}
      footer={(
        <>
          <Button variant="outline" className={css.modalAction} onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" className={css.modalAction} onClick={submit}>{t('remote.save')}</Button>
        </>
      )}
    >
      <div className={css.remoteForm}>
        <p className={css.remoteDesc}>{t('remote.desc')}</p>
        <label className={css.remoteField}>
          <span>{t('remote.name')}</span>
          <Input
            value={title}
            placeholder={t('remote.name.placeholder')}
            onChange={event => { setTitle(event.target.value) }}
          />
        </label>
        <label className={css.remoteField}>
          <span>{t('remote.address')}</span>
          <Input
            value={address}
            placeholder={t('remote.address.placeholder')}
            onChange={event => { setAddress(event.target.value); setInvalid(false) }}
          />
        </label>
        <label className={css.remoteField}>
          <span>{t('remote.token')}</span>
          <Input
            value={token}
            placeholder={t('remote.token.placeholder')}
            onChange={event => { setToken(event.target.value) }}
          />
        </label>
        {invalid ? <div className={css.remoteInvalid} role="alert">{t('remote.invalid')}</div> : null}
        {bookmarks.length > 0
          ? (
            <div className={css.remoteList}>
              {bookmarks.map(bookmark => (
                <div className={css.remoteRow} key={bookmark.id}>
                  <IconGlobeOutline14 size={16} className={css.remoteRowIcon} />
                  <span className={css.remoteRowTitle}>{bookmark.title}</span>
                  <span className={css.remoteRowOrigin}>{bookmark.origin}</span>
                  <button
                    type="button"
                    className={css.remoteRemove}
                    onClick={() => { onRemove(bookmark.id) }}
                  >
                    {t('remote.remove')}
                  </button>
                </div>
              ))}
            </div>
          )
          : <p className={css.remoteEmpty}>{t('remote.empty')}</p>}
      </div>
    </Modal>
  )
}
