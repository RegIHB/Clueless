import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Upload, Sparkles, Check } from 'lucide-react';

interface OnboardingFlowProps {
  onComplete: () => void;
  userName: string;
}

export function OnboardingFlow({ onComplete, userName }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: `Welcome, ${userName}!`,
      subtitle: 'Let\'s set up your digital wardrobe',
      description: 'Clueless helps you create outfits from clothes you already own.',
      action: 'Get Started',
      icon: <Sparkles className="w-12 h-12" strokeWidth={1.5} />
    },
    {
      title: 'Add Your Clothes',
      subtitle: 'Build your wardrobe catalog',
      description: 'Take photos or upload images of your clothing items. We\'ll organize everything for you.',
      action: 'I Understand',
      icon: <Camera className="w-12 h-12" strokeWidth={1.5} />
    },
    {
      title: 'Get AI Recommendations',
      subtitle: 'Smart outfit suggestions',
      description: 'Tell us your plans and we\'ll suggest perfect outfits based on weather, occasion, and your style.',
      action: 'Start Using Clueless',
      icon: <Check className="w-12 h-12" strokeWidth={1.5} />
    }
  ];

  const currentStep = steps[step];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-6"
      style={{
        background: 'linear-gradient(180deg, #FFB3D9 0%, #FFC9E5 50%, #FFE5F1 100%)'
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-[600px] w-full"
      >
        <div className="text-center mb-12">
          <motion.div
            key={step}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 20 }}
            className="w-24 h-24 rounded-full mx-auto mb-8 flex items-center justify-center"
            style={{
              background: '#000',
              color: '#fff'
            }}
          >
            {currentStep.icon}
          </motion.div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <h1 className="mb-4 px-2 break-words" style={{
                fontSize: 'clamp(36px, 6vw, 56px)',
                fontWeight: 900,
                lineHeight: 1,
                letterSpacing: '-0.02em'
              }}>
                {currentStep.title}
              </h1>
              <p className="mb-3" style={{
                fontSize: '20px',
                fontWeight: 700,
                letterSpacing: '0.02em'
              }}>
                {currentStep.subtitle}
              </p>
              <p className="max-w-[500px] mx-auto" style={{
                fontSize: '16px',
                fontWeight: 500,
                lineHeight: 1.6,
                opacity: 0.8
              }}>
                {currentStep.description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Progress Indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((_, idx) => (
            <div
              key={idx}
              className="h-2 rounded-full transition-[width,background-color] duration-300 ease-out"
              style={{
                width: idx === step ? '40px' : '8px',
                background: idx === step ? '#000' : 'rgba(0, 0, 0, 0.2)'
              }}
            />
          ))}
        </div>

        <div className="flex items-center justify-center gap-4">
          {step > 0 && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setStep(step - 1)}
              className="px-8 py-4 rounded-full"
              style={{
                background: 'rgba(255, 255, 255, 0.8)',
                border: '2px solid #000',
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '0.05em'
              }}
            >
              BACK
            </motion.button>
          )}

          <motion.button
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleNext}
            className="px-10 py-4 rounded-full text-white"
            style={{
              background: '#000',
              fontSize: '14px',
              fontWeight: 700,
              letterSpacing: '0.05em',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
            }}
          >
            {currentStep.action.toUpperCase()}
          </motion.button>
        </div>

        <button
          onClick={onComplete}
          type="button"
          className="mt-8 w-full text-center hover:opacity-60 active:opacity-50 transition-opacity duration-200 ease-out rounded-sm"
          style={{
            fontSize: '12px',
            fontWeight: 600,
            opacity: 0.6
          }}
        >
          Skip onboarding
        </button>
      </motion.div>
    </motion.div>
  );
}
