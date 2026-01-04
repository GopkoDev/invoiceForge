interface ContactsDetailsSidebarProps {
  children: React.ReactNode;
}

export function ContactsDetailsSidebar({
  children,
}: ContactsDetailsSidebarProps) {
  return <div className="xl:col-span-1 min-w-0">{children}</div>;
}
