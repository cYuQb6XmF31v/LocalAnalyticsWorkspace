import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { RotateCcw, Sparkles, X } from 'lucide-react';

export interface UiEffectsSettings {
  /** Glow / highlight intensity 0..100 (0 = completely off) */
  intensity: number;
  /** Motion, lift & pointer-spotlight interactivity 0..100 (0 = completely static) */
  interactivity: number;
  /** Primary effect / glow color */
  color: string;
}

export const DEFAULT_UI_EFFECTS: UiEffectsSettings = {
  intensity: 55,
  interactivity: 65,
  color: '#7c5cff',
};

const STORAGE_KEY = 'law_ui_effects_v1';

const PRESET_COLORS = ['#7c5cff', '#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#fb7185'];

function hexToRgbTuple(hex: string): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return '124, 92, 255';
  }
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function loadInitialEffects(): UiEffectsSettings {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_UI_EFFECTS;
    const parsed = JSON.parse(raw) as Partial<UiEffectsSettings>;
    return {
      intensity:
        typeof parsed.intensity === 'number'
          ? Math.max(0, Math.min(100, parsed.intensity))
          : DEFAULT_UI_EFFECTS.intensity,
      interactivity:
        typeof parsed.interactivity === 'number'
          ? Math.max(0, Math.min(100, parsed.interactivity))
          : DEFAULT_UI_EFFECTS.interactivity,
      color:
        typeof parsed.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.color)
          ? parsed.color
          : DEFAULT_UI_EFFECTS.color,
    };
  } catch {
    return DEFAULT_UI_EFFECTS;
  }
}

interface UiEffectsContextValue {
  effects: UiEffectsSettings;
  setEffects: React.Dispatch<React.SetStateAction<UiEffectsSettings>>;
  resetEffects: () => void;
}

const UiEffectsContext = createContext<UiEffectsContextValue | null>(null);

export function UiEffectsProvider({ children }: { children: ReactNode }) {
  const [effects, setEffects] = useState<UiEffectsSettings>(loadInitialEffects);

  useEffect(() => {
    const root = document.documentElement;
    const intRatio = effects.intensity / 100;
    const interRatio = effects.interactivity / 100;
    const rgb = hexToRgbTuple(effects.color);

    root.style.setProperty('--fx-intensity', intRatio.toFixed(3));
    root.style.setProperty('--fx-interactivity', interRatio.toFixed(3));
    root.style.setProperty('--fx-color', effects.color);
    root.style.setProperty('--fx-rgb', rgb);

    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(effects));
    } catch {
      // Ignore storage quota errors
    }
  }, [effects]);

  // Lightweight delegated pointer coordinates on interactive buttons for subtle specular sheen
  useEffect(() => {
    if (effects.interactivity <= 0 || effects.intensity <= 0) {
      return;
    }
    const handlePointerMove = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest('.btn, .icon-btn, .cw-sheet-tab, .graph-mode-btn');
      if (btn instanceof HTMLElement) {
        const rect = btn.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100;
        const y = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100;
        btn.style.setProperty('--fx-mx', `${x.toFixed(1)}%`);
        btn.style.setProperty('--fx-my', `${y.toFixed(1)}%`);
      }
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, [effects.interactivity, effects.intensity]);

  return (
    <UiEffectsContext.Provider
      value={{
        effects,
        setEffects,
        resetEffects: () => setEffects(DEFAULT_UI_EFFECTS),
      }}
    >
      {children}
    </UiEffectsContext.Provider>
  );
}

export function useUiEffects() {
  const ctx = useContext(UiEffectsContext);
  if (!ctx) {
    throw new Error('useUiEffects must be used inside UiEffectsProvider');
  }
  return ctx;
}

export function UiEffectsPopover({ onClose }: { onClose: () => void }) {
  const { effects, setEffects, resetEffects } = useUiEffects();

  return (
    <div
      className="fx-popover"
      role="dialog"
      aria-label="Налаштування UI-ефектів"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="fx-popover-head">
        <span className="fx-popover-title">
          <Sparkles size={13} />
          <span>Ефекти інтерфейсу</span>
        </span>
        <div className="fx-popover-head-actions">
          <button
            type="button"
            className="sd-mini-btn"
            onClick={resetEffects}
            title="Скинути за замовчуванням"
            aria-label="Скинути ефекти"
          >
            <RotateCcw size={12} />
          </button>
          <button
            type="button"
            className="sd-mini-btn"
            onClick={onClose}
            aria-label="Закрити панель ефектів"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="fx-popover-body">
        <div className="fx-row">
          <div className="fx-row-head">
            <label htmlFor="fx-intensity">Інтенсивність підсвічування</label>
            <span className="fx-val">
              {effects.intensity === 0 ? 'Вимк.' : `${effects.intensity}%`}
            </span>
          </div>
          <input
            id="fx-intensity"
            type="range"
            min={0}
            max={100}
            step={1}
            value={effects.intensity}
            onChange={(e) =>
              setEffects((prev) => ({ ...prev, intensity: Number(e.target.value) }))
            }
          />
        </div>

        <div className="fx-row">
          <div className="fx-row-head">
            <label htmlFor="fx-interactivity">Інтерактивність та відгук</label>
            <span className="fx-val">
              {effects.interactivity === 0 ? 'Вимк.' : `${effects.interactivity}%`}
            </span>
          </div>
          <input
            id="fx-interactivity"
            type="range"
            min={0}
            max={100}
            step={1}
            value={effects.interactivity}
            onChange={(e) =>
              setEffects((prev) => ({ ...prev, interactivity: Number(e.target.value) }))
            }
          />
        </div>

        <div className="fx-row">
          <div className="fx-row-head">
            <span>Колір підсвічування</span>
            <span className="fx-val">{effects.color.toUpperCase()}</span>
          </div>
          <div className="fx-swatches">
            {PRESET_COLORS.map((hex) => (
              <button
                key={hex}
                type="button"
                className={`fx-swatch ${
                  effects.color.toLowerCase() === hex.toLowerCase() ? 'fx-swatch--active' : ''
                }`}
                style={{ backgroundColor: hex }}
                aria-label={`Колір ефекту ${hex}`}
                onClick={() => setEffects((prev) => ({ ...prev, color: hex }))}
              />
            ))}
            <input
              type="color"
              className="fx-color-picker"
              aria-label="Довільний колір ефектів"
              value={effects.color}
              onChange={(e) => setEffects((prev) => ({ ...prev, color: e.target.value }))}
            />
          </div>
        </div>

        <div className="fx-presets">
          <button
            type="button"
            className="fx-preset-btn"
            onClick={() => setEffects((prev) => ({ ...prev, intensity: 0, interactivity: 0 }))}
          >
            Вимкнути все
          </button>
          <button
            type="button"
            className="fx-preset-btn"
            onClick={() => setEffects((prev) => ({ ...prev, intensity: 25, interactivity: 30 }))}
          >
            Мінімум
          </button>
          <button
            type="button"
            className="fx-preset-btn"
            onClick={() => setEffects((prev) => ({ ...prev, intensity: 90, interactivity: 95 }))}
          >
            Максимум
          </button>
        </div>
      </div>
    </div>
  );
}
