import { useState, useCallback, useEffect } from 'react';
import { Volume2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useUserVoices } from '@/hooks/useUserVoices';

/**
 * VoiceSelector — voice selection component for TTS.
 *
 * Renders a radio group of user voices (from the API / localStorage), system voices
 * with Chinese labels, per-voice test-playback buttons, and a custom voice ID input.
 *
 * Selected voice is persisted to localStorage under key 'resonance_tts_voice'.
 */

/** Voice entry: internal voice ID + user-facing Chinese label. */
interface VoiceEntry {
  id: string;
  label: string;
}

/** Props for the VoiceSelector component. */
interface VoiceSelectorProps {
  /** Currently selected voice ID (controlled by parent). */
  selectedVoice: string;
  /** Called when the user selects a system voice or applies a custom voice ID. */
  onVoiceChange: (voice: string) => void;
  /** Called to play a test utterance. */
  onTestVoice: (text: string) => Promise<void>;
  /** Whether a test playback is currently in progress. */
  isTestSpeaking: boolean;
  /** Optional additional CSS classes. */
  className?: string;
}

/** System voice definitions with Chinese display labels. */
const SYSTEM_VOICES: VoiceEntry[] = [
  { id: 'wenrounvsheng', label: '温柔女声' },
  { id: 'wenrounansheng', label: '温柔男声' },
  { id: 'linjiajiejie', label: '邻家姐姐' },
  { id: 'qinqienvsheng', label: '亲切女声' },
  { id: 'shenchennanyin', label: '深沉男音' },
  { id: 'cixingnansheng', label: '磁性男声' },
  { id: 'tianmeinvsheng', label: '甜美女声' },
  { id: 'ruyananshi', label: '儒雅男士' },
  { id: 'jingdiannvsheng', label: '经典女声' },
];

/** Test utterance played by the 试听 (preview) button. */
const TEST_TEXT = '你好，这是音色试听';

/** localStorage key for persisting selected voice across sessions. */
const STORAGE_KEY = 'resonance_tts_voice';

/**
 * Persist a voice ID to localStorage.
 * Silently no-ops if storage is unavailable (private browsing, quota exceeded).
 */
function persistVoice(voiceId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, voiceId);
  } catch {
    /* storage unavailable — non-critical, selection still works in-memory */
  }
}

