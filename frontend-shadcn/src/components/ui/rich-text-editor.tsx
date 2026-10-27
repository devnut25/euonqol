import { cn } from '@/lib/tailwind/utils';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { type Ref, useEffect, useImperativeHandle, useMemo } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /** Exposes `focus()` (e.g. for RHF `field.ref`, so focus-on-error reaches the editor). */
  ref?: Ref<{ focus: () => void }>;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        'p-1.5 rounded text-sm transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'hover:bg-muted text-muted-foreground hover:text-foreground',
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  disabled,
  className,
  ref,
  id,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
}: Props) {
  // ARIA attributes of the contenteditable: TipTap only accepts string values here
  const attributes = useMemo(() => {
    // Min-height + padding live on the contenteditable itself, so the whole box is clickable
    const attrs: Record<string, string> = {
      role: 'textbox',
      'aria-multiline': 'true',
      class: 'min-h-[164px] px-3 py-2 outline-none',
    };
    if (id) attrs.id = id;
    if (ariaLabelledBy) attrs['aria-labelledby'] = ariaLabelledBy;
    else if (ariaLabel) attrs['aria-label'] = ariaLabel;
    if (ariaDescribedBy) attrs['aria-describedby'] = ariaDescribedBy;
    if (ariaInvalid) attrs['aria-invalid'] = 'true';
    if (ariaRequired) attrs['aria-required'] = 'true';
    return attrs;
  }, [id, ariaLabel, ariaLabelledBy, ariaDescribedBy, ariaInvalid, ariaRequired]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
    ],
    content: value,
    editable: !disabled,
    editorProps: { attributes },
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  // Sync external value changes (e.g. form reset)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value ?? '', { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({ editorProps: { attributes } });
  }, [attributes, editor]);

  useImperativeHandle(ref, () => ({ focus: () => editor?.commands.focus() }), [editor]);

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href ?? '';
    const url = window.prompt('URL', prev);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  return (
    <div
      aria-invalid={ariaInvalid}
      className={cn(
        'rounded-md border border-input bg-white text-sm shadow-sm transition-[color,box-shadow]',
        // Same focus indicator as Input, only while the text area (not the toolbar) has focus
        'has-[.tiptap:focus-visible]:border-ring has-[.tiptap:focus-visible]:ring-ring has-[.tiptap:focus-visible]:ring-[3px]',
        'aria-invalid:border-destructive aria-invalid:ring-destructive dark:aria-invalid:ring-destructive/40',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {/* Toolbar */}
      <div
        role="toolbar"
        aria-label="Formatting"
        aria-controls={id}
        className="flex flex-wrap items-center gap-0.5 border-b border-input px-2 py-1.5"
      >
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive('bold')}
          disabled={disabled}
          title="Bold"
        >
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive('italic')}
          disabled={disabled}
          title="Italic"
        >
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          active={editor?.isActive('underline')}
          disabled={disabled}
          title="Underline"
        >
          <UnderlineIcon size={14} />
        </ToolbarButton>

        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor?.isActive('heading', { level: 1 })}
          disabled={disabled}
          title="Heading 1"
        >
          <Heading1 size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor?.isActive('heading', { level: 2 })}
          disabled={disabled}
          title="Heading 2"
        >
          <Heading2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor?.isActive('heading', { level: 3 })}
          disabled={disabled}
          title="Heading 3"
        >
          <Heading3 size={14} />
        </ToolbarButton>

        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={editor?.isActive('bulletList')}
          disabled={disabled}
          title="Bullet list"
        >
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={editor?.isActive('orderedList')}
          disabled={disabled}
          title="Ordered list"
        >
          <ListOrdered size={14} />
        </ToolbarButton>

        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />

        <ToolbarButton
          onClick={setLink}
          active={editor?.isActive('link')}
          disabled={disabled}
          title="Insert link"
        >
          <LinkIcon size={14} />
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <EditorContent
        editor={editor}
        // No max height: the editor grows with its content so long texts stay readable
        className="prose-content"
      />
    </div>
  );
}
