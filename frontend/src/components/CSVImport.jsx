import React, { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle, X, FileText } from 'lucide-react';
import { api } from '../utils/api';

export function CSVImport({ onImport, onClose }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  function handleFile(f) {
    if (f && f.name.endsWith('.csv')) setFile(f);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  async function doImport() {
    if (!file) return;
    setLoading(true);
    try {
      const res = await api.importCSV(file);
      setResult(res);
      if (res.imported > 0) onImport();
    } catch (e) {
      setResult({ imported: 0, errors: [e.message] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Import from CSV</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="csv-info">
          <p>CSV columns: <code>ticker, shares, avg_cost</code> (required) + optional <code>currency</code></p>
          <p className="csv-example">Example: <code>AAPL,10,175.50</code> or <code>SPY,5.5,420.00,USD</code></p>
        </div>

        {!result ? (
          <>
            <div
              className={`drop-zone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files[0])}
              />
              {file ? (
                <>
                  <FileText size={32} />
                  <p className="drop-filename">{file.name}</p>
                  <p className="drop-hint">Click to change file</p>
                </>
              ) : (
                <>
                  <Upload size={32} />
                  <p>Drop your CSV here or click to browse</p>
                  <p className="drop-hint">Only .csv files supported</p>
                </>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={doImport} disabled={!file || loading}>
                {loading ? 'Importing…' : 'Import'}
              </button>
            </div>
          </>
        ) : (
          <div className="import-result">
            {result.imported > 0 && (
              <div className="result-success">
                <CheckCircle size={20} />
                <span>{result.imported} position{result.imported !== 1 ? 's' : ''} imported successfully</span>
              </div>
            )}
            {result.errors?.length > 0 && (
              <div className="result-errors">
                <AlertCircle size={16} />
                <div>
                  <strong>{result.errors.length} row{result.errors.length !== 1 ? 's' : ''} skipped:</strong>
                  {result.errors.map((e, i) => <p key={i} className="error-line">{e}</p>)}
                </div>
              </div>
            )}
            <button className="btn-primary" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
