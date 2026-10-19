import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export default function CodeBlock({ children, label = 'Shell' }) {
  const [copied, setCopied] = useState(false);
  const text = String(children).trim();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="code-block">
      <div className="code-top">
        <span>{label}</span>
        <button type="button" onClick={copy} aria-label="Copy command">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  );
}
