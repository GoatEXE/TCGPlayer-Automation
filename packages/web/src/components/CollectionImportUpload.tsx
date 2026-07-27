import { useRef, useState } from 'react';
import { api } from '../api/client';
import type {
  CollectionImportCommitResponse,
  CollectionImportMode,
  CollectionImportPreviewResponse,
} from '../api/types';

interface CollectionImportUploadProps {
  collectionId: number | null;
  onImportCommitted: () => void | Promise<void>;
}

function allWarnings(preview: CollectionImportPreviewResponse | null) {
  if (!preview) return [];
  return [
    ...(preview.summary.warnings ?? []),
    ...(preview.warnings ?? []),
    ...preview.rows.flatMap((row) => row.warnings ?? []),
  ].filter(Boolean);
}

export function CollectionImportUpload({
  collectionId,
  onImportCommitted,
}: CollectionImportUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mode, setMode] = useState<CollectionImportMode>('set');
  const [preview, setPreview] = useState<CollectionImportPreviewResponse | null>(
    null,
  );
  const [commitResult, setCommitResult] =
    useState<CollectionImportCommitResponse | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForFile = (file: File | null) => {
    setSelectedFile(file);
    setPreview(null);
    setCommitResult(null);
    setError(null);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    resetForFile(event.target.files?.[0] ?? null);
  };

  const handlePreview = async () => {
    if (!collectionId || !selectedFile) return;
    if (!selectedFile.name.match(/\.csv$/i)) {
      setError('Please choose a TCGPlayer collection .csv file.');
      return;
    }

    setIsPreviewing(true);
    setError(null);
    setCommitResult(null);
    try {
      const response = await api.previewCollectionImport(
        collectionId,
        selectedFile,
        mode,
      );
      setPreview(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Collection import preview failed');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleCommit = async () => {
    if (!collectionId || !selectedFile || !preview) return;

    setIsCommitting(true);
    setError(null);
    try {
      const response = await api.commitCollectionImport(
        collectionId,
        selectedFile,
        mode,
      );
      setCommitResult(response);
      setPreview(response);
      await onImportCommitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Collection import failed');
    } finally {
      setIsCommitting(false);
    }
  };

  const warnings = allWarnings(preview);
  const canCommit = Boolean(preview && selectedFile && collectionId && !isCommitting);

  return (
    <section className="collection-import-card" aria-label="Import to Owned Collection">
      <div className="collection-import-header">
        <div>
          <h3>Import to Owned Collection</h3>
          <p>
            Upload a TCGPlayer collection CSV to merge quantities into this owned collection. This never imports into Selling Inventory.
          </p>
        </div>
      </div>

      <div className="collection-import-controls">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileSelect}
          className="collection-import-file"
          aria-label="Owned collection CSV file"
        />
        <button
          type="button"
          className="button-secondary"
          onClick={() => fileInputRef.current?.click()}
        >
          Choose CSV
        </button>
        <span className="collection-import-file-name">
          {selectedFile ? selectedFile.name : 'No file selected'}
        </span>
        <button
          type="button"
          className="button-primary"
          onClick={handlePreview}
          disabled={!collectionId || !selectedFile || isPreviewing || isCommitting}
        >
          {isPreviewing ? 'Previewing…' : 'Preview Import'}
        </button>
      </div>

      <fieldset className="collection-import-mode" aria-label="Collection import mode">
        <legend>Import mode</legend>
        <label className="collection-import-mode-option">
          <input
            type="radio"
            name="collection-import-mode"
            value="set"
            checked={mode === 'set'}
            onChange={() => {
              setMode('set');
              setPreview(null);
              setCommitResult(null);
            }}
          />
          <span>
            <strong>Set quantities from CSV</strong>
            <small>
              Recommended for current TCGPlayer collection exports. Updates quantities for rows in this file; does not delete collection rows missing from the file.
            </small>
          </span>
        </label>
        <label className="collection-import-mode-option">
          <input
            type="radio"
            name="collection-import-mode"
            value="merge"
            checked={mode === 'merge'}
            onChange={() => {
              setMode('merge');
              setPreview(null);
              setCommitResult(null);
            }}
          />
          <span>
            <strong>Add to existing quantities</strong>
            <small>
              Adds CSV quantities on top of existing owned collection counts. Use only for new incremental acquisitions to avoid duplicates.
            </small>
          </span>
        </label>
      </fieldset>

      {error && <div className="import-result error">{error}</div>}

      {preview && (
        <div className="collection-import-preview" aria-label="Collection import preview">
          <div className="collection-import-selected-mode">
            Preview mode: <strong>{preview.mode === 'merge' ? 'Add to existing quantities' : 'Set quantities from CSV'}</strong>
          </div>

          <div className="collection-summary-grid collection-import-summary">
            <div className="collection-summary-card">
              <span>Rows Parsed</span>
              <strong>
                {preview.summary.parsedRows}/{preview.summary.totalRows}
              </strong>
            </div>
            <div className="collection-summary-card">
              <span>Total Qty</span>
              <strong>{preview.summary.totalQuantity}</strong>
            </div>
            <div className="collection-summary-card">
              <span>Matched / Created</span>
              <strong>
                {preview.summary.matchedCatalogRows}/{preview.summary.createdCatalogRows}
              </strong>
            </div>
            <div className="collection-summary-card warning">
              <span>Unresolved</span>
              <strong>{preview.summary.unresolvedRows}</strong>
            </div>
            <div className="collection-summary-card muted">
              <span>Normal Qty</span>
              <strong>{preview.summary.normalQuantity}</strong>
            </div>
            <div className="collection-summary-card muted">
              <span>Foil Qty</span>
              <strong>{preview.summary.foilQuantity}</strong>
            </div>
          </div>

          {warnings.length > 0 && (
            <details className="collection-import-warnings" open>
              <summary>{warnings.length} warning(s)</summary>
              <ul>
                {warnings.slice(0, 10).map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </details>
          )}

          {preview.rows.length > 0 && (
            <div className="table-container collection-import-rows">
              <table className="card-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Card</th>
                    <th>Set / #</th>
                    <th>Finish</th>
                    <th>Qty</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 10).map((row) => (
                    <tr key={`${row.rowNumber}-${row.productName}`}>
                      <td>{row.rowNumber}</td>
                      <td>{row.productName || '-'}</td>
                      <td>
                        {row.setName ?? '-'}{' '}
                        <span className="collection-muted">{row.number ?? ''}</span>
                      </td>
                      <td>{row.finish ?? '-'}</td>
                      <td>{row.quantity}</td>
                      <td>
                        <span className={`collection-import-status status-${row.status}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="collection-import-actions">
            <button
              type="button"
              className="button-primary"
              onClick={handleCommit}
              disabled={!canCommit}
            >
              {isCommitting ? 'Importing…' : 'Commit Import to Owned Collection'}
            </button>
            {commitResult && (
              <span className="collection-import-success">
                Imported. Inserted {commitResult.inserted}, updated {commitResult.updated}.
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
