'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { AssistantMark as Mark } from '@/types/invoice/types';

export function AssistantMark({ mark }: { mark: Mark }) {
  if (!mark) return null;
  const label =
    mark.origin === 'CHAT' ? 'Created by the in-app chat' : `Created by ${mark.keyName}`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Badge variant="outline" className="shrink-0 cursor-default" tabIndex={0} />}
      >
        AI
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
