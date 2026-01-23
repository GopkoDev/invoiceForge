'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { Field, FieldError, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { GoogleIcon } from '@/components/custom-icons';
import { MailIcon, Loader2Icon } from 'lucide-react';
import { useState, useTransition, useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginEmailSchema, type LoginEmailInput } from '@/lib/validations/auth';
import { signInWithGoogle, signInWithEmail } from '@/lib/actions/login-actions';
import Link from 'next/link';
import { legalRoutes } from '@/config/routes.config';

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const [isAgeAndTermsAccepted, setIsAgeAndTermsAccepted] = useState(false);
  const checkboxId = useId();

  const form = useForm<LoginEmailInput>({
    resolver: zodResolver(loginEmailSchema),
    defaultValues: {
      email: '',
    },
  });

  const onEmailSubmit = async (data: LoginEmailInput) => {
    if (!isAgeAndTermsAccepted) return;
    const result = await signInWithEmail(data.email);

    if (!result.success) {
      toast.error(result.error);
    }
  };

  const [isGoogleLoading, startTransition] = useTransition();
  const isEmailLoading = form.formState.isSubmitting;
  const isLoading = isGoogleLoading || isEmailLoading;

  const handleGoogleSignIn = () => {
    startTransition(async () => {
      await signInWithGoogle();
    });
  };

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardDescription>
            Login with your Google account or email
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {/* Age & Legal Gate Checkbox */}
            <div className="border-border bg-muted/30 flex items-start gap-3 rounded-lg border p-4">
              <Checkbox
                id={checkboxId}
                checked={isAgeAndTermsAccepted}
                onCheckedChange={(checked) =>
                  setIsAgeAndTermsAccepted(checked === true)
                }
                className="mt-0.5"
              />
              <label
                htmlFor={checkboxId}
                className="cursor-pointer text-sm leading-relaxed"
              >
                I confirm I am 18+ and agree to the{' '}
                <Link
                  href={legalRoutes.terms}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 underline underline-offset-4"
                >
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link
                  href={legalRoutes.privacy}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 underline underline-offset-4"
                >
                  Privacy Policy
                </Link>
              </label>
            </div>

            <Field>
              <Button
                variant="outline"
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading || !isAgeAndTermsAccepted}
                className="w-full"
              >
                {isGoogleLoading ? (
                  <>
                    <Loader2Icon className="animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <GoogleIcon />
                    Login with Google
                  </>
                )}
              </Button>
            </Field>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card text-muted-foreground px-4">
                  Or continue with Email
                </span>
              </div>
            </div>

            <form
              id="login-email-form"
              onSubmit={form.handleSubmit(onEmailSubmit)}
            >
              <FieldGroup>
                <Controller
                  name="email"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        id="login-email"
                        type="email"
                        placeholder="Enter your email"
                        disabled={isLoading}
                        aria-invalid={fieldState.invalid}
                        autoComplete="email"
                      />
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
                <Field>
                  <Button
                    type="submit"
                    disabled={isLoading || !isAgeAndTermsAccepted}
                    className="w-full"
                  >
                    {isEmailLoading ? (
                      <>
                        <Loader2Icon className="animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <MailIcon />
                        Continue
                      </>
                    )}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
