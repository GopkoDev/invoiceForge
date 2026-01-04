interface ContactsDetailsContentLayoutProps {
  children: React.ReactNode;
}

export function ContactsDetailsContentLayout({
  children,
}: ContactsDetailsContentLayoutProps) {
  return <div className="xl:col-span-2 space-y-6 min-w-0">{children}</div>;
}
