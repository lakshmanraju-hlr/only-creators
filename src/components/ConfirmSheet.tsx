/**
 * ConfirmSheet — confirmation bottom sheet for destructive actions
 *
 * Usage:
 *   <ConfirmSheet
 *     open={showConfirm}
 *     onClose={() => setShowConfirm(false)}
 *     onConfirm={handleDelete}
 *     title="Delete this post?"
 *     description="This cannot be undone."
 *     confirmLabel="Delete"
 *     loading={deleting}
 *   />
 */
import { AnimatePresence, motion } from 'framer-motion'

interface ConfirmSheetProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description?: string
  confirmLabel?: string
  loading?: boolean
}

export default function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  loading = false,
}: ConfirmSheetProps) {
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
            onClick={onClose}
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
            <div className="flex justify-center pt-3 pb-4">
              <div className="w-9 h-1 rounded-full bg-[#E5E7EB]" />
            </div>

            <div className="px-6 pb-6">
              <p className="text-[17px] font-semibold text-[#111111] mb-1">{title}</p>
              {description && (
                <p className="text-[15px] text-[#6B7280] mb-6">{description}</p>
              )}
              {!description && <div className="mb-6" />}

              <button
                onClick={onConfirm}
                disabled={loading}
                className="w-full h-12 flex items-center justify-center rounded-[8px] text-[15px] font-semibold text-white transition-all disabled:opacity-50 active:scale-[0.97] mb-3"
                style={{ background: '#EF4444' }}
              >
                {loading
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : confirmLabel
                }
              </button>

              <button
                onClick={onClose}
                disabled={loading}
                className="w-full h-12 flex items-center justify-center rounded-[8px] text-[15px] font-semibold text-[#1A1A1A] border border-[#E5E7EB] transition-all disabled:opacity-50 hover:bg-[#F8F8F6]"
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
