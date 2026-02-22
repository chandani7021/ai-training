import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Layout } from '../../components/Layout';
import type { DocumentListItem, DocumentOut } from '../../types';

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function fetchDocuments(): Promise<DocumentListItem[]> {
  const { data } = await apiClient.get('/admin/documents');
  return data;
}

async function uploadDocument(file: File): Promise<DocumentOut> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post('/admin/documents', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

async function generateTraining(documentId: number): Promise<void> {
  await apiClient.post(`/admin/documents/${documentId}/generate-training`);
}

async function cancelTraining(documentId: number): Promise<void> {
  await apiClient.post(`/admin/documents/${documentId}/cancel-training`);
}

// ---------------------------------------------------------------------------
// Status badge component
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    uploaded: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    training_ready: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  };
  const label: Record<string, string> = {
    uploaded: 'Uploaded',
    processing: 'Processing…',
    training_ready: 'Ready',
    failed: 'Failed',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {label[status] ?? status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminDocuments() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState('');

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['admin', 'documents'],
    queryFn: fetchDocuments,
    // Only poll while at least one document is being processed.
    // This avoids unnecessary API calls when nothing is in-flight.
    refetchInterval: (query) => {
      const docs = query.state.data ?? [];
      return docs.some((d) => d.status === 'processing') ? 4000 : false;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: uploadDocument,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'documents'] });
      setUploadError('');
    },
    onError: () => setUploadError('Upload failed. Please try again.'),
  });

  const generateMutation = useMutation({
    mutationFn: generateTraining,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'documents'] }),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelTraining,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'documents'] }),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setUploadError('Only PDF files are accepted.');
      return;
    }
    uploadMutation.mutate(file);
    // reset input so the same file can be re-uploaded if needed
    e.target.value = '';
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">SOP Documents</h2>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-lg flex items-center gap-2 transition"
        >
          {uploadMutation.isPending ? 'Uploading…' : '+ Upload PDF'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {uploadError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {uploadError}
        </div>
      )}

      {isLoading && <p className="text-gray-500 text-sm">Loading documents…</p>}

      {!isLoading && documents.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No documents yet.</p>
          <p className="text-sm mt-1">Upload a SOP PDF to get started.</p>
        </div>
      )}

      <div className="space-y-3">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-3 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900 truncate">{doc.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(doc.created_at).toLocaleDateString()}
              </p>
              {doc.status === 'processing' && doc.progress_message && (
                <p className="text-xs text-blue-600 mt-1 animate-pulse">
                  {doc.progress_message}
                </p>
              )}
              {doc.status === 'failed' && doc.error_message && (
                <p className="text-xs text-red-600 mt-1 wrap-break-word" title={doc.error_message}>
                  Error: {doc.error_message.length > 120
                    ? doc.error_message.slice(0, 120) + '…'
                    : doc.error_message}
                </p>
              )}
            </div>
            <StatusBadge status={doc.status} />
            <div className="flex-shrink-0">
              {(doc.status === 'uploaded' || doc.status === 'failed') && (
                <button
                  onClick={() => generateMutation.mutate(doc.id)}
                  disabled={generateMutation.isPending}
                  className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg transition"
                >
                  {doc.status === 'failed' ? 'Retry' : 'Generate Training'}
                </button>
              )}
              {doc.status === 'training_ready' && doc.training_id && (
                <Link
                  to={`/admin/trainings/${doc.training_id}`}
                  className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition"
                >
                  View Training
                </Link>
              )}
              {doc.status === 'processing' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => cancelMutation.mutate(doc.id)}
                    disabled={cancelMutation.isPending}
                    className="text-sm bg-gray-200 hover:bg-gray-300 disabled:opacity-60 text-gray-700 px-3 py-1.5 rounded-lg transition"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}

