import React, { useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Link2, Code, Quote, Heading1, Heading2, Heading3, Eraser
} from 'lucide-react';

interface RichEditorProps {
  value: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  className?: string;
}

// ─── Toolbar ────────────────────────────────────────────────────────────────

const Btn: React.FC<{
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, active, title, children }) => (
  <button
    type="button"
    title={title}
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    className={`p-1.5 rounded transition-colors ${
      active
        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
    }`}
  >
    {children}
  </button>
);

const Sep = () => (
  <span className="inline-block w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1 self-center" />
);

const Toolbar: React.FC<{ editor: Editor }> = ({ editor }) => {
  const addLink = useCallback(() => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL:', prev ?? '');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
    }
  }, [editor]);

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-800/60 rounded-t-lg">
      <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
        <Bold size={14} />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
        <Italic size={14} />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
        <UnderlineIcon size={14} />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
        <Strikethrough size={14} />
      </Btn>
      <Sep />
      <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
        <Heading1 size={14} />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
        <Heading2 size={14} />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
        <Heading3 size={14} />
      </Btn>
      <Sep />
      <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
        <List size={14} />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered List">
        <ListOrdered size={14} />
      </Btn>
      <Sep />
      <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">
        <Quote size={14} />
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code Block">
        <Code size={14} />
      </Btn>
      <Btn onClick={addLink} active={editor.isActive('link')} title="Link">
        <Link2 size={14} />
      </Btn>
      <Sep />
      <Btn onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Clear Formatting">
        <Eraser size={14} />
      </Btn>
    </div>
  );
};

// ─── RichEditor ──────────────────────────────────────────────────────────────

const EMPTY_HTML = '<p></p>';
const normalize = (h: string) => (h === EMPTY_HTML ? '' : h);

export const RichEditor = forwardRef<unknown, RichEditorProps>(
  ({ value, onChange, placeholder, className }, ref) => {
    const editor = useEditor({
      extensions: [
        StarterKit,
        Link.configure({ openOnClick: false }),
        Underline,
        Placeholder.configure({ placeholder: placeholder ?? '' }),
      ],
      content: value ?? '',
      onUpdate({ editor: e }) {
        onChange?.(normalize(e.getHTML()));
      },
    });

    // Sync when value is set externally (e.g. new AI output arrives)
    useEffect(() => {
      if (!editor) return;
      if (normalize(editor.getHTML()) !== normalize(value ?? '')) {
        editor.commands.setContent(value ?? '', { emitUpdate: false });
      }
    }, [value, editor]);

    useImperativeHandle(ref, () => ({ editor }));

    return (
      <div className={`rich-editor flex flex-col min-h-0 h-full ${className ?? ''}`}>
        {editor && <Toolbar editor={editor} />}
        <EditorContent editor={editor} className="rich-editor-body flex-1 min-h-0 overflow-y-auto custom-scrollbar" />
      </div>
    );
  }
);

RichEditor.displayName = 'RichEditor';
