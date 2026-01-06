import { ContactCardLoading, ContactsGrid } from '@/components/layout/contacts';
import { ContentAreaHeaderLoading } from '@/components/layout/content-area';
import { PAGE_HEADER_TEXT } from './_constants';

const { title, description, buttonText } = PAGE_HEADER_TEXT;

export default function SenderProfilesLoading() {
  return (
    <>
      <ContentAreaHeaderLoading
        titleText={title}
        descriptionText={description}
        buttonText={buttonText}
      />

      <ContactsGrid>
        {[1, 2, 3].map((index) => (
          <ContactCardLoading key={`sender-profile-skeleton-${index}`} />
        ))}
      </ContactsGrid>
    </>
  );
}
