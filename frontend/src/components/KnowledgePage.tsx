import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import type { KnowledgeCollection, KnowledgeDocument, KnowledgeChunk } from '@/types';
import {
    getDocumentsByCollection,
    getChunksByCollection,
    saveCollection,
    saveDocument,
    saveChunks,
} from '@/services/db';
import {
    addDocument,
    deleteDocument as managerDeleteDocument,
} from '@/services/knowledge/manager';
import CollectionFormModal from './CollectionFormModal';

const ACCENT = '#C9A96E';

// ─── KnowledgePage ────────────────────────────────────────────────────────────

export default function KnowledgePage() {
    const { collections, loadCollections, removeCollection } = useAppStore();

    const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingCollection, setEditingCollection] = useState<KnowledgeCollection | null>(null);
    const [importStatus, setImportStatus] = useState<string | null>(null);

    const importInputRef = useRef<HTMLInputElement>(null);

    const selectedCollection = collections.find(c => c.id === selectedCollectionId) ?? null;

    const openCreate = () => {
        setEditingCollection(null);
        setModalOpen(true);
    };

    const openEdit = (collection: KnowledgeCollection) => {
        setEditingCollection(collection);
        setModalOpen(true);
    };

    const handleDelete = async (collection: KnowledgeCollection) => {
        if (!confirm(`Delete collection "${collection.name}" and all its documents?`)) return;
        await removeCollection(collection.id);
        if (selectedCollectionId === collection.id) setSelectedCollectionId(null);
    };

    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Reset input so the same file can be re-imported
        e.target.value = '';
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const raw = JSON.parse(reader.result as string) as ImportExportData;
                if (raw.version !== 1) {
                    setImportStatus('Import failed: unsupported version');
                    return;
                }
                if (!raw.collection || !Array.isArray(raw.documents) || !Array.isArray(raw.chunks)) {
                    setImportStatus('Import failed: invalid file structure');
                    return;
                }
                runImport(raw);
            } catch {
                setImportStatus('Import failed: could not parse file');
            }
        };
        reader.readAsText(file);
    };

    const runImport = async (data: ImportExportData) => {
        try {
        const { collection, documents, chunks } = data;
        const docCount = documents.length;

        // Assign new UUIDs and build ID mapping tables
        const newCollectionId = crypto.randomUUID();
        const docIdMap = new Map<string, string>();
        const chunkIdMap = new Map<string, string>();

        for (const doc of documents) {
            docIdMap.set(doc.id, crypto.randomUUID());
        }
        for (const chunk of chunks) {
            chunkIdMap.set(chunk.id, crypto.randomUUID());
        }

        const newCollection: KnowledgeCollection = {
            ...collection,
            id: newCollectionId,
            createdAt: new Date(collection.createdAt),
            updatedAt: new Date(),
        };

        // Warn if the embedding provider from the exported collection is not available
        const providers = useAppStore.getState().providers;
        const providerExists = providers.some(
            p => p.id === collection.embeddingProviderId && p.enabled
        );
        const providerWarning = providerExists
            ? ''
            : ' Warning: embedding provider not found — you may need to re-index after import.';

        setImportStatus(`Importing… (0/${docCount})`);
        await saveCollection(newCollection);

        const allNewChunks: KnowledgeChunk[] = [];

        for (let i = 0; i < documents.length; i++) {
            const doc = documents[i];
            const newDocId = docIdMap.get(doc.id)!;
            setImportStatus(`Importing… (${i + 1}/${docCount})`);

            const newDoc: KnowledgeDocument = {
                ...doc,
                id: newDocId,
                collectionId: newCollectionId,
                createdAt: new Date(doc.createdAt),
            };
            await saveDocument(newDoc);

            const docChunks = chunks.filter(c => c.documentId === doc.id);
            for (const chunk of docChunks) {
                allNewChunks.push({
                    ...chunk,
                    id: chunkIdMap.get(chunk.id)!,
                    documentId: newDocId,
                    collectionId: newCollectionId,
                    // Reconstruct Float32Array from number[] stored in JSON
                    embedding: new Float32Array(chunk.embedding as unknown as number[]),
                });
            }
        }

        if (allNewChunks.length > 0) {
            await saveChunks(allNewChunks);
        }

        await loadCollections();
        setImportStatus(`Imported ${docCount} document${docCount === 1 ? '' : 's'}.${providerWarning}`);
        setTimeout(() => setImportStatus(null), providerWarning ? 8000 : 4000);
        } catch (err) {
            setImportStatus(`Import failed: ${err instanceof Error ? err.message : 'unknown error'}`);
        }
    };

    return (
        <div style={{
            minHeight: '100%',
            background: '#07050c',
            overflowY: 'auto',
        }}>
            {selectedCollection ? (
                <DetailView
                    collection={selectedCollection}
                    onBack={() => setSelectedCollectionId(null)}
                    onEdit={openEdit}
                />
            ) : (
                <GridView
                    collections={collections}
                    importStatus={importStatus}
                    importInputRef={importInputRef}
                    onSelect={setSelectedCollectionId}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onNew={openCreate}
                    onImportClick={() => importInputRef.current?.click()}
                    onImportFile={handleImportFile}
                />
            )}

            {modalOpen && (
                <CollectionFormModal
                    collection={editingCollection}
                    onClose={() => setModalOpen(false)}
                />
            )}
        </div>
    );
}

