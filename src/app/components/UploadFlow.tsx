import { useState } from 'react';
import { motion } from 'motion/react';
import { Camera, Upload, X, Check } from 'lucide-react';

interface UploadFlowProps {
  onClose: () => void;
  onUpload: (item: { type: string; category: string }) => void;
}

export function UploadFlow({ onClose, onUpload }: UploadFlowProps) {
  const [step, setStep] = useState<'method' | 'details' | 'success'>('method');
  const [selectedCategory, setSelectedCategory] = useState<'tops' | 'bottoms' | 'accessories'>('tops');
  const [selectedType, setSelectedType] = useState('');

  const categories = {
    tops: ['Top', 'Dress', 'Turtleneck', 'Sweater', 'Jacket', 'Coat', 'Bodysuit'],
    bottoms: ['Pants', 'Shorts', 'Skirt'],
    accessories: ['Hat', 'Scarf', 'Belt', 'Bag']
  };

  const handleUpload = () => {
    if (selectedType) {
      onUpload({ type: selectedType, category: selectedCategory });
      setStep('success');
      setTimeout(() => {
        onClose();
      }, 1500);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)'
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="max-w-[600px] w-full rounded-3xl overflow-hidden"
        style={{
          background: '#fff',
          border: '4px solid #000',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b-3 border-black flex items-center justify-between" style={{
          background: 'linear-gradient(135deg, #FFE5C8 0%, #FFD4B8 100%)'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-0.01em' }}>
            ADD TO WARDROBE
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-110"
            style={{ background: '#000', color: '#fff' }}
          >
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>

        <div className="p-8">
          {step === 'method' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <p style={{ fontSize: '15px', fontWeight: 500, lineHeight: 1.6, marginBottom: '24px' }}>
                Choose how you'd like to add your clothing item:
              </p>

              <button
                onClick={() => setStep('details')}
                className="w-full p-6 rounded-2xl text-left hover:scale-[1.02] transition-transform"
                style={{
                  background: '#FFE5F1',
                  border: '3px solid #000',
                  boxShadow: '4px 4px 0 #000'
                }}
              >
                <Camera className="w-8 h-8 mb-3" strokeWidth={2} />
                <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
                  Take Photo
                </div>
                <div style={{ fontSize: '14px', fontWeight: 500, opacity: 0.7 }}>
                  Use your camera to capture the item
                </div>
              </button>

              <button
                onClick={() => setStep('details')}
                className="w-full p-6 rounded-2xl text-left hover:scale-[1.02] transition-transform"
                style={{
                  background: '#FFE5C8',
                  border: '3px solid #000',
                  boxShadow: '4px 4px 0 #000'
                }}
              >
                <Upload className="w-8 h-8 mb-3" strokeWidth={2} />
                <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
                  Upload Image
                </div>
                <div style={{ fontSize: '14px', fontWeight: 500, opacity: 0.7 }}>
                  Select a photo from your device
                </div>
              </button>
            </motion.div>
          )}

          {step === 'details' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', display: 'block', marginBottom: '12px' }}>
                  CATEGORY
                </label>
                <div className="flex gap-2">
                  {(['tops', 'bottoms', 'accessories'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        setSelectedCategory(cat);
                        setSelectedType('');
                      }}
                      className="flex-1 px-4 py-3 rounded-full transition-all"
                      style={{
                        background: selectedCategory === cat ? '#000' : '#f5f5f5',
                        color: selectedCategory === cat ? '#fff' : '#000',
                        border: '2px solid #000',
                        fontSize: '12px',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase'
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', display: 'block', marginBottom: '12px' }}>
                  TYPE
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {categories[selectedCategory].map((type) => (
                    <button
                      key={type}
                      onClick={() => setSelectedType(type)}
                      className="px-4 py-3 rounded-xl text-left transition-all"
                      style={{
                        background: selectedType === type ? '#FFE5F1' : '#fff',
                        border: selectedType === type ? '3px solid #000' : '2px solid rgba(0, 0, 0, 0.1)',
                        fontSize: '14px',
                        fontWeight: 600
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setStep('method')}
                  className="flex-1 px-6 py-3 rounded-full"
                  style={{
                    background: '#f5f5f5',
                    border: '2px solid #000',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.05em'
                  }}
                >
                  BACK
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!selectedType}
                  className="flex-1 px-6 py-3 rounded-full text-white disabled:opacity-50"
                  style={{
                    background: '#000',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.05em'
                  }}
                >
                  ADD ITEM
                </button>
              </div>
            </motion.div>
          )}

          {step === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-8"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 15 }}
                className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#fff'
                }}
              >
                <Check className="w-10 h-10" strokeWidth={3} />
              </motion.div>
              <h3 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '8px' }}>
                Item Added!
              </h3>
              <p style={{ fontSize: '14px', fontWeight: 500, opacity: 0.7 }}>
                {selectedType} added to your wardrobe
              </p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