/** VoiceSelector component — renders the voice picker UI. */
export default function VoiceSelector({
  selectedVoice,
  onVoiceChange,
  onTestVoice,
  isTestSpeaking,
  className,
}: VoiceSelectorProps) {
  /** Draft value for the custom voice ID input. */
  const [customVoiceId, setCustomVoiceId] = useState('');
  /** Which voice's test button is currently awaiting playback. */
  const [testingVoiceId, setTestingVoiceId] = useState<string | null>(null);

  /** User's cloned voices (API when authenticated, localStorage when guest). */
  const { userVoices } = useUserVoices();

  /** Bootstrap selected voice from localStorage on mount if none provided. */
  useEffect(() => {
    if (!selectedVoice) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          onVoiceChange(saved);
        }
      } catch {
        /* storage unavailable */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  /** Select a voice: persist to localStorage and notify parent. */
  const handleVoiceSelect = useCallback(
    (voiceId: string) => {
      persistVoice(voiceId);
      onVoiceChange(voiceId);
    },
    [onVoiceChange],
  );

  /** Preview the given voice by selecting it and playing the test text. */
  const handleTest = useCallback(
    async (voiceId: string) => {
      persistVoice(voiceId);
      onVoiceChange(voiceId);
      setTestingVoiceId(voiceId);
      try {
        await onTestVoice(TEST_TEXT);
      } finally {
        setTestingVoiceId(null);
      }
    },
    [onVoiceChange, onTestVoice],
  );

  /** Apply the custom voice ID from the input field. */
  const handleCustomVoiceSubmit = useCallback(() => {
    const trimmed = customVoiceId.trim();
    if (trimmed) {
      handleVoiceSelect(trimmed);
      setCustomVoiceId('');
    }
  }, [customVoiceId, handleVoiceSelect]);

  /** Whether the current selection is a custom ID (not in the system list). */
  const isCustomVoice =
    selectedVoice !== '' && !SYSTEM_VOICES.some((v) => v.id === selectedVoice);

  return (
    <div className={cn('space-y-3', className)}>
      {/* User voice section — shown only when user has cloned voices */}
      {userVoices.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              我的音色
            </span>
          </div>
          <div
            role="radiogroup"
            aria-label="我的音色"
            className="grid grid-cols-1 md:grid-cols-2 gap-1.5"
          >
            {userVoices.map((voice) => {
              const isSelected = selectedVoice === voice.voice_id;
              const isTestingThis = isTestSpeaking && testingVoiceId === voice.voice_id;

              return (
                <div
                  key={voice.voice_id}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors',
                    isSelected
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-transparent hover:bg-muted/50',
                  )}
                >
                  {/* Radio indicator */}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onClick={() => handleVoiceSelect(voice.voice_id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleVoiceSelect(voice.voice_id);
                      }
                    }}
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                      isSelected
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/30',
                    )}
                    aria-label={voice.label || voice.voice_id}
                  >
                    {isSelected && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                    )}
                  </button>

                  {/* Voice label */}
                  <span className="flex-1 text-sm font-medium text-foreground truncate">
                    {voice.label || voice.voice_id}
                  </span>

                  {/* 我的 badge */}
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                    我的
                  </span>

                  {/* 试听 (preview) button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isTestSpeaking && !isTestingThis}
                    aria-label={`试听 ${voice.label || voice.voice_id}`}
                    onClick={() => void handleTest(voice.voice_id)}
                    className="h-7 px-2 text-xs shrink-0"
                  >
                    {isTestingThis ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>试听</span>
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Divider between user voices and system voices */}
          <div className="border-t pt-3" />
        </>
      )}

      {/* System voice radio group */}
      <div
        role="radiogroup"
        aria-label="选择音色"
        className="grid grid-cols-1 md:grid-cols-2 gap-1.5"
      >
        {SYSTEM_VOICES.map((voice) => {
          const isSelected = selectedVoice === voice.id;
          const isTestingThis = isTestSpeaking && testingVoiceId === voice.id;

          return (
            <div
              key={voice.id}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors',
                isSelected
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-transparent hover:bg-muted/50',
              )}
            >
              {/* Radio indicator */}
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onClick={() => handleVoiceSelect(voice.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleVoiceSelect(voice.id);
                  }
                }}
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  isSelected
                    ? 'border-primary bg-primary'
                    : 'border-muted-foreground/30',
                )}
                aria-label={voice.label}
              >
                {isSelected && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                )}
              </button>

              {/* Voice label */}
              <span className="flex-1 text-sm font-medium text-foreground truncate">
                {voice.label}
              </span>

              {/* 试听 (preview) button */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isTestSpeaking && !isTestingThis}
                aria-label={`试听 ${voice.label}`}
                onClick={() => void handleTest(voice.id)}
                className="h-7 px-2 text-xs shrink-0"
              >
                {isTestingThis ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>试听</span>
              </Button>
            </div>
          );
        })}
      </div>

      {/* Custom voice ID section */}
      <div className="border-t pt-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            自定义音色
          </span>
          <Input
            placeholder="输入音色 ID"
            value={customVoiceId}
            onChange={(e) => setCustomVoiceId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCustomVoiceSubmit();
              }
            }}
            className="h-8 text-sm"
            aria-label="自定义音色 ID"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCustomVoiceSubmit}
            disabled={!customVoiceId.trim()}
            className="h-8 px-3 text-xs shrink-0"
          >
            使用
          </Button>
        </div>
        {isCustomVoice && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            当前使用自定义音色:{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              {selectedVoice}
            </code>
          </p>
        )}
      </div>
    </div>
  );
}
