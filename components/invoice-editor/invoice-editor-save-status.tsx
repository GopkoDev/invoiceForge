import { Check, Circle } from 'lucide-react';

interface SaveStatusProps {
  isNew: boolean;
  isSaved: boolean;
}

const map = {
  saved: {
    text: 'Saved',
    icon: Check,
    iconClass: 'text-muted-foreground h-4 w-4',
    textClass: 'text-muted-foreground',
  },
  unsaved: {
    text: 'Unsaved',
    icon: Circle,
    iconClass: 'fill-destructive text-destructive h-3 w-3',
    textClass: 'text-destructive font-medium',
  },
};

export function EditorSaveStatus({ isNew, isSaved }: SaveStatusProps) {
  if (isNew && isSaved) return null;

  const statusKey = isSaved ? 'saved' : 'unsaved';
  const { icon: Icon, iconClass, textClass, text } = map[statusKey];

  return (
    <>
      {/* Desktop */}
      <div className="hidden items-center gap-1.5 text-sm sm:flex">
        <Icon className={iconClass} />
        <span className={textClass}>{text}</span>
      </div>

      {/* Mobile */}
      <div className="flex items-center sm:hidden">
        <Icon className={iconClass} />
      </div>
    </>
  );
}
