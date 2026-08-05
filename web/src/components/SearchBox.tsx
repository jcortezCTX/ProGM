import { useEffect, useRef, useState } from "react";

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const DEBOUNCE_MS = 300;

// Local state gives instant typing feedback; onChange (which drives the URL
// and thus the React Query cache key) only fires after the user pauses, so
// a search request isn't fired on every keystroke.
export function SearchBox({ value, onChange, placeholder = "Search…" }: SearchBoxProps) {
  const [draft, setDraft] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep the local draft in sync if the URL-driven value changes elsewhere
  // (e.g. browser back/forward), without fighting the user's own typing.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  function handleChange(next: string) {
    setDraft(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => onChange(next), DEBOUNCE_MS);
  }

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return (
    <input
      type="search"
      className="search-box"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
}
