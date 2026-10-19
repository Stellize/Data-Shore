export default function Highlight({ text = '', query = '' }) {
  const words = String(query)
    .split(/\s+/)
    .filter((word) => word && !word.includes(':'))
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return text;
  const regex = new RegExp(`(${words.join('|')})`, 'ig');
  const lowered = new Set(words.map((word) => word.toLowerCase()));
  return (
    <>
      {text.split(regex).map((part, index) =>
        lowered.has(part.toLowerCase()) ? <mark key={index}>{part}</mark> : part,
      )}
    </>
  );
}
