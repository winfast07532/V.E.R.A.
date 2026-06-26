// src/lib/formatter.ts
// Project VERA — Markdown Engine & Structural Code Formatter

export function parseVeraMarkdown(rawText: string): string {
  if (!rawText) return "";

  // 1. Segment raw stream into structured text chunks vs code block boundaries
  const parts = rawText.split("```");
  let combinedHtml = "";

  for (let i = 0; i < parts.length; i++) {
    const chunk = parts[i];

    if (i % 2 === 1) {
      // Inside a code block segment
      // Isolate the language tag by splitting on the first structural line break or carriage return
      const lines = chunk.split(/\r?\n/);
      let possibleLang = lines[0].trim();
      let codeContent = "";

      // Check if the first line is purely a known metadata language identifier
      if (/^[a-zA-Z0-9.\-+]+$/.test(possibleLang)) {
        codeContent = lines.slice(1).join("\n");
      } else {
        codeContent = chunk;
      }

      // Secure escaping inside code block context to avoid layout collapsing
      const escapedCode = codeContent
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .trim();

      combinedHtml += `<pre class="bg-black/40 border border-zinc-800 rounded p-4 font-mono text-sm text-emerald-400 my-3 overflow-x-auto block"><code>${escapedCode}</code></pre>`;
    } else {
      // Standard regular layout text segment
      let textHtml = chunk
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      // Handle standard inline variable backtick syntax (`item`)
      textHtml = textHtml.replace(/`([^`\n\r]+)`/g, '<code class="bg-zinc-800 px-1.5 py-0.5 rounded font-mono text-purple-400 text-sm">$1</code>');

      // Convert line splits into layout spacing breaks
      textHtml = textHtml.replace(/\r?\n/g, "<br>");
      combinedHtml += textHtml;
    }
  }

  return combinedHtml;
}