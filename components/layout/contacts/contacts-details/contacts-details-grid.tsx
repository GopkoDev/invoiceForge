interface ContactsDetailsGridProps {
  children: React.ReactNode;
}

export function ContactsDetailsGrid({ children }: ContactsDetailsGridProps) {
  return <div className="grid gap-6 xl:grid-cols-3">{children}</div>;
}
