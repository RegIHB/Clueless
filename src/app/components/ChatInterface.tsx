import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Sparkles, MapPin, Cloud } from 'lucide-react';
import { buildFallbackSuggestion } from '@/lib/outfit-fallback';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  outfitSuggestion?: {
    tops: string[];
    bottoms: string[];
    accessories: string[];
    reason: string;
  };
}

interface ChatInterfaceProps {
  onClose: () => void;
  location: string;
  weather: { temp: number; condition: string };
}

export function ChatInterface({ onClose, location, weather }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Hey! I'm your AI stylist. Tell me what you're up to today and I'll help you find the perfect outfit. Current weather in ${location}: ${weather.temp}°C, ${weather.condition}.`
    }
  ]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const handleSend = async () => {
    const messageText = input.trim();
    if (!messageText) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsThinking(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          location,
          weather
        })
      });

      if (!response.ok) {
        throw new Error('Chat request failed');
      }

      const payload = await response.json();
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: payload.reply,
        outfitSuggestion: payload.outfitSuggestion
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch {
      const offline = buildFallbackSuggestion(messageText, weather.temp, weather.condition);
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `${offline.reason} (Couldn't reach the server—showing a local suggestion.) The picks below match your message and weather.`,
          outfitSuggestion: offline
        }
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
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
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative max-w-[800px] w-full max-h-[min(85vh,100dvh-2rem)] rounded-3xl overflow-hidden flex flex-col my-auto"
        style={{
          background: '#fff',
          border: '4px solid #000',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b-4 border-black flex items-center justify-between gap-3 shrink-0 min-w-0" style={{
          background: 'linear-gradient(135deg, #FFB3D9 0%, #FFC9E5 100%)'
        }}>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h3 style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '-0.01em' }}>
                AI STYLIST
              </h3>
              <div className="flex items-start gap-2 flex-wrap" style={{ fontSize: '11px', fontWeight: 600, opacity: 0.8 }}>
                <MapPin className="w-3 h-3 shrink-0 mt-0.5" strokeWidth={2.5} />
                <span className="break-words">{location} • {weather.temp}°C {weather.condition}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-200 ease-out hover:scale-110 active:scale-95 shrink-0"
            style={{ background: '#000', color: '#fff' }}
            aria-label="Close stylist"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="4" y1="4" x2="16" y2="16" />
              <line x1="16" y1="4" x2="4" y2="16" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[min(80%,100%)] min-w-0 p-4 rounded-2xl"
                  style={{
                    background: message.role === 'user' ? '#000' : '#FFE5C8',
                    color: message.role === 'user' ? '#fff' : '#000',
                    border: '2px solid #000'
                  }}
                >
                  <p className="break-words whitespace-pre-wrap" style={{ fontSize: '14px', fontWeight: 500, lineHeight: 1.6 }}>
                    {message.content}
                  </p>

                  {/* Outfit Suggestions */}
                  {message.outfitSuggestion && (
                    <div className="mt-4 space-y-3">
                      <div className="p-3 rounded-xl bg-white border-2 border-black">
                        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '8px' }}>
                          RECOMMENDED OUTFIT
                        </div>
                        <div className="space-y-2">
                          <div>
                            <span style={{ fontSize: '9px', fontWeight: 700, opacity: 0.6 }}>TOPS: </span>
                            <span style={{ fontSize: '12px', fontWeight: 600 }}>
                              {message.outfitSuggestion.tops.join(', ')}
                            </span>
                          </div>
                          <div>
                            <span style={{ fontSize: '9px', fontWeight: 700, opacity: 0.6 }}>BOTTOMS: </span>
                            <span style={{ fontSize: '12px', fontWeight: 600 }}>
                              {message.outfitSuggestion.bottoms.join(', ')}
                            </span>
                          </div>
                          {message.outfitSuggestion.accessories.length > 0 && (
                            <div>
                              <span style={{ fontSize: '9px', fontWeight: 700, opacity: 0.6 }}>ACCESSORIES: </span>
                              <span style={{ fontSize: '12px', fontWeight: 600 }}>
                                {message.outfitSuggestion.accessories.join(', ')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}

            {isThinking && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="p-4 rounded-2xl" style={{ background: '#FFE5C8', border: '2px solid #000' }}>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 0.8, delay: 0 }}
                        className="w-2 h-2 rounded-full bg-black"
                      />
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 0.8, delay: 0.2 }}
                        className="w-2 h-2 rounded-full bg-black"
                      />
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 0.8, delay: 0.4 }}
                        className="w-2 h-2 rounded-full bg-black"
                      />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>Styling your look...</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input */}
        <div className="p-4 border-t-4 border-black shrink-0" style={{ background: '#f5f5f5' }}>
          <div className="flex gap-2 sm:gap-3 min-w-0 items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                handleSend();
              }}
              placeholder="E.g., I have work and a date tonight..."
              className="min-w-0 flex-1 px-4 py-3 rounded-full outline-none transition-[box-shadow,border-color] duration-200 ease-out placeholder:text-black/40"
              style={{
                background: '#fff',
                border: '2px solid #000',
                fontSize: '14px',
                fontWeight: 500
              }}
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSend}
              disabled={!input.trim() || isThinking}
              className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-full flex items-center justify-center disabled:opacity-50 disabled:grayscale transition-opacity duration-200 ease-out"
              type="button"
              aria-label="Send message"
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#fff'
              }}
            >
              <Send className="w-5 h-5" strokeWidth={2.5} />
            </motion.button>
          </div>

          {/* Quick Prompts */}
          <div className="mt-3 flex gap-2 flex-wrap">
            {['Work meeting', 'Casual day out', 'Date night', 'Gym & errands'].map((prompt) => (
              <button
                type="button"
                key={prompt}
                onClick={() => setInput(prompt)}
                className="px-3 py-1.5 rounded-full hover:opacity-80 active:opacity-70 transition-opacity duration-200 ease-out"
                style={{
                  background: '#FFE5C8',
                  border: '2px solid #000',
                  fontSize: '11px',
                  fontWeight: 700
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
