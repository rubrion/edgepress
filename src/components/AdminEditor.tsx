import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';

type UploadResult = { url: string; key: string; kind: 'image' | 'video'; size: number };

const ACCEPTED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
]);

const uploadMedia = async (file: File): Promise<UploadResult> => {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/media/upload', {
    method: 'POST',
    credentials: 'same-origin',
    body: fd,
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string } & Partial<UploadResult>;
  if (!res.ok || !j.url) throw new Error(j.error ?? `upload failed (${res.status})`);
  return j as UploadResult;
};

const snippetFor = (r: UploadResult): string =>
  r.kind === 'image' ? `![](${r.url})` : `<video src="${r.url}" controls></video>`;

type RecentPost = {
  id: string;
  title: string;
  slug: string;
  contentMd: string;
  isPublished: boolean;
  publishedAt: string | null;
  lastSentAt: string | null;
};

type Props = {
  recent: RecentPost[];
  clientName: string;
};

type Draft = {
  id: string;
  title: string;
  slug: string;
  contentMd: string;
  isPublished: boolean;
  lastSentAt: string | null;
};

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const blank: Draft = {
  id: '',
  title: '',
  slug: '',
  contentMd: '',
  isPublished: false,
  lastSentAt: null,
};

const formatSentAt = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
};

