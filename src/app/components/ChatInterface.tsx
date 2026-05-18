'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';
import { Send, Sparkles, MapPin, Dna } from 'lucide-react';
import { buildFallbackSuggestion } from '@/lib/outfit-fallback';
import { wantsOutfitRecommendation } from '@/lib/outfit-intent';
import { getGarmentImage } from '@/lib/garment-images';
import { buildQuickPrompts, REFINE_PROMPTS } from '@/lib/stylist-rag/quick-prompts';
import { preferenceSummaryShort } from '@/lib/stylist-rag';
import type { ProfilePreferences } from '@/lib/supabase/sync';
import type { WardrobeItem } from '@/types/wardrobe';
import type { OutfitSuggestion } from '@/lib/outfit-fallback';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  outfitSuggestion?: OutfitSuggestion;
  meta?: {
    styleDnaApplied?: boolean;
    retrievedCount?: number;
  };
}

interface ChatInterfaceProps {
  onClose: () => void;
  location: string;
  weather: { temp: number; condition: string };
  wardrobeItems: WardrobeItem[];
  stylePreferences?: ProfilePreferences;
}

function SuggestedPiecesRow({
  label,
  codes,
  byCode,
}: {
  label: string;
  codes: string[];
  byCode: Map<string, WardrobeItem>;
}) {
  if (codes.length === 0) return null;
  return (
    <div className="min-w-0">
      <div
        style={{ fontSize: '9px', fontWeight: 700, opacity: 0.65, marginBottom: 6, letterSpacing: '0.06em' }}
      >
        {label}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5" style={{ scrollbarWidth: 'thin' }}>
        {codes.map((code) => {
          const item = byCode.get(code);
          const src = item?.imageUrl ?? getGarmentImage(item?.type);
          const caption = (item?.title || item?.type || code).trim();
          return (
            <div key={code} className="w-[4.5rem] shrink-0 text-center">
              <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-neutral-100 border-2 border-[var(--clue-border)]">
                <Image src={src} alt={caption} fill className="object-cover" sizes="72px" unoptimized />
              </div>
              <p
                className="mt-1 px-0.5 break-words line-clamp-2"
                style={{ fontSize: '10px', fontWeight: 600, lineHeight: 1.25 }}
              >
                {caption}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OutfitCard({
  suggestion,
  byCode,
}: {
  suggestion: OutfitSuggestion;
  byCode: Map<string, WardrobeItem>;
}) {
  return (
    <div className="mt-4 space-y-3">
      <div className="p-3 rounded-xl bg-[var(--clue-surface)] border-2 border-[var(--clue-border)]">
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 10 }}>
          FROM YOUR CLOSET
        </div>
        <div className="space-y-4">
          <SuggestedPiecesRow label="TOPS" codes={suggestion.tops} byCode={byCode} />
          <SuggestedPiecesRow label="BOTTOMS" codes={suggestion.bottoms} byCode={byCode} />
          <SuggestedPiecesRow label="OUTERWEAR" codes={suggestion.outerwear ?? []} byCode={byCode} />
          <SuggestedPiecesRow label="FOOTWEAR" codes={suggestion.footwear ?? []} byCode={byCode} />
          <SuggestedPiecesRow label="ACCESSORIES" codes={suggestion.accessories} byCode={byCode} />
        </div>
      </div>
    </div>
  );
}

export function ChatInterface({
  onClose,
  location,
  weather,
  wardrobeItems,
  stylePreferences,
}: ChatInterfaceProps) {
  const itemsByCode = useMemo(() => {
    const m = new Map<string, WardrobeItem>();
    for (const it of wardrobeItems) m.set(it.code, it);
    return m;
  }, [wardrobeItems]);

  const wardrobeForChat = useMemo(
    () =>
      wardrobeItems.slice(0, 120).map((item) => ({
        code: item.code,
        type: item.type,
        category: item.category,
        ...(item.title ? { title: item.title } : {}),
      })),
    [wardrobeItems]
  );

  const dnaLabel = preferenceSummaryShort(stylePreferences);
  const quickPrompts = useMemo(
    () => buildQuickPrompts(weather, stylePreferences),
    [weather, stylePreferences]
  );

  const [messages, setMessages] = useState<Message[]>(() => {
    const dnaNote = dnaLabel
      ? ` I've got your style DNA (${dnaLabel}) — every suggestion will follow that.`
      : ' Set your Style DNA in the app for even sharper picks.';
    return [
      {
        id: 'welcome',
        role: 'assistant',
        content: `Hey! I'm your AI stylist with access to your real wardrobe.${dnaNote} Tap a quick prompt or tell me your plans — ${weather.temp}°C and ${weather.condition} in ${location} right now.`,
      },
    ];
  });
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [hasOutfitReply, setHasOutfitReply] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isThinking]);

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 200);
    return () => window.clearTimeout(t);
  }, []);

  const sendMessage = useCallback(
    async (messageText: string) => {
      const trimmed = messageText.trim();
      if (!trimmed || isThinking) return;

      const userMessage: Message = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: trimmed,
      };

      const history = messages
        .filter((m) => m.id !== 'welcome')
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setIsThinking(true);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            location,
            weather,
            wardrobeItems: wardrobeForChat,
            history,
          }),
        });

        if (!response.ok) throw new Error('Chat request failed');

        const payload = await response.json();
        const assistantMessage: Message = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: payload.reply,
          meta: payload.personalization,
        };
        if (payload.outfitSuggestion != null && typeof payload.outfitSuggestion === 'object') {
          assistantMessage.outfitSuggestion = payload.outfitSuggestion;
          setHasOutfitReply(true);
        }
        setMessages((prev) => [...prev, assistantMessage]);
      } catch {
        if (!wantsOutfitRecommendation(trimmed)) {
          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content:
                "I couldn't reach the server. Try again in a moment — or keep chatting; when you want outfit ideas, describe the occasion.",
            },
          ]);
        } else {
          const offline = buildFallbackSuggestion(trimmed, weather.temp, weather.condition, wardrobeItems);
          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: `${offline.reason} (Offline — local suggestion from your wardrobe.)`,
              outfitSuggestion: offline,
            },
          ]);
          setHasOutfitReply(true);
        }
      } finally {
        setIsThinking(false);
      }
    },
    [isThinking, messages, location, weather, wardrobeForChat, wardrobeItems]
  );

  const handleSend = () => void sendMessage(input);

  const chips = hasOutfitReply ? REFINE_PROMPTS : quickPrompts;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      style={{
        background: 'var(--clue-overlay)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 16 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative max-w-[800px] w-full max-h-[min(88vh,100dvh-2rem)] rounded-3xl overflow-hidden flex flex-col my-auto"
        style={{
          background: 'var(--clue-surface)',
          border: '4px solid var(--clue-border)',
          boxShadow: '0 24px 64px var(--clue-overlay)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="p-4 sm:p-5 border-b-4 border-[var(--clue-border)] flex items-center justify-between gap-3 shrink-0 min-w-0"
          style={{ background: 'var(--clue-surface-accent)' }}
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-[var(--clue-inverse)] flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-[var(--clue-inverse-text)]" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h3 style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '-0.01em' }}>AI STYLIST</h3>
              <div
                className="flex items-center gap-2 flex-wrap"
                style={{ fontSize: '11px', fontWeight: 600, color: 'var(--clue-text-muted)' }}
              >
                <MapPin className="w-3 h-3 shrink-0" strokeWidth={2.5} />
                <span className="break-words">
                  {location} · {weather.temp}°C {weather.condition}
                </span>
                {dnaLabel && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                    style={{
                      background: 'var(--clue-glass)',
                      border: '1px solid var(--clue-border-soft)',
                      fontSize: '10px',
                      fontWeight: 700,
                    }}
                  >
                    <Dna className="w-3 h-3" aria-hidden />
                    {dnaLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shrink-0"
            style={{ background: 'var(--clue-inverse)', color: 'var(--clue-inverse-text)' }}
            aria-label="Close stylist"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="4" y1="4" x2="16" y2="16" />
              <line x1="16" y1="4" x2="4" y2="16" />
            </svg>
          </button>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3"
        >
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[min(88%,100%)] min-w-0 p-3.5 sm:p-4 rounded-2xl"
                  style={{
                    background:
                      message.role === 'user' ? 'var(--clue-inverse)' : 'var(--clue-surface-warm)',
                    color:
                      message.role === 'user' ? 'var(--clue-inverse-text)' : 'var(--clue-text)',
                    border: '2px solid var(--clue-border)',
                  }}
                >
                  {message.role === 'assistant' && message.meta?.styleDnaApplied && (
                    <p
                      className="mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                      style={{
                        fontSize: '9px',
                        fontWeight: 800,
                        letterSpacing: '0.06em',
                        background: 'var(--clue-glass)',
                        border: '1px solid var(--clue-border-soft)',
                      }}
                    >
                      <Dna className="w-3 h-3" aria-hidden />
                      STYLE DNA APPLIED
                    </p>
                  )}
                  <p
                    className="break-words whitespace-pre-wrap"
                    style={{ fontSize: '14px', fontWeight: 500, lineHeight: 1.6 }}
                  >
                    {message.content}
                  </p>
                  {message.outfitSuggestion && (
                    <OutfitCard suggestion={message.outfitSuggestion} byCode={itemsByCode} />
                  )}
                </div>
              </motion.div>
            ))}

            {isThinking && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
                role="status"
                aria-live="polite"
              >
                <motion.div
                  className="p-4 rounded-2xl"
                  style={{ background: 'var(--clue-surface-warm)', border: '2px solid var(--clue-border)' }}
                >
                  <div className="flex items-center gap-2">
                    <motion.div className="flex gap-1">
                      {[0, 0.2, 0.4].map((delay) => (
                        <motion.div
                          key={delay}
                          animate={{ scale: [1, 1.25, 1] }}
                          transition={{ repeat: Infinity, duration: 0.75, delay }}
                          className="w-2 h-2 rounded-full bg-[var(--clue-inverse)]"
                        />
                      ))}
                    </motion.div>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>
                      Searching your closet & style DNA…
                    </span>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-4 border-t-4 border-[var(--clue-border)] shrink-0" style={{ background: 'var(--clue-surface-muted)' }}>
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
            {chips.map((chip) => (
              <button
                type="button"
                key={chip.label}
                disabled={isThinking}
                onClick={() => void sendMessage(chip.message)}
                className="shrink-0 px-3 py-1.5 rounded-full transition-opacity hover:opacity-85 active:opacity-70 disabled:opacity-40"
                style={{
                  background: 'var(--clue-surface)',
                  border: '2px solid var(--clue-border)',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <form
            className="flex gap-2 sm:gap-3 min-w-0 items-center"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Dinner at 7, smart-casual, no heels…"
              disabled={isThinking}
              className="min-w-0 flex-1 px-4 py-3 rounded-full outline-none transition-[box-shadow,border-color] placeholder:text-[var(--clue-text-subtle)] disabled:opacity-60"
              style={{
                background: 'var(--clue-surface)',
                border: '2px solid var(--clue-border)',
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--clue-text)',
              }}
            />
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              type="submit"
              disabled={!input.trim() || isThinking}
              className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-full flex items-center justify-center disabled:opacity-40 transition-opacity"
              aria-label="Send message"
              style={{
                background: 'var(--clue-inverse)',
                color: 'var(--clue-inverse-text)',
              }}
            >
              <Send className="w-5 h-5" strokeWidth={2.5} />
            </motion.button>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}
