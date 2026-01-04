interface ContactsDetailsLayoutProps {
  children: React.ReactNode;
}

export function ContactsDetailsLayout({
  children,
}: ContactsDetailsLayoutProps) {
  return <div className="space-y-6">{children}</div>;
}
