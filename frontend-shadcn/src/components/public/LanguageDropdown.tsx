import type { Language } from '@/pages/public/types';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

interface LanguageDropdownProps {
  languages: Language[];
  selected: Language | null;
  onChange: (lang: Language) => void;
  placeholder?: string;
}

export function LanguageDropdown({
  languages,
  selected,
  onChange,
  placeholder = 'Language',
}: LanguageDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const listId = useId();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedIndex = languages.findIndex((l) => l.id === selected?.id);

  const openList = () => {
    setOpen(true);
    const target = selectedIndex >= 0 ? selectedIndex : 0;
    // L'elenco si monta al render successivo: il focus va sull'opzione corrente.
    requestAnimationFrame(() => optionRefs.current[target]?.focus());
  };

  const closeList = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const choose = (lang: Language) => {
    onChange(lang);
    closeList(true);
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openList();
    }
  };

  const handleOptionKeyDown = (e: React.KeyboardEvent, index: number, lang: Language) => {
    const count = languages.length;
    const focusOption = (i: number) => optionRefs.current[(i + count) % count]?.focus();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusOption(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusOption(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusOption(0);
        break;
      case 'End':
        e.preventDefault();
        focusOption(count - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(lang);
        break;
      case 'Escape':
        e.preventDefault();
        closeList(true);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={ref} className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={selected ? `${placeholder}: ${selected.language}` : placeholder}
        onClick={() => (open ? closeList(false) : openList())}
        onKeyDown={handleTriggerKeyDown}
        className="w-full flex items-center justify-between px-4 py-3 border border-gray-500 rounded-full bg-white text-gray-700 hover:border-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className={selected ? 'text-gray-800 font-medium' : 'text-gray-600'}>
          {selected ? selected.language : placeholder}
        </span>
        {open ? (
          <ChevronUp aria-hidden="true" className="w-5 h-5 text-gray-600" />
        ) : (
          <ChevronDown aria-hidden="true" className="w-5 h-5 text-gray-600" />
        )}
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={placeholder}
          className="absolute z-10 w-full mt-1 bg-[#e8f5e1] rounded-2xl shadow-lg max-h-64 overflow-y-auto"
        >
          {languages.map((lang, index) => {
            const isSelected = selected?.id === lang.id;
            return (
              <div
                key={lang.id}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                onClick={() => choose(lang)}
                onKeyDown={(e) => handleOptionKeyDown(e, index, lang)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#d4edca] focus:bg-[#d4edca] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary transition-colors text-left cursor-pointer"
              >
                <div
                  aria-hidden="true"
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    isSelected ? 'border-gray-800 bg-gray-800' : 'border-gray-600 bg-white'
                  }`}
                >
                  {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <span className="text-gray-800">{lang.language}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
