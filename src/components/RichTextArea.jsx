'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, Trash2, ZoomIn, X, Image as ImageIcon } from 'lucide-react';

/**
 * RichTextArea — a textarea that supports inline images.
 *
 * Value format:
 *   - Legacy: plain string (auto-converted to [{type:'text', value:'...'}])
 *   - New: array of blocks: [{type:'text', value:'...'}, {type:'image', url:'...', path:'...', name:'...'}]
 *
 * Props:
 *   value: string | array
 *   onChange: (blocks: array) => void
 *   ticker: string (for upload path)
 *   placeholder: string
 *   rows: number
 *   className: string (applied to text areas)
 *   onBlur: () => void
 *   onCommit: (blocks: array) => void
 */
export default function RichTextArea({ value, onChange, ticker, placeholder, rows = 4, className = '', onBlur, onCommit }) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Normalize value to blocks
  const blocks = Array.isArray(value)
    ? value
    : [{ type: 'text', value: value || '' }];

  // Ensure there's always at least one text block
  const normalizedBlocks = blocks.length === 0 ? [{ type: 'text', value: '' }] : blocks;

  const emitChange = useCallback((newBlocks) => {
    onChange(newBlocks);
  }, [onChange]);

  const updateTextBlock = (idx, text) => {
    const updated = normalizedBlocks.map((b, i) => i === idx ? { ...b, value: text } : b);
    emitChange(updated);
  };

  const uploadImage = async (file) => {
    if (!file || !file.type.startsWith('image/')) return null;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('ticker', ticker || 'GENERAL');
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.url) {
      return { type: 'image', url: data.url, path: data.path, name: file.name };
    }
    return null;
  };

  const insertImageAfter = async (idx, files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newBlocks = [...normalizedBlocks];
      let insertAt = idx + 1;
      for (const file of files) {
        const imgBlock = await uploadImage(file);
        if (imgBlock) {
          newBlocks.splice(insertAt, 0, imgBlock);
          insertAt++;
          // Add a text block after the image if the next block isn't text
          if (insertAt >= newBlocks.length || newBlocks[insertAt]?.type !== 'text') {
            newBlocks.splice(insertAt, 0, { type: 'text', value: '' });
            insertAt++;
          }
        }
      }
      emitChange(newBlocks);
      onCommit?.(newBlocks);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (idx) => {
    const block = normalizedBlocks[idx];
    if (block?.path) {
      try { await fetch(`/api/upload?path=${encodeURIComponent(block.path)}`, { method: 'DELETE' }); } catch {}
    }
    const newBlocks = normalizedBlocks.filter((_, i) => i !== idx);
    // Merge adjacent text blocks
    const merged = [];
    for (const b of newBlocks) {
      if (b.type === 'text' && merged.length > 0 && merged[merged.length - 1].type === 'text') {
        merged[merged.length - 1] = { ...merged[merged.length - 1], value: merged[merged.length - 1].value + b.value };
      } else {
        merged.push(b);
      }
    }
    const finalBlocks = merged.length > 0 ? merged : [{ type: 'text', value: '' }];
    emitChange(finalBlocks);
    onCommit?.(finalBlocks);
  };

  const handlePaste = async (e, blockIdx) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      await insertImageAfter(blockIdx, imageFiles);
    }
  };

  const defaultTextClass = `w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 placeholder:text-gray-300 resize-none overflow-hidden`;

  return (
    <div>
      {normalizedBlocks.map((block, idx) => {
        if (block.type === 'image') {
          return (
            <div key={idx} className="relative group my-2 inline-block w-full">
              <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                <img
                  src={block.url}
                  alt={block.name || 'Inline image'}
                  className="w-full max-h-96 object-contain cursor-pointer"
                  onClick={() => setPreviewUrl(block.url)}
                />
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setPreviewUrl(block.url)}
                    className="p-1.5 bg-white/90 hover:bg-white rounded-lg shadow-sm text-gray-600"
                  >
                    <ZoomIn size={14} />
                  </button>
                  <button
                    onClick={() => removeImage(idx)}
                    className="p-1.5 bg-white/90 hover:bg-white rounded-lg shadow-sm text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {block.name && (
                <p className="text-[10px] text-gray-400 mt-0.5 pl-1">{block.name}</p>
              )}
            </div>
          );
        }

        // Text block
        return (
          <div key={idx} className="relative group">
            <textarea
              value={block.value}
              onChange={e => updateTextBlock(idx, e.target.value)}
              onPaste={e => handlePaste(e, idx)}
              onBlur={() => onBlur?.(normalizedBlocks)}
              onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
              placeholder={idx === 0 ? placeholder : 'Continue writing...'}
              rows={idx === 0 ? rows : 2}
              spellCheck={true}
              className={className || defaultTextClass}
            />
            <label
              className="absolute bottom-2 right-2 p-1 text-gray-300 hover:text-emerald-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-all"
              title="Add image"
            >
              <ImageIcon size={14} />
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => insertImageAfter(idx, Array.from(e.target.files))}
              />
            </label>
          </div>
        );
      })}

      {uploading && (
        <div className="text-xs text-emerald-600 animate-pulse mt-1 pl-1">Uploading image...</div>
      )}

      {/* Preview modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-8"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
          >
            <X size={20} />
          </button>
          <img
            src={previewUrl}
            alt="Preview"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
