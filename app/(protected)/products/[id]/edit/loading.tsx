import { ContentAreaHeaderLoading } from '@/components/layout/content-area';
import { PAGE_HEADER_TEXT } from './_constants';
import { ProductFormLoading } from '@/components/products';

const { title, description } = PAGE_HEADER_TEXT;

export default function EditProductLoading() {
  return (
    <>
      <ContentAreaHeaderLoading
        titleText={title}
        descriptionText={description}
      />

      <ProductFormLoading />
    </>
  );
}

