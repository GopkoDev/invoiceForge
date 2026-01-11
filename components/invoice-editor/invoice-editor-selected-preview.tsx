export function InvoiceEditorSelectedPreview({
  title,
  textsArray,
}: {
  title: string;
  textsArray: (string | null | undefined | boolean)[];
}) {
  const renderArr = textsArray.filter(
    (text): text is string => typeof text === 'string' && text.trim() !== ''
  );

  return (
    <div className="bg-muted/50 space-y-1 rounded-lg border p-3 text-sm">
      <p className="font-medium">{title}</p>
      {renderArr.map((text, index) => (
        <p key={index} className="text-muted-foreground">
          {text}
        </p>
      ))}
    </div>
  );
}
