import { useState, useRef } from 'react';
import { api } from '../api/client';
import type { ImportResult } from '../api/types';

interface ImportUploadProps {
  onImportComplete: () => void;
}

export function ImportUpload({ onImportComplete }: ImportUploadProps) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(csv|txt)$/i)) {
      setError('Please upload a .csv or .txt file');
      return;
    }

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const importResult = await api.importCards(file);
      setResult(importResult);
      onImportComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFile(e.target.files[0]);
    }
  };

  return (
    <div className="import-section">
      <h2>Import Cards</h2>
      <div
        className={`dropzone ${dragActive ? 'active' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        {importing ? (
          <p>⏳ Importing...</p>
        ) : (
          <>
            <p className="dropzone-text">📁 Drop CSV or TXT file here, or click to browse</p>
            <p className="dropzone-hint">Accepts TCGPlayer collection exports (.csv, .txt)</p>
          </>
        )}
      </div>

      {result && (
        <div className="import-result success">
          <h3>✅ Import Complete</h3>
          <p>
            <strong>{result.imported}</strong> cards imported successfully
          </p>
          {result.errors.length > 0 && (
            <details>
              <summary>
                {result.errors.length} error{result.errors.length > 1 ? 's' : ''}
              </summary>
              <ul className="error-list">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {error && (
        <div className="import-result error">
          <h3>❌ Import Failed</h3>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
