import { useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import type { PledgePhoto, PledgePhotoKind } from '@shared/types'
import { api } from '../../lib/api'
import { localImageSrc } from '../invoices/mapShopDisplay'
import './PledgePhotos.css'

export function PledgePhotosStrip({
  pledgeId,
  photos,
  kind = 'item',
  label,
  editable = false,
  busy = false,
  onChanged,
  onError,
}: {
  pledgeId: number
  photos: PledgePhoto[]
  kind?: PledgePhotoKind
  label: string
  editable?: boolean
  busy?: boolean
  onChanged?: (photos: PledgePhoto[]) => void
  onError?: (message: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [working, setWorking] = useState(false)

  const shown = photos.filter((photo) => photo.kind === kind)
  const disabled = busy || working

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    if (!pledgeId) {
      onError?.('Save the loan before adding photos')
      return
    }
    try {
      setWorking(true)
      onError?.(null)
      for (const file of Array.from(files)) {
        await api.uploadPledgePhoto(pledgeId, kind, file)
      }
      onChanged?.(await api.listPledgePhotos(pledgeId))
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to upload photo')
    } finally {
      setWorking(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function remove(photo: PledgePhoto) {
    try {
      setWorking(true)
      onError?.(null)
      await api.deletePledgePhoto(pledgeId, photo.id)
      onChanged?.(await api.listPledgePhotos(pledgeId))
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to delete photo')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="pledge-photos">
      <div className="pledge-photos-head">
        <span className="pledge-photos-label">{label}</span>
        {editable ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg"
              multiple
              hidden
              onChange={(event) => void addFiles(event.target.files)}
            />
            <button
              type="button"
              className="btn ghost pledge-photos-add"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus size={14} strokeWidth={1.75} aria-hidden />
              {working ? 'Saving…' : 'Add photo'}
            </button>
          </>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="muted pledge-photos-empty">No photos yet.</p>
      ) : (
        <ul className="pledge-photo-strip">
          {shown.map((photo) => (
            <li key={photo.id} className="pledge-photo-thumb">
              <img src={localImageSrc(photo.path, '')} alt={label} />
              {editable ? (
                <button
                  type="button"
                  className="pledge-photo-remove"
                  aria-label="Remove photo"
                  disabled={disabled}
                  onClick={() => void remove(photo)}
                >
                  <Trash2 size={12} strokeWidth={2} aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
