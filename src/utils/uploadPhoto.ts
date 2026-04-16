import imageCompression from 'browser-image-compression'
import { supabase } from '@/lib/supabase'

export async function uploadPhoto(
  file: File,
  bucket: string,
  fileName: string
): Promise<{ thumbUrl: string; displayUrl: string }> {
  const thumbFile = await imageCompression(file, {
    maxSizeMB: 0.1,
    maxWidthOrHeight: 400,
    useWebWorker: true,
  })

  const displayFile = await imageCompression(file, {
    maxSizeMB: 0.5,
    maxWidthOrHeight: 1080,
    useWebWorker: true,
  })

  const ext = file.name.split('.').pop()

  const thumbPath = `thumbs/${fileName}.${ext}`
  const displayPath = `display/${fileName}.${ext}`

  const { error: thumbError } = await supabase.storage
    .from(bucket)
    .upload(thumbPath, thumbFile, { cacheControl: '31536000', upsert: true })
  if (thumbError) throw new Error('Thumb upload failed: ' + thumbError.message)

  const { error: displayError } = await supabase.storage
    .from(bucket)
    .upload(displayPath, displayFile, { cacheControl: '31536000', upsert: true })
  if (displayError) throw new Error('Display upload failed: ' + displayError.message)

  const { data: thumbData } = supabase.storage.from(bucket).getPublicUrl(thumbPath)
  const { data: displayData } = supabase.storage.from(bucket).getPublicUrl(displayPath)

  return {
    thumbUrl: thumbData.publicUrl,
    displayUrl: displayData.publicUrl,
  }
}
