interface ContentAreaProps {
  children: React.ReactNode;
}

export function ContentArea(props: ContentAreaProps) {
  const { children } = props;
  return (
    <div className="container mx-auto space-y-4 p-2 md:p-4">{children}</div>
  );
}
