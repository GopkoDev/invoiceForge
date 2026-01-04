import {
  ContactsDetailsLayout,
  ContactsDetailsHeaderLoading,
  ContactsDetailsGrid,
  ContactsDetailsSidebar,
  ContactsDetailsSidebarLoading,
  ContactsDetailsContentLayout,
  ContactsDetailsContentCardLoading,
} from '@/components/layout/contacts';

export default function CustomerDetailLoading() {
  return (
    <ContactsDetailsLayout>
      <ContactsDetailsHeaderLoading />

      <ContactsDetailsGrid>
        <ContactsDetailsSidebar>
          <ContactsDetailsSidebarLoading
            sectionsCount={3}
            showNotes={true}
            showStatistics={true}
          />
        </ContactsDetailsSidebar>

        <ContactsDetailsContentLayout>
          <ContactsDetailsContentCardLoading
            showHeader={true}
            showHeaderAction={true}
            contentHeight="h-64"
          />

          <ContactsDetailsContentCardLoading
            showHeader={true}
            showHeaderAction={true}
            contentHeight="h-48"
          />
        </ContactsDetailsContentLayout>
      </ContactsDetailsGrid>
    </ContactsDetailsLayout>
  );
}
