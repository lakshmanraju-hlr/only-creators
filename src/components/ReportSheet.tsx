/**
 * ReportSheet — report flow bottom sheet
 *
 * Usage:
 *   <ReportSheet
 *     open={showReport}
 *     onClose={() => setShowReport(false)}
 *     targetType="post"
 *     targetId={post.id}
 *   />
 */
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'

type TargetType = 'post' | 'comment' | 'profile' | 'group' | 'field' | 'conversation'

type ReasonKey =
  | 'spam_or_misleading'
  | 'inappropriate_content'
  | 'harassment_or_bullying'
  | 'off_topic'
  | 'intellectual_property'
  | 'other'

const REASONS: { key: ReasonKey; label: string }[] = [
  { key: 'spam_or_misleading',    label: 'Spam or misleading' },
  { key: 'inappropriate_content', label: 'Inappropriate content' },
  { key: 'harassment_or_bullying',label: 'Harassment or bullying' },
  { key: 'off_topic',             label: 'Off-topic for this Field or Group' },
  { key: 'intellectual_property', label: 'Intellectual property violation' },
  { key: 'other',                 label: 'Other' },
]

interface ReportSheetProps {
  open: boolean
  onClose: () => void
  targetType: TargetType
  targetId: string
}

export default function ReportSheet({ open, onClose, targetType, targetId }: ReportSheetProps) {
  const { profile } = useAuth()
  const [selected, setSelected] = useState<ReasonKey | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!selected || !profile) return
    setSubmitting(true)
    try {
      await supabase.from('reports').insert({
        reporter_id: profile.id,
        target_type: targetType,
        target_id:   targetId,
        reason:      selected,
        status:      'pending',
      })
      toast.success("Report submitted. We'll review it shortly.")
      onClose()
      setSelected(null)
    } catch {
      toast.error('Failed to submit report. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleClose() {
    onClose()
    setSelected(null)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[900]"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={handleClose}
          />

          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[901]"
            style={{
              background: '#FFFFFF',
              borderRadius: '16px 16px 0 0',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            {/* Drag indicator */}
            <div className="flex justify-center pt-3">
              <div className="w-9 h-1 rounded-full bg-[#E5E7EB]" />
            </div>

            <div className="px-6 pt-4 pb-2">
              <p className="text-[17px] font-semibold text-[#111111] mb-4">
                Why are you reporting this?
              </p>

              <div className="space-y-1 mb-6">
                {REASONS.map(r => (
                  <button
                    key={r.key}
                    onClick={() => setSelected(r.key)}
                    className="w-full flex items-center gap-3 px-4 h-12 rounded-[8px] text-left transition-colors"
                    style={{
                      background: selected === r.key ? '#EFF6FF' : 'transparent',
                      color: selected === r.key ? '#2563EB' : '#1A1A1A',
                    }}
                    onMouseEnter={e => { if (selected !== r.key) (e.currentTarget as HTMLButtonElement).style.background = '#F8F8F6' }}
                    onMouseLeave={e => { if (selected !== r.key) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    {/* Radio indicator */}
                    <span
                      className="flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
                      style={{
                        borderColor: selected === r.key ? '#2563EB' : '#D1D5DB',
                      }}
                    >
                      {selected === r.key && (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" />
                      )}
                    </span>
                    <span className="text-[15px]">{r.label}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={handleSubmit}
                disabled={!selected || submitting}
                className="w-full h-12 flex items-center justify-center rounded-[8px] text-[15px] font-semibold text-white transition-all disabled:opacity-40 active:scale-[0.97] mb-3"
                style={{ background: '#1A1A1A' }}
              >
                {submitting
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : 'Submit Report'
                }
              </button>

              <button
                onClick={handleClose}
                className="w-full h-12 flex items-center justify-center rounded-[8px] text-[15px] font-semibold text-[#6B7280] transition-all hover:bg-[#F8F8F6] mb-2"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
