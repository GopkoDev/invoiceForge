import { ContentAreaHeaderLoading } from '@/components/layout/content-area';
import { PAGE_HEADER_TEXT } from './_constants';
import { CustomerFormLoading } from '@/components/customers';

const { title, description } = PAGE_HEADER_TEXT;

export default function EditCustomerLoading() {
  return (
    <>
      <ContentAreaHeaderLoading
        titleText={title}
        descriptionText={description}
      />

      <CustomerFormLoading />
    </>
  );
}
