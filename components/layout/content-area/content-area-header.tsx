interface ContentAreaHeaderProps {
  title: string;
  description: string;
  rightContent?: React.ReactNode;
}

export function ContentAreaHeader(props: ContentAreaHeaderProps) {
  const { title, description, rightContent } = props;
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm mt-1">{description}</p>
      </div>
      {rightContent && rightContent}
    </div>
  );
}
