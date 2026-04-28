import { useState } from 'react';
import { motion } from 'motion/react';
import { Camera, Upload, X, Check } from 'lucide-react';
import Image from 'next/image';

interface SelfieUploadProps {
  onClose: () => void;
  onUpload: (imageUrl: string) => void;
}

export function SelfieUpload({ onClose, onUpload }: SelfieUploadProps) {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setUploadedImage(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirm = () => {
    if (uploadedImage) {
      setIsUploading(true);
      setTimeout(() => {
        onUpload(uploadedImage);
        setIsUploading(false);
      }, 1000);
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
          background: 'linear-gradient(135deg, #FFB3D9 0%, #FFC9E5 100%)'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-0.01em' }}>
            UPLOAD YOUR PHOTO
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
          {!uploadedImage ? (
            <div className="space-y-6">
              <p style={{ fontSize: '15px', fontWeight: 500, lineHeight: 1.6, marginBottom: '24px' }}>
                Upload a full-body photo of yourself to see how clothes will look on you. For best results, stand straight and wear fitted clothing.
              </p>

              <label
                className="w-full p-8 rounded-2xl text-center cursor-pointer hover:scale-[1.02] transition-transform border-3 border-dashed border-black/20 hover:border-black/40"
                style={{
                  background: '#FFE5F1',
                  display: 'block'
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Camera className="w-12 h-12 mx-auto mb-4 opacity-60" strokeWidth={1.5} />
                <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
                  Choose Photo
                </div>
                <div style={{ fontSize: '14px', fontWeight: 500, opacity: 0.7 }}>
                  Click to select from your device
                </div>
              </label>

              <div className="p-4 rounded-xl" style={{
                background: '#FFE5C8',
                border: '2px solid #000'
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '8px' }}>
                  💡 TIPS FOR BEST RESULTS
                </div>
                <ul className="space-y-1" style={{ fontSize: '12px', fontWeight: 500, lineHeight: 1.6 }}>
                  <li>• Stand straight with arms at your sides</li>
                  <li>• Use good lighting</li>
                  <li>• Wear fitted or minimal clothing</li>
                  <li>• Full body should be visible</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="aspect-[3/4] rounded-2xl overflow-hidden" style={{
                background: '#f5f5f5',
                border: '3px solid #000'
              }}>
                <Image
                  src={uploadedImage}
                  alt="Your photo"
                  fill
                  unoptimized
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setUploadedImage(null)}
                  className="flex-1 px-6 py-3 rounded-full"
                  style={{
                    background: '#f5f5f5',
                    border: '2px solid #000',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.05em'
                  }}
                >
                  CHANGE PHOTO
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isUploading}
                  className="flex-1 px-6 py-3 rounded-full text-white disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.05em'
                  }}
                >
                  {isUploading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                      />
                      UPLOADING...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" strokeWidth={2.5} />
                      USE THIS PHOTO
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
