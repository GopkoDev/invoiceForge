import React from 'react';

/**
 * Parses text with HTML tags and converts them to React elements
 * Currently supports: <strong>, <em>
 */
export function parseHtmlText(text: string | undefined): React.ReactNode {
  if (!text) return null;

  // Split by HTML tags while keeping the tags
  const parts = text.split(/(<\/?(?:strong|em)>)/g);

  const elements: React.ReactNode[] = [];
  let strongOpen = false;
  let emOpen = false;
  let key = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part === '<strong>') {
      strongOpen = true;
    } else if (part === '</strong>') {
      strongOpen = false;
    } else if (part === '<em>') {
      emOpen = true;
    } else if (part === '</em>') {
      emOpen = false;
    } else if (part) {
      if (strongOpen) {
        elements.push(<strong key={key++}>{part}</strong>);
      } else if (emOpen) {
        elements.push(<em key={key++}>{part}</em>);
      } else {
        elements.push(part);
      }
    }
  }

  return elements.length === 1 ? elements[0] : <>{elements}</>;
}
