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
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative max-w-[800px] w-full rounded-3xl overflow-hidden"
        style={{
          background: '#fff',
          border: '4px solid #000',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)',
          maxHeight: '85vh'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b-3 border-black flex items-center justify-between" style={{
          background: 'linear-gradient(135deg, #FFB3D9 0%, #FFC9E5 100%)'
        }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '-0.01em' }}>
                AI STYLIST
              </h3>
              <div className="flex items-center gap-2" style={{ fontSize: '11px', fontWeight: 600, opacity: 0.8 }}>
                <MapPin className="w-3 h-3" strokeWidth={2.5} />
                {location} • {weather.temp}°C {weather.condition}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-110"
            style={{ background: '#000', color: '#fff' }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="4" y1="4" x2="16" y2="16" />
              <line x1="16" y1="4" x2="4" y2="16" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="overflow-y-auto p-6 space-y-4" style={{ maxHeight: 'calc(85vh - 200px)' }}>
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
                  className="max-w-[80%] p-4 rounded-2xl"
                  style={{
                    background: message.role === 'user' ? '#000' : '#FFE5C8',
                    color: message.role === 'user' ? '#fff' : '#000',
                    border: '2px solid #000'
                  }}
                >
                  <p style={{ fontSize: '14px', fontWeight: 500, lineHeight: 1.6 }}>
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
        <div className="p-4 border-t-3 border-black" style={{ background: '#f5f5f5' }}>
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="E.g., I have work and a date tonight..."
              className="flex-1 px-4 py-3 rounded-full outline-none"
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
              className="w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-50"
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
                key={prompt}
                onClick={() => setInput(prompt)}
                className="px-3 py-1.5 rounded-full hover:opacity-80 transition-opacity"
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
