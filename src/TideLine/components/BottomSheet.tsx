import { useEffect } from 'react';

interface Props {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** A bottom sheet overlay scoped to the game column (absolute inset-0 inside the
 *  positioned .tl-root). Used for progressive disclosure — one focused task at a
 *  time instead of stacking everything on the detail screen. */
export default function BottomSheet({ title, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="tl-sheet" onClick={onClose}>
      <div className="tl-sheet__panel" onClick={e => e.stopPropagation()}>
        <div className="tl-sheet__handle" />
        {title && <div className="tl-sheet__title">{title}</div>}
        <div className="tl-sheet__body">{children}</div>
      </div>
    </div>
  );
}