// ─── Grid View ────────────────────────────────────────────────────────────────

interface GridViewProps {
    collections: KnowledgeCollection[];
    importStatus: string | null;
    importInputRef: React.RefObject<HTMLInputElement | null>;
    onSelect: (id: string) => void;
    onEdit: (c: KnowledgeCollection) => void;
    onDelete: (c: KnowledgeCollection) => void;
    onNew: () => void;
    onImportClick: () => void;
    onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function GridView({
    collections,
    importStatus,
    importInputRef,
    onSelect,
    onEdit,
    onDelete,
    onNew,
    onImportClick,
    onImportFile,
}: GridViewProps) {
    return (
        <div style={{ padding: '40px 20px 100px' }}>
            {/* Header */}
            <div style={{ marginBottom: 32 }}>
                <h1 style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontSize: 28,
                    color: '#fff',
                    fontWeight: 400,
                    margin: '0 0 6px',
                }}>
                    Knowledge
                </h1>
                <p style={{
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.3)',
                    letterSpacing: '0.25em',
                    textTransform: 'uppercase',
                    fontFamily: "'Courier New', monospace",
                    margin: 0,
                }}>
                    document collections for RAG
                </p>
            </div>

            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                <button onClick={onNew} style={primaryBtnStyle()}>
                    + New Collection
                </button>
                <button onClick={onImportClick} style={secondaryBtnStyle()}>
                    Import Collection
                </button>
                <input
                    ref={importInputRef}
                    type="file"
                    accept=".json"
                    style={{ display: 'none' }}
                    onChange={onImportFile}
                />
            </div>

            {/* Import status message */}
            {importStatus && (
                <div style={{
                    marginBottom: 16,
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: `1px solid ${ACCENT}40`,
                    background: `${ACCENT}10`,
                    fontSize: 13,
                    color: ACCENT,
                    fontFamily: "'Courier New', monospace",
                }}>
                    {importStatus}
                </div>
            )}

            {/* Empty state */}
            {collections.length === 0 && (
                <div style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'rgba(255,255,255,0.25)',
                    fontSize: 14,
                    fontStyle: 'italic',
                }}>
                    No collections yet — create one to get started.
                </div>
            )}

            {/* Collection cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {collections.map(c => (
                    <CollectionCard
                        key={c.id}
                        collection={c}
                        onOpen={() => onSelect(c.id)}
                        onEdit={() => onEdit(c)}
                        onDelete={() => onDelete(c)}
                    />
                ))}
            </div>
        </div>
    );
}

// ─── Collection Card ──────────────────────────────────────────────────────────

function CollectionCard({
    collection,
    onOpen,
    onEdit,
    onDelete,
}: {
    collection: KnowledgeCollection;
    onOpen: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const desc = collection.description
        ? collection.description.length > 60
            ? collection.description.slice(0, 60) + '…'
            : collection.description
        : null;

    return (
        <div style={{
            padding: '16px',
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(255,255,255,0.03)',
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, color: '#fff', fontWeight: 500, marginBottom: 3 }}>
                        {collection.name}
                    </div>
                    {desc && (
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
                            {desc}
                        </div>
                    )}
                    <div style={{
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.25)',
                        fontFamily: "'Courier New', monospace",
                    }}>
                        {collection.embeddingModelSlug} &middot; dim {collection.embeddingDimension}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={onOpen} style={primaryBtnStyle({ compact: true })}>
                    Open
                </button>
                <button onClick={onEdit} style={secondaryBtnStyle({ compact: true })}>
                    Edit
                </button>
                <button onClick={onDelete} style={dangerBtnStyle({ compact: true })}>
                    Delete
                </button>
            </div>
        </div>
    );
}

// ─── Detail View ──────────────────────────────────────────────────────────────

function DetailView({
    collection,
    onBack,
    onEdit,
}: {
    collection: KnowledgeCollection;
    onBack: () => void;
    onEdit: (c: KnowledgeCollection) => void;
}) {
    const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
    const [pasteOpen, setPasteOpen] = useState(false);
    const [pasteName, setPasteName] = useState('');
    const [pasteContent, setPasteContent] = useState('');
    const [pasteSubmitting, setPasteSubmitting] = useState(false);
    const [exporting, setExporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const loadDocuments = async () => {
        const docs = await getDocumentsByCollection(collection.id);
        setDocuments(docs);
    };

    // Poll while any document is pending
    useEffect(() => {
        loadDocuments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collection.id]);

    useEffect(() => {
        const hasPending = documents.some(d => d.status === 'pending');
        if (hasPending && !pollRef.current) {
            pollRef.current = setInterval(loadDocuments, 2000);
        } else if (!hasPending && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documents]);

    useEffect(() => {
        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        };
    }, []);

    const handleDeleteDoc = async (docId: string) => {
        if (!confirm('Delete this document and all its chunks?')) return;
        await managerDeleteDocument(docId);
        await loadDocuments();
    };

    const handleFileDrop = async (files: FileList) => {
        const allowed = Array.from(files).filter(f => f.name.endsWith('.md') || f.name.endsWith('.txt'));
        for (const file of allowed) {
            const content = await file.text();
            await addDocument(collection.id, file.name, content);
        }
        await loadDocuments();
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) handleFileDrop(e.target.files);
        e.target.value = '';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files) handleFileDrop(e.dataTransfer.files);
    };

    const handlePasteSubmit = async () => {
        if (!pasteName.trim() || !pasteContent.trim()) return;
        setPasteSubmitting(true);
        try {
            await addDocument(collection.id, pasteName.trim(), pasteContent.trim());
            setPasteName('');
            setPasteContent('');
            setPasteOpen(false);
            await loadDocuments();
        } finally {
            setPasteSubmitting(false);
        }
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const docs = await getDocumentsByCollection(collection.id);
            const allChunks = await getChunksByCollection(collection.id);

            const exportData = {
                version: 1,
                collection,
                documents: docs,
                chunks: allChunks.map(c => ({ ...c, embedding: Array.from(c.embedding) })),
            };

            const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            try {
                const a = document.createElement('a');
                a.href = url;
                a.download = `${collection.name.replace(/\s+/g, '-').toLowerCase()}-export.json`;
                a.click();
            } finally {
                URL.revokeObjectURL(url);
            }
        } finally {
            setExporting(false);
        }
    };

    const totalChunks = documents.reduce((sum, d) => sum + d.chunkCount, 0);

    return (
        <div style={{ padding: '24px 20px 100px' }}>
            {/* Back nav */}
            <button
                onClick={onBack}
                style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: 13,
                    cursor: 'pointer',
                    padding: '0 0 16px',
                    fontFamily: "'Courier New', monospace",
                    letterSpacing: '0.05em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                }}
            >
                ← Back
            </button>

            {/* Header */}
            <div style={{ marginBottom: 20 }}>
                <h2 style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontSize: 24,
                    color: '#fff',
                    fontWeight: 400,
                    margin: '0 0 8px',
                }}>
                    {collection.name}
                </h2>
                {collection.description && (
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 10px' }}>
                        {collection.description}
                    </p>
                )}
                <div style={{
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.25)',
                    fontFamily: "'Courier New', monospace",
                    marginBottom: 12,
                }}>
                    {documents.length} doc{documents.length !== 1 ? 's' : ''} &middot; {totalChunks} chunks &middot; {collection.embeddingModelSlug}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => onEdit(collection)} style={secondaryBtnStyle({ compact: true })}>
                        Edit Collection
                    </button>
                    <button onClick={handleExport} disabled={exporting} style={secondaryBtnStyle({ compact: true })}>
                        {exporting ? 'Exporting…' : 'Export Collection'}
                    </button>
                </div>
            </div>

            {/* Drop zone */}
            <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                    padding: '24px',
                    borderRadius: 14,
                    border: '2px dashed rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.02)',
                    textAlign: 'center',
                    cursor: 'pointer',
                    marginBottom: 16,
                    transition: 'border-color 0.2s ease',
                }}
            >
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
                    Drop .md / .txt files here, or click to browse
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.txt"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleFileInput}
                />
            </div>

            {/* Paste text button */}
            {!pasteOpen && (
                <button
                    onClick={() => setPasteOpen(true)}
                    style={{ ...secondaryBtnStyle(), marginBottom: 20 }}
                >
                    Paste Text
                </button>
            )}

            {/* Paste text inline form */}
            {pasteOpen && (
                <div style={{
                    padding: 16,
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                    marginBottom: 20,
                }}>
                    <input
                        type="text"
                        value={pasteName}
                        onChange={e => setPasteName(e.target.value)}
                        placeholder="Document name…"
                        style={{ ...inlineInputStyle(), marginBottom: 10 }}
                        autoFocus
                    />
                    <textarea
                        value={pasteContent}
                        onChange={e => setPasteContent(e.target.value)}
                        placeholder="Paste text content here…"
                        rows={6}
                        style={{ ...inlineInputStyle(), resize: 'vertical', lineHeight: 1.6, marginBottom: 10 }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={() => { setPasteOpen(false); setPasteName(''); setPasteContent(''); }}
                            style={secondaryBtnStyle({ compact: true })}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handlePasteSubmit}
                            disabled={!pasteName.trim() || !pasteContent.trim() || pasteSubmitting}
                            style={primaryBtnStyle({ compact: true })}
                        >
                            {pasteSubmitting ? '…' : 'Add Document'}
                        </button>
                    </div>
                </div>
            )}

            {/* Document list */}
            <div style={{ marginBottom: 8 }}>
                <div style={{
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.3)',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    fontFamily: "'Courier New', monospace",
                    marginBottom: 12,
                }}>
                    Documents
                </div>

                {documents.length === 0 && (
                    <div style={{
                        fontSize: 13,
                        color: 'rgba(255,255,255,0.25)',
                        fontStyle: 'italic',
                        padding: '16px 0',
                    }}>
                        No documents yet.
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {documents.map(doc => (
                        <DocumentRow
                            key={doc.id}
                            doc={doc}
                            onDelete={() => handleDeleteDoc(doc.id)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Document Row ─────────────────────────────────────────────────────────────

function DocumentRow({ doc, onDelete }: { doc: KnowledgeDocument; onDelete: () => void }) {
    const statusColour =
        doc.status === 'indexed' ? '#8DBF7A' :
        doc.status === 'error' ? '#D4706A' :
        ACCENT;

    const statusLabel =
        doc.status === 'indexed' ? 'indexed' :
        doc.status === 'error' ? 'error' :
        'indexing…';

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)',
        }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: 13,
                    color: '#fff',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginBottom: 3,
                }}>
                    {doc.name}
                </div>
                {doc.status === 'error' && doc.errorMessage && (
                    <div style={{ fontSize: 10, color: '#D4706A', marginBottom: 3 }}>
                        {doc.errorMessage}
                    </div>
                )}
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: "'Courier New', monospace" }}>
                    {doc.chunkCount} chunk{doc.chunkCount !== 1 ? 's' : ''}
                </div>
            </div>
            <span style={{
                fontSize: 10,
                color: statusColour,
                border: `1px solid ${statusColour}50`,
                borderRadius: 6,
                padding: '2px 7px',
                fontFamily: "'Courier New', monospace",
                letterSpacing: '0.05em',
                flexShrink: 0,
            }}>
                {statusLabel}
            </span>
            <button
                onClick={onDelete}
                style={{
                    background: 'none',
                    border: '1px solid rgba(212,112,106,0.3)',
                    borderRadius: 6,
                    color: '#D4706A',
                    fontSize: 11,
                    cursor: 'pointer',
                    padding: '4px 10px',
                    flexShrink: 0,
                    fontFamily: "'Courier New', monospace",
                }}
            >
                Delete
            </button>
        </div>
    );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

