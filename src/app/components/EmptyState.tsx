import { motion } from 'motion/react';
import { Shirt, Plus } from 'lucide-react';

interface EmptyStateProps {
  onAddItem: () => void;
}

export function EmptyState({ onAddItem }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-20 px-6"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', damping: 20 }}
        className="w-32 h-32 rounded-full mx-auto mb-8 flex items-center justify-center"
        style={{
          background: 'rgba(0, 0, 0, 0.05)',
          border: '3px dashed rgba(0, 0, 0, 0.2)'
        }}
      >
        <Shirt className="w-16 h-16 opacity-30" strokeWidth={1.5} />
      </motion.div>

      <h3 className="mb-4" style={{
        fontSize: 'clamp(24px, 4vw, 36px)',
        fontWeight: 900,
        letterSpacing: '-0.01em'
      }}>
        YOUR WARDROBE IS EMPTY
      </h3>

      <p className="mb-8 max-w-[400px] mx-auto" style={{
        fontSize: '15px',
        lineHeight: 1.6,
        fontWeight: 500,
        opacity: 0.7
      }}>
        Start building your digital closet by adding your first clothing item. Take a photo or upload from your device.
      </p>

      <motion.button
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
        onClick={onAddItem}
        className="px-10 py-4 rounded-full text-white inline-flex items-center gap-3 transition-[transform,box-shadow,opacity] duration-200 ease-out"
        style={{
          background: '#000',
          fontSize: '14px',
          fontWeight: 700,
          letterSpacing: '0.05em',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)'
        }}
      >
        <Plus className="w-5 h-5" strokeWidth={2.5} />
        <span>ADD FIRST ITEM</span>
      </motion.button>
    </motion.div>
  );
}