export default function AdminEditor({ recent, clientName }: Props) {
  const [posts, setPosts] = useState<RecentPost[]>(recent);
  const [draft, setDraft] = useState<Draft>(blank);
  const [slugDirty, setSlugDirty] = useState(false);
  const [busy, setBusy] = useState<'idle' | 'saving' | 'publishing' | 'deleting' | 'uploading'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const insertAtCursor = (snippet: string) => {
    const ta = textareaRef.current;
    setDraft((d) => {
      const start = ta?.selectionStart ?? d.contentMd.length;
      const end = ta?.selectionEnd ?? d.contentMd.length;
      const before = d.contentMd.slice(0, start);
      const after = d.contentMd.slice(end);
      // Pad with a newline if we're not on a fresh line, so markdown blocks render cleanly.
      const sep = before.length === 0 || before.endsWith('\n') ? '' : '\n';
      const next = `${before}${sep}${snippet}\n${after}`;
      // Restore caret just after the inserted snippet on the next tick.
      const caret = before.length + sep.length + snippet.length + 1;
      queueMicrotask(() => {
        if (ta) {
          ta.focus();
          ta.setSelectionRange(caret, caret);
        }
      });
      return { ...d, contentMd: next };
    });
  };

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => ACCEPTED_MIME.has(f.type));
    if (list.length === 0) {
      setMessage('No supported files (jpg, png, webp, gif, svg, mp4, webm).');
      return;
    }
    setBusy('uploading');
    setMessage(`Uploading ${list.length} file${list.length === 1 ? '' : 's'}…`);
    let okCount = 0;
    let failMsg: string | null = null;
    for (const f of list) {
      try {
        const r = await uploadMedia(f);
        insertAtCursor(snippetFor(r));
        okCount++;
      } catch (err) {
        failMsg = err instanceof Error ? err.message : 'upload error';
      }
    }
    setBusy('idle');
    setMessage(
      failMsg
        ? `Uploaded ${okCount}/${list.length}. Last error: ${failMsg}`
        : `Uploaded ${okCount} file${okCount === 1 ? '' : 's'}.`,
    );
  };

  useEffect(() => {
    if (!slugDirty) {
      setDraft((d) => ({ ...d, slug: slugify(d.title) }));
    }
  }, [draft.title, slugDirty]);

  const previewHtml = useMemo(() => {
    if (!draft.contentMd) return '';
    return marked.parse(draft.contentMd, { async: false }) as string;
  }, [draft.contentMd]);

  const isExisting = !!draft.id;
  const wasSent = !!draft.lastSentAt;

  const loadPost = (p: RecentPost) => {
    setDraft({
      id: p.id,
      title: p.title,
      slug: p.slug,
      contentMd: p.contentMd,
      isPublished: p.isPublished,
      lastSentAt: p.lastSentAt,
    });
    setSlugDirty(true);
    setMessage(null);
  };

  const newPost = () => {
    setDraft(blank);
    setSlugDirty(false);
    setMessage(null);
  };

  const submit = async (publish: boolean) => {
    if (!draft.title.trim() || !draft.contentMd.trim()) {
      setMessage('Title and content required.');
      return;
    }
    setBusy(publish ? 'publishing' : 'saving');
    setMessage(null);
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          id: draft.id || undefined,
          title: draft.title,
          slug: draft.slug || slugify(draft.title),
          content_md: draft.contentMd,
          publish,
        }),
      });
      const json = (await res.json()) as {
        post?: {
          id: string;
          title: string;
          slug: string;
          contentMd: string;
          isPublished: boolean;
          publishedAt: string | null;
        };
        campaign?: { sentAt: string; status: string } | null;
        dispatch?: { sent: number; failed: number } | null;
        alreadySent?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setMessage(json.error ?? `failed (${res.status})`);
        return;
      }
      if (!json.post) return;

      const sentAtIso =
        json.campaign && (json.campaign.status === 'sent' || json.campaign.status === 'partial')
          ? json.campaign.sentAt
          : draft.lastSentAt;

      const updatedDraft: Draft = {
        id: json.post.id,
        title: json.post.title,
        slug: json.post.slug,
        contentMd: json.post.contentMd,
        isPublished: json.post.isPublished,
        lastSentAt: sentAtIso,
      };
      setDraft(updatedDraft);
      setSlugDirty(true);

      const updatedPost: RecentPost = {
        ...updatedDraft,
        publishedAt: json.post.publishedAt ?? null,
      };
      setPosts((curr) => [updatedPost, ...curr.filter((x) => x.id !== updatedPost.id)]);

      if (json.alreadySent) {
        setMessage('Updated. Email was already delivered earlier — not re-sending.');
      } else if (json.dispatch) {
        setMessage(
          `Sent to ${json.dispatch.sent} subscriber${json.dispatch.sent === 1 ? '' : 's'}, ${json.dispatch.failed} failed.`,
        );
      } else if (publish) {
        setMessage('Published.');
      } else {
        setMessage(isExisting ? 'Updated.' : 'Saved as draft.');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setBusy('idle');
    }
  };

  const handleDelete = async () => {
    if (!draft.id) return;
    const ok = window.confirm(
      `Delete "${draft.title || 'untitled'}"? This cannot be undone.`,
    );
    if (!ok) return;
    setBusy('deleting');
    setMessage(null);
    try {
      const res = await fetch(`/api/posts/${draft.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage(j.error ?? `failed (${res.status})`);
        return;
      }
      const deletedId = draft.id;
      setPosts((curr) => curr.filter((p) => p.id !== deletedId));
      setDraft(blank);
      setSlugDirty(false);
      setMessage('Deleted.');
    } finally {
      setBusy('idle');
    }
  };

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.href = '/admin/login';
  };

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <strong>{clientName}</strong>
          <button onClick={logout} style={styles.linkBtn}>
            sign out
          </button>
        </div>
        <button onClick={newPost} style={styles.newBtn}>
          + New post
        </button>
        <div style={styles.list}>
          {posts.length === 0 && <p style={styles.muted}>No posts yet.</p>}
          {posts.map((p) => (
            <button
              key={p.id}
              onClick={() => loadPost(p)}
              style={{
                ...styles.listItem,
                ...(draft.id === p.id ? styles.listItemActive : null),
              }}
            >
              <span style={styles.listTitle}>{p.title || '(untitled)'}</span>
              <span style={styles.listMeta}>
                {p.lastSentAt
                  ? `✓ sent ${formatSentAt(p.lastSentAt)}`
                  : p.isPublished
                    ? '● published'
                    : '○ draft'}
              </span>
            </button>
          ))}
        </div>
      </aside>
      <main style={styles.main}>
        <div style={styles.fields}>
          <input
            type="text"
            placeholder="Post title"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            style={styles.titleInput}
          />
          <input
            type="text"
            placeholder="slug"
            value={draft.slug}
            onChange={(e) => {
              setSlugDirty(true);
              setDraft((d) => ({ ...d, slug: e.target.value }));
            }}
            style={styles.slugInput}
          />
        </div>
        <div style={styles.toolbar}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy === 'uploading'}
            style={styles.toolBtn}
          >
            {busy === 'uploading' ? 'Uploading…' : '+ Image / video'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,video/mp4,video/webm"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void handleFiles(e.target.files);
              }
              e.target.value = '';
            }}
          />
          <span style={styles.toolHint}>drag-drop or paste files into the editor</span>
        </div>
        <div style={styles.split}>
          <textarea
            ref={textareaRef}
            placeholder="Write in markdown…"
            value={draft.contentMd}
            onChange={(e) => setDraft((d) => ({ ...d, contentMd: e.target.value }))}
            onDragOver={(e) => {
              if (e.dataTransfer?.types?.includes('Files')) {
                e.preventDefault();
                setDragOver(true);
              }
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                e.preventDefault();
                setDragOver(false);
                void handleFiles(e.dataTransfer.files);
              }
            }}
            onPaste={(e) => {
              const files = e.clipboardData?.files;
              if (files && files.length > 0) {
                e.preventDefault();
                void handleFiles(files);
              }
            }}
            style={{
              ...styles.textarea,
              ...(dragOver ? styles.textareaDrop : null),
            }}
            spellCheck
          />
          <div style={styles.preview} dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
        <div style={styles.actions}>
          {message && <span style={styles.message}>{message}</span>}
          {wasSent && draft.lastSentAt && (
            <span style={styles.sentBadge}>✓ Sent {formatSentAt(draft.lastSentAt)}</span>
          )}
          <div style={{ flex: 1 }} />
          {isExisting && (
            <button
              onClick={handleDelete}
              disabled={busy !== 'idle'}
              style={styles.btnDanger}
            >
              {busy === 'deleting' ? 'Deleting…' : 'Delete'}
            </button>
          )}
          <button
            onClick={() => submit(false)}
            disabled={busy !== 'idle'}
            style={styles.btnSecondary}
          >
            {busy === 'saving'
              ? 'Saving…'
              : isExisting
                ? 'Update post'
                : 'Save draft'}
          </button>
          {!wasSent && (
            <button
              onClick={() => submit(true)}
              disabled={busy !== 'idle'}
              style={styles.btnPrimary}
            >
              {busy === 'publishing' ? 'Publishing…' : 'Publish + Send'}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: { display: 'grid', gridTemplateColumns: '260px 1fr', height: '100vh' },
  sidebar: { borderRight: '1px solid #e5e5e8', padding: '1rem', display: 'flex', flexDirection: 'column', background: '#fafafb' },
  sidebarHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  newBtn: { padding: '0.6rem', background: 'var(--theme)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginBottom: '1rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto', flex: 1 },
  listItem: { textAlign: 'left', padding: '0.6rem 0.75rem', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  listItemActive: { background: '#fff', boxShadow: '0 0 0 1px #e5e5e8' },
  listTitle: { fontSize: '0.9rem', fontWeight: 500 },
  listMeta: { fontSize: '0.75rem', color: '#888' },
  linkBtn: { background: 'transparent', border: 'none', color: '#888', fontSize: '0.8rem', cursor: 'pointer' },
  muted: { color: '#888', fontSize: '0.85rem' },
  main: { display: 'flex', flexDirection: 'column', height: '100vh' },
  fields: { display: 'flex', gap: '0.5rem', padding: '1rem', borderBottom: '1px solid #e5e5e8', background: '#fff' },
  titleInput: { flex: 1, fontSize: '1.25rem', fontWeight: 600, border: 'none', outline: 'none', padding: '0.5rem' },
  slugInput: { width: 220, fontSize: '0.9rem', color: '#666', border: '1px solid #e5e5e8', borderRadius: 6, padding: '0.5rem 0.75rem' },
  toolbar: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', borderBottom: '1px solid #e5e5e8', background: '#fff' },
  toolBtn: { padding: '0.35rem 0.7rem', fontSize: '0.85rem', background: '#fff', color: '#1a1a1a', border: '1px solid #e5e5e8', borderRadius: 6, cursor: 'pointer' },
  toolHint: { fontSize: '0.75rem', color: '#888' },
  split: { flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' },
  textarea: { padding: '1rem', border: 'none', borderRight: '1px solid #e5e5e8', outline: 'none', resize: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.95rem', lineHeight: 1.6 },
  textareaDrop: { background: '#f0f7ff', boxShadow: 'inset 0 0 0 2px var(--theme)' },
  preview: { padding: '1rem 1.5rem', overflowY: 'auto', background: '#fff', lineHeight: 1.6 },
  actions: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderTop: '1px solid #e5e5e8', background: '#fff' },
  message: { fontSize: '0.85rem', color: '#555' },
  sentBadge: { fontSize: '0.8rem', color: '#3a7d44', background: '#eaf6ec', padding: '0.25rem 0.6rem', borderRadius: 999 },
  btnSecondary: { padding: '0.5rem 1rem', background: '#fff', color: '#1a1a1a', border: '1px solid #e5e5e8', borderRadius: 6, cursor: 'pointer' },
  btnDanger: { padding: '0.5rem 1rem', background: '#fff', color: '#c1121f', border: '1px solid #f3c4c4', borderRadius: 6, cursor: 'pointer' },
  btnPrimary: { padding: '0.5rem 1.25rem', background: 'var(--theme)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
};
