import { Skeleton } from '@/components/ui/skeleton';

interface HeaderLoadingProps {
  titleText: string;
  descriptionText: string;
  buttonText?: string;
}

export function ContentAreaHeaderLoading({
  titleText,
  descriptionText,
  buttonText,
}: HeaderLoadingProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <Skeleton
          className="h-7 mb-2"
          style={{ width: `${titleText.length + 2}ch` }}
        />
        <Skeleton
          className="h-4"
          style={{ width: `${descriptionText.length * 0.7}ch` }}
        />
      </div>

      {buttonText && (
        <div className="flex items-center gap-2">
          <Skeleton
            className="h-10 rounded-md"
            style={{ width: `calc(${buttonText.length * 0.75}ch + 44px)` }}
          />
        </div>
      )}
    </div>
  );
}
