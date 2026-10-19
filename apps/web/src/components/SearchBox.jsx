import { Search, X } from 'lucide-react';

export default function SearchBox({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search this archive…',
  label = 'Search',
  size = 'md',
  autoFocus = false,
  busy = false,
  inputRef,
}) {
  return (
    <form
      className={`search-box search-box-${size}`}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(value);
      }}
    >
      <Search size={size === 'lg' ? 20 : 16} className="search-box-icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus}
        spellCheck="false"
      />
      {busy ? <span className="search-box-busy" aria-hidden="true" /> : null}
      {value ? (
        <button
          type="button"
          className="search-box-clear"
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      ) : null}
    </form>
  );
}
