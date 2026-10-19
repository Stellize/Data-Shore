import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export default function Dropdown({ label, value, options, icon = null, open, onToggle }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof open === 'boolean';
  const expanded = isControlled ? open : internalOpen;
  const setExpanded = isControlled ? onToggle : () => setInternalOpen((v) => !v);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!expanded) return undefined;
    const onPointer = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        if (isControlled) onToggle();
        else setInternalOpen(false);
      }
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (isControlled) onToggle();
        else setInternalOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [expanded, isControlled, onToggle]);

  return (
    <div className={`dropdown${expanded ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="dropdown-trigger"
        onClick={setExpanded}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-label={`${label}: ${value}`}
      >
        {icon}
        <span>{value}</span>
        <ChevronDown size={13} className="dropdown-chevron" />
      </button>
      {expanded ? (
        <ul className="dropdown-menu" role="listbox" aria-label={label}>
          {options.map((option) => {
            const selected = option.label === value;
            return (
              <li key={option.id} role="option" aria-selected={selected}>
                <button type="button" onClick={option.onSelect}>
                  <span>{option.label}</span>
                  {selected ? <Check size={13} /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
