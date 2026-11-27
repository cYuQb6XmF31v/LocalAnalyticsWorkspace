import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import './CustomSelect.css';

export interface CustomSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  id?: string;
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  title?: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  mono?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function CustomSelect({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  title,
  className = '',
  size = 'md',
  mono = false,
  disabled = false,
  placeholder = 'Оберіть…',
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    minWidth: number;
    openUp: boolean;
  }>({ top: 0, left: 0, minWidth: 120, openUp: false });

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((o) => o.value === value);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = Math.min(260, options.length * 30 + 12);
    const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
    const minWidth = Math.max(rect.width, 110);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - minWidth - 8));
    setCoords({
      top: openUp ? rect.top - 4 : rect.bottom + 4,
      left,
      minWidth,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const idx = Math.max(0, options.findIndex((o) => o.value === value));
    setFocusedIndex(idx);
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;

    const handleOutside = (e: PointerEvent) => {
      const t = e.target;
      if (
        t instanceof Node &&
        !triggerRef.current?.contains(t) &&
        !menuRef.current?.contains(t)
      ) {
        setOpen(false);
      }
    };

    const handleReposition = () => updatePosition();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(options.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const opt = options[focusedIndex];
        if (opt && !opt.disabled) {
          onChange(opt.value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };

    window.addEventListener('pointerdown', handleOutside, true);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('keydown', handleKey, true);
    return () => {
      window.removeEventListener('pointerdown', handleOutside, true);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('keydown', handleKey, true);
    };
  }, [open, focusedIndex, options, onChange]);

  const sizeClass =
    size === 'xs' ? 'cselect-trigger--xs' : size === 'sm' ? 'cselect-trigger--sm' : '';

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        title={title ?? selectedOption?.label}
        disabled={disabled}
        className={`cselect-trigger ${sizeClass} ${mono ? 'cselect-trigger--mono' : ''} ${
          open ? 'cselect-trigger--open' : ''
        } ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        <span className="cselect-value">{selectedOption?.label ?? placeholder}</span>
        <ChevronDown size={size === 'xs' ? 11 : 12} className="cselect-chevron" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="cselect-menu"
            role="listbox"
            style={{
              top: coords.top,
              left: coords.left,
              minWidth: coords.minWidth,
              maxWidth: Math.min(360, window.innerWidth - 16),
              transform: coords.openUp ? 'translateY(-100%)' : undefined,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {options.map((opt, idx) => {
              const selected = opt.value === value;
              const focused = idx === focusedIndex;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={opt.disabled}
                  className={`cselect-option ${mono ? 'cselect-option--mono' : ''} ${
                    selected ? 'cselect-option--selected' : ''
                  } ${focused ? 'cselect-option--focused' : ''}`}
                  onMouseEnter={() => setFocusedIndex(idx)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (opt.disabled) return;
                    onChange(opt.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                >
                  <span className="cselect-option-label">{opt.label}</span>
                  {selected && <Check size={12} className="cselect-check" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
