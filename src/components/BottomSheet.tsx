/**
 * BottomSheet — reusable slide-up overlay sheet
 *
 * Usage:
 *   <BottomSheet open={show} onClose={() => setShow(false)}>
 *     <SheetRow icon={<Icon.Trash />} label="Delete" danger onClick={...} />
 *     <SheetCancel onClose={() => setShow(false)} />
 *   </BottomSheet>
 */
import { AnimatePresence, motion } from 'framer-motion'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
}

export default function BottomSheet({ open, onClose, children, title }: BottomSheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 z-[800]"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[801]"
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
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full bg-[#E5E7EB]" />
            </div>

            {title && (
              <div className="px-4 pb-2 pt-1">
                <p className="text-[17px] font-semibold text-[#111111]">{title}</p>
              </div>
            )}

            <div className="px-2 pb-2">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Row within a sheet ─────────────────────────────────────────
export function SheetRow({
  icon,
  label,
  danger = false,
  onClick,
  disabled = false,
}: {
  icon?: React.ReactNode
  label: string
  danger?: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 rounded-[8px] transition-colors text-left disabled:opacity-40"
      style={{
        height: 48,
        color: danger ? '#EF4444' : '#1A1A1A',
        fontSize: 15,
        fontWeight: 400,
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = '#F8F8F6' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
    >
      {icon && <span className="flex w-5 h-5 shrink-0">{icon}</span>}
      {label}
    </button>
  )
}

// ── Cancel row ─────────────────────────────────────────────────
export function SheetCancel({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="h-px bg-[#E5E7EB] mx-2 my-1" />
      <button
        onClick={onClose}
        className="w-full flex items-center justify-center rounded-[8px] transition-colors"
        style={{ height: 48, color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F8F8F6' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
      >
        Cancel
      </button>
    </>
  )
}
