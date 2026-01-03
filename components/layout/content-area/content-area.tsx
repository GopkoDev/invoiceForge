interface ContentAreaProps {
  children: React.ReactNode;
}

export function ContentArea(props: ContentAreaProps) {
  const { children } = props;
  return (
    <div className="container mx-auto space-y-4 p-2 md:p-4">{children}</div>
  );
}

interface ContentAreaHeaderProps {
  title: string;
  description?: string;
  rightContent?: React.ReactNode;
}

export function ContentAreaHeader(props: ContentAreaHeaderProps) {
  const { title, description, rightContent } = props;
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground text-sm mt-1">{description}</p>
        )}
      </div>
      {rightContent && rightContent}
    </div>
  );
}
