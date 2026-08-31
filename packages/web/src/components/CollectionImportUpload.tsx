import { FileUp, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';
import { api } from '../api/client';
import type {
  CollectionImportCommitResponse,
  CollectionImportPreviewResponse,
} from '../api/types';
import type { ResponsiveMode } from '../hooks/useContainerResponsiveMode';
import { BlueprintButton, BlueprintPanel } from '../ui';

interface CollectionImportUploadProps {
  collectionId: number | null;
  layout?: ResponsiveMode;
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
  layout = 'desktop',
  onImportCommitted,
}: CollectionImportUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CollectionImportPreviewResponse | null>(
    null,
  );
  const [commitResult, setCommitResult] =
    useState<CollectionImportCommitResponse | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRequestIdRef = useRef(0);

  const previewFile = async (
    file: File,
    targetCollectionId: number,
    requestId: number,
  ) => {
    try {
      const response = await api.previewCollectionImport(
        targetCollectionId,
        file,
        'merge',
      );
      if (previewRequestIdRef.current === requestId) {
        setPreview(response);
      }
    } catch (err) {
      if (previewRequestIdRef.current === requestId) {
        setError(err instanceof Error ? err.message : 'Collection import preview failed');
      }
    } finally {
      if (previewRequestIdRef.current === requestId) {
        setIsPreviewing(false);
      }
    }
  };

  const selectFile = (file: File | null) => {
    const requestId = ++previewRequestIdRef.current;
    setPreview(null);
    setCommitResult(null);
    setIsPreviewing(false);

    if (!file) {
      setSelectedFile(null);
      setError(null);
      return;
    }

    if (!file.name.match(/\.csv$/i)) {
      setSelectedFile(null);
      setError('Please choose a TCGPlayer collection .csv file.');
      return;
    }

    setSelectedFile(file);
    setError(null);
    if (!collectionId) {
      setError('Collection is still loading. Please select the CSV again once it is ready.');
      return;
    }

    setIsPreviewing(true);
    void previewFile(file, collectionId, requestId);
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    selectFile(file);
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragActive(false);
    selectFile(event.dataTransfer.files?.[0] ?? null);
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDropzoneKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInputRef.current?.click();
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
        'merge',
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
  const canCommit = Boolean(
    preview && selectedFile && collectionId && !isPreviewing && !isCommitting,
  );

  return (
    <BlueprintPanel
      className="collection-import-card"
      aria-label="Import to Owned Collection"
    >
      <div className="collection-import-header">
        <h3>Import to Owned Collection</h3>
      </div>

      <div
        className={`collection-import-dropzone ${dragActive ? 'active' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Open collection CSV file picker"
        aria-describedby="collection-import-dropzone-hint"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={handleDropzoneKeyDown}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragActive(false)}
      >
        <FileUp className="collection-import-upload-icon" aria-hidden="true" strokeWidth={1.5} />
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onClick={(event) => event.stopPropagation()}
          onChange={handleFileSelect}
          className="collection-import-file"
          aria-label="Owned collection CSV file"
        />
        <p className="collection-import-dropzone-text">
          Drop a TCGPlayer collection CSV here, or click to browse
        </p>
        <p id="collection-import-dropzone-hint" className="collection-import-dropzone-hint">
          CSV files only. A preview is generated automatically; nothing changes until you commit it.
        </p>
        <p className="collection-import-selected-file" aria-live="polite">
          {selectedFile ? `Selected: ${selectedFile.name}` : 'No file selected'}
        </p>
      </div>

      {isPreviewing && (
        <div className="collection-import-controls" role="status" aria-live="polite">
          Previewing collection CSV…
        </div>
      )}

      {error && (
        <div className="collection-import-result error" role="alert">
          <p>{error}</p>
        </div>
      )}

      {preview && (
        <div className="collection-import-preview" aria-label="Collection import preview">
          <p className="collection-import-selected-mode">
            Import behavior: Add imported quantities to Owned Collection after you commit.
          </p>

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

          {preview.rows.length > 0 &&
            (layout === 'phone' ? (
              <div className="collection-mobile-preview-list" aria-label="Import rows">
                {preview.rows.slice(0, 10).map((row) => (
                  <article
                    className="collection-mobile-preview-card"
                    key={`${row.rowNumber}-${row.productName}`}
                  >
                    <div className="collection-mobile-preview-card__header">
                      <strong>{row.productName || '-'}</strong>
                      <span className={`collection-import-status status-${row.status}`}>
                        {row.status}
                      </span>
                    </div>
                    <p className="collection-mobile-preview-card__meta">
                      Row {row.rowNumber} · {row.setName ?? '-'} {row.number ?? ''}
                    </p>
                    <p>
                      {row.finish ?? '-'} · Qty {row.quantity}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
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
            ))}

          <div className="collection-import-actions">
            <BlueprintButton
              variant="primary"
              onClick={handleCommit}
              disabled={!canCommit}
              icon={<Upload aria-hidden="true" strokeWidth={1.5} />}
            >
              {isCommitting ? 'Importing…' : 'Commit Import to Owned Collection'}
            </BlueprintButton>
            {commitResult && (
              <span className="collection-import-success" role="status">
                Imported. Inserted {commitResult.inserted}, updated {commitResult.updated}.
              </span>
            )}
          </div>
        </div>
      )}
    </BlueprintPanel>
  );
}
