interface ContactsGridProps {
  children: React.ReactNode;
}

export function ContactsGrid({ children }: ContactsGridProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">{children}</div>
  );
}