function primaryBtnStyle(opts?: { compact?: boolean }): React.CSSProperties {
    return {
        padding: opts?.compact ? '8px 14px' : '11px 20px',
        borderRadius: 10,
        border: 'none',
        background: ACCENT,
        color: '#07050c',
        fontSize: opts?.compact ? 12 : 13,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: "'Courier New', monospace",
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap',
    };
}

function secondaryBtnStyle(opts?: { compact?: boolean }): React.CSSProperties {
    return {
        padding: opts?.compact ? '8px 14px' : '11px 20px',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'transparent',
        color: 'rgba(255,255,255,0.6)',
        fontSize: opts?.compact ? 12 : 13,
        cursor: 'pointer',
        fontFamily: "'Courier New', monospace",
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap',
    };
}

function dangerBtnStyle(opts?: { compact?: boolean }): React.CSSProperties {
    return {
        padding: opts?.compact ? '8px 14px' : '11px 20px',
        borderRadius: 10,
        border: '1px solid rgba(212,112,106,0.3)',
        background: 'transparent',
        color: '#D4706A',
        fontSize: opts?.compact ? 12 : 13,
        cursor: 'pointer',
        fontFamily: "'Courier New', monospace",
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap',
    };
}

function inlineInputStyle(): React.CSSProperties {
    return {
        width: '100%',
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.05)',
        color: '#fff',
        fontSize: 13,
        outline: 'none',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
    };
}

// ─── Import/Export shape ──────────────────────────────────────────────────────

interface ImportExportData {
    version: number;
    collection: KnowledgeCollection;
    documents: KnowledgeDocument[];
    chunks: Array<Omit<KnowledgeChunk, 'embedding'> & { embedding: number[] | Float32Array }>;
}
