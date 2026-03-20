'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  FolderOpen, Upload, Trash2, Search, FileText, File, X, Download,
  Image as ImageIcon, UploadCloud, ChevronRight, ExternalLink, Filter,
  FileSpreadsheet, BookOpen, Mail, Archive,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'shareholder_letter', label: 'Shareholder Letters', icon: Mail, color: 'blue' },
  { value: 'equity_research', label: 'Equity Research', icon: BookOpen, color: 'emerald' },
  { value: 'investor_memo', label: 'Investor Memos', icon: FileText, color: 'violet' },
  { value: 'financial_model', label: 'Financial Models', icon: FileSpreadsheet, color: 'amber' },
  { value: 'other', label: 'Other', icon: Archive, color: 'gray' },
];

const COLOR_MAP = {
  blue:    { badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', hover: 'hover:bg-blue-50', active: 'bg-blue-50 border-blue-200 text-blue-700' },
  emerald: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', hover: 'hover:bg-emerald-50', active: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  violet:  { badge: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500', hover: 'hover:bg-violet-50', active: 'bg-violet-50 border-violet-200 text-violet-700' },
  amber:   { badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', hover: 'hover:bg-amber-50', active: 'bg-amber-50 border-amber-200 text-amber-700' },
  gray:    { badge: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400', hover: 'hover:bg-gray-50', active: 'bg-gray-100 border-gray-300 text-gray-700' },
};

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fileIcon(doc) {
  const fileType = (doc.file_type || '').toLowerCase();
  const fileName = (doc.file_name || '').toLowerCase();

  if (fileType.includes('pdf') || fileName.endsWith('.pdf')) {
    return {
      icon: <FileText size={20} className="text-red-500" />,
      wrapperClass: 'bg-red-50',
    };
  }

  if (
    fileType.includes('word') ||
    fileType.includes('officedocument.wordprocessingml') ||
    fileType.includes('google-apps.document') ||
    fileName.match(/\.(docx?|gdoc)$/i)
  ) {
    return {
      icon: <FileText size={20} className="text-blue-600" />,
      wrapperClass: 'bg-blue-50',
    };
  }

  if (
    fileType.includes('sheet') ||
    fileType.includes('excel') ||
    fileType.includes('csv') ||
    fileType.includes('google-apps.spreadsheet') ||
    fileName.match(/\.(xlsx?|csv|gsheet)$/i)
  ) {
    return {
      icon: <FileSpreadsheet size={20} className="text-emerald-600" />,
      wrapperClass: 'bg-emerald-50',
    };
  }

  if (fileType.startsWith('image/')) {
    return {
      icon: <ImageIcon size={20} className="text-blue-500" />,
      wrapperClass: 'bg-blue-50',
    };
  }

  return {
    icon: <File size={20} className="text-gray-400" />,
    wrapperClass: 'bg-gray-50',
  };
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // Upload form state
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('other');
  const [uploadTicker, setUploadTicker] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const fileInputRef = useRef(null);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const handleFilesSelected = (files) => {
    if (!files?.length) return;
    setPendingFiles(Array.from(files));
    setUploadTitle(files.length === 1 ? files[0].name.replace(/\.[^/.]+$/, '') : '');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFilesSelected(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (!pendingFiles.length) return;
    setUploading(true);
    try {
      for (const file of pendingFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', pendingFiles.length === 1 ? (uploadTitle || file.name) : file.name);
        formData.append('category', uploadCategory);
        formData.append('ticker', uploadTicker);
        formData.append('notes', uploadNotes);

        const res = await fetch('/api/documents', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.document) {
          setDocuments(prev => [data.document, ...prev]);
        }
      }
      setPendingFiles([]);
      setUploadTitle('');
      setUploadCategory('other');
      setUploadTicker('');
      setUploadNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {} finally {
      setUploading(false);
    }
  };

  const cancelUpload = () => {
    setPendingFiles([]);
    setUploadTitle('');
    setUploadCategory('other');
    setUploadTicker('');
    setUploadNotes('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`/api/documents?id=${id}`, { method: 'DELETE' });
      setDocuments(prev => prev.filter(d => d.id !== id));
      setConfirmDeleteId(null);
    } catch {}
  };

  // Derived data
  const filtered = useMemo(() => (
    documents
      .filter(d => {
        if (filterCategory && d.category !== filterCategory) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            (d.title || '').toLowerCase().includes(q) ||
            (d.ticker || '').toLowerCase().includes(q) ||
            (d.notes || '').toLowerCase().includes(q) ||
            (d.file_name || '').toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at))
  ), [documents, filterCategory, searchQuery]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    documents.forEach(d => { counts[d.category] = (counts[d.category] || 0) + 1; });
    return counts;
  }, [documents]);

  const tickerChips = useMemo(() => {
    const tickers = {};
    documents.forEach(d => { if (d.ticker) tickers[d.ticker] = (tickers[d.ticker] || 0) + 1; });
    return Object.entries(tickers).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [documents]);

  const totalSize = useMemo(() =>
    documents.reduce((sum, d) => sum + (Number(d.file_size) || 0), 0)
  , [documents]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 lg:px-12 pb-16">
        <div className="h-10 w-48 bg-gray-200 rounded-xl animate-pulse mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="max-w-7xl mx-auto px-6 lg:px-12 pb-16"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Full-page drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-40 bg-emerald-500/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-3xl shadow-2xl border-2 border-dashed border-emerald-400 px-16 py-12 text-center">
            <UploadCloud size={48} className="text-emerald-500 mx-auto mb-3" />
            <p className="text-lg font-bold text-gray-900">Drop files here</p>
            <p className="text-sm text-gray-500 mt-1">They&apos;ll be added to your document hub</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8 animate-fade-in-up">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-400 mt-1">
            <span>{documents.length} document{documents.length !== 1 ? 's' : ''}</span>
            <span className="mx-2 text-gray-300">·</span>
            <span>{formatFileSize(totalSize) || '0 B'} stored</span>
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 px-5 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md"
        >
          <Upload size={15} />
          Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => handleFilesSelected(e.target.files)}
        />
      </div>

      {/* Upload staging area */}
      {pendingFiles.length > 0 && (
        <div className="mb-8 bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
          <div className="bg-emerald-50 px-6 py-3 flex items-center justify-between border-b border-emerald-100">
            <div className="flex items-center gap-2">
              <UploadCloud size={16} className="text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-800">
                {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''} ready to upload
              </span>
            </div>
            <button onClick={cancelUpload} className="text-emerald-600 hover:text-emerald-800 transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="p-6">
            {/* File list */}
            <div className="flex flex-wrap gap-2 mb-5">
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 text-sm">
                  <File size={14} className="text-gray-400" />
                  <span className="text-gray-700 font-medium truncate max-w-[200px]">{f.name}</span>
                  <span className="text-gray-400 text-xs">{formatFileSize(f.size)}</span>
                  <button
                    onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>

            {/* Metadata fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {pendingFiles.length === 1 && (
                <div>
                  <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block mb-1">Title</label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={e => setUploadTitle(e.target.value)}
                    placeholder="Document title..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 transition-all"
                  />
                </div>
              )}
              <div>
                <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block mb-1">Category</label>
                <select
                  value={uploadCategory}
                  onChange={e => setUploadCategory(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 transition-all"
                >
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block mb-1">Ticker</label>
                <input
                  type="text"
                  value={uploadTicker}
                  onChange={e => setUploadTicker(e.target.value.toUpperCase())}
                  placeholder="e.g. AAPL"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 transition-all uppercase"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block mb-1">Notes</label>
                <input
                  type="text"
                  value={uploadNotes}
                  onChange={e => setUploadNotes(e.target.value)}
                  placeholder="Quick note..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 transition-all"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex items-center gap-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-6 py-2.5 rounded-xl transition-colors"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    Upload {pendingFiles.length > 1 ? `${pendingFiles.length} files` : ''}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main layout: sidebar + content */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 animate-fade-in-up stagger-2">
        {/* Sidebar */}
        <div className="space-y-6 animate-slide-in-right stagger-3">
          {/* Category nav */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
            <button
              onClick={() => setFilterCategory('')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                !filterCategory ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FolderOpen size={15} />
                All Documents
              </div>
              <span className={`text-xs font-bold ${!filterCategory ? 'text-gray-400' : 'text-gray-400'}`}>{documents.length}</span>
            </button>

            <div className="mt-1 space-y-0.5">
              {CATEGORIES.map(cat => {
                const count = categoryCounts[cat.value] || 0;
                const colors = COLOR_MAP[cat.color];
                const isActive = filterCategory === cat.value;
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.value}
                    onClick={() => setFilterCategory(prev => prev === cat.value ? '' : cat.value)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive ? `${colors.active} border` : `text-gray-600 ${colors.hover} border border-transparent`
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon size={15} className={isActive ? '' : 'text-gray-400'} />
                      <span className="truncate">{cat.label}</span>
                    </div>
                    {count > 0 && (
                      <span className={`text-xs font-bold ${isActive ? '' : 'text-gray-400'}`}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ticker chips */}
          {tickerChips.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">By Ticker</p>
              <div className="flex flex-wrap gap-1.5">
                {tickerChips.map(([ticker, count]) => (
                  <button
                    key={ticker}
                    onClick={() => setSearchQuery(prev => prev === ticker ? '' : ticker)}
                    className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-all ${
                      searchQuery === ticker
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {ticker}
                    <span className={`ml-1 ${searchQuery === ticker ? 'text-gray-400' : 'text-gray-400'}`}>{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main content */}
        <div>
          {/* Search bar */}
          <div className="relative mb-6">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search documents, tickers, notes..."
              className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 shadow-sm transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Document list */}
          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                <FolderOpen size={28} className="text-gray-300" />
              </div>
              <h3 className="text-base font-semibold text-gray-500">
                {documents.length === 0 ? 'No documents yet' : 'No matches'}
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                {documents.length === 0 ? 'Drag and drop files or click Upload to get started' : 'Try a different search or category'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(doc => {
                const cat = CATEGORIES.find(c => c.value === doc.category);
                const colors = COLOR_MAP[cat?.color || 'gray'];
                const isDeleting = confirmDeleteId === doc.id;
                const fileVisual = fileIcon(doc);

                return (
                  <div
                    key={doc.id}
                    className="group bg-white rounded-2xl border border-gray-100 hover:border-gray-200 shadow-sm hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-4 px-5 py-4">
                      {/* File icon */}
                      <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${fileVisual.wrapperClass}`}>
                        {fileVisual.icon}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">{doc.title || doc.file_name}</h3>
                          {doc.ticker && (
                            <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">
                              {doc.ticker}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colors.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                            {cat?.label || doc.category}
                          </span>
                          <span className="text-xs text-gray-400">{formatDate(doc.uploaded_at)}</span>
                          <span className="text-xs text-gray-400">{formatFileSize(doc.file_size)}</span>
                        </div>
                        {doc.notes && (
                          <p className="text-xs text-gray-500 mt-1.5 truncate max-w-xl">{doc.notes}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Open file"
                        >
                          <ExternalLink size={15} />
                        </a>
                        {isDeleting ? (
                          <div className="flex items-center gap-1 ml-1">
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleDelete(doc.id)}
                              className="text-[11px] font-semibold text-white bg-red-500 px-2.5 py-1 rounded-lg hover:bg-red-600 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(doc.id)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
