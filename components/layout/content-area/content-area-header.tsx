interface ContentAreaHeaderProps {
  title: string;
  description: string;
  rightContent?: React.ReactNode;
  leftContent?: React.ReactNode;
  badge?: React.ReactNode;
}

export function ContentAreaHeader(props: ContentAreaHeaderProps) {
  const { title, description, rightContent, leftContent, badge } = props;
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        {leftContent && leftContent}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            {badge && badge}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        </div>
      </div>
      {rightContent && rightContent}
    </div>
  );
}
