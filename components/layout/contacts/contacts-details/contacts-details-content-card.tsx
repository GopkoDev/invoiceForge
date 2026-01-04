'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LucideIcon } from 'lucide-react';
import Link from 'next/link';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  actionButton?: React.ReactNode;
}

interface ContactsDetailsContentCardProps {
  title?: string;
  description?: string;
  children?: React.ReactNode;
  headerAction?: React.ReactNode;
  emptyState?: EmptyStateProps;
  showEmpty?: boolean;
}

export function ContactsDetailsContentCard({
  title,
  description,
  children,
  headerAction,
  emptyState,
  showEmpty = false,
}: ContactsDetailsContentCardProps) {
  return (
    <Card className="overflow-hidden">
      {(title || headerAction) && (
        <CardHeader>
          <div className="flex items-center justify-between">
            {title && (
              <div>
                <CardTitle>{title}</CardTitle>
                {description && (
                  <CardDescription>{description}</CardDescription>
                )}
              </div>
            )}
            {headerAction && <div>{headerAction}</div>}
          </div>
        </CardHeader>
      )}

      <CardContent>
        {showEmpty && emptyState ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <emptyState.icon className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-sm font-semibold mb-2">{emptyState.title}</h3>
            <p className="text-muted-foreground text-xs max-w-md mb-4">
              {emptyState.description}
            </p>
            {emptyState.actionButton ? (
              emptyState.actionButton
            ) : emptyState.action ? (
              <>
                {emptyState.action.href ? (
                  <Link href={emptyState.action.href}>
                    <Button size="sm">{emptyState.action.label}</Button>
                  </Link>
                ) : (
                  <Button size="sm" onClick={emptyState.action.onClick}>
                    {emptyState.action.label}
                  </Button>
                )}
              </>
            ) : null}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
