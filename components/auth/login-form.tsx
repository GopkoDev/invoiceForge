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
import { GoogleIcon } from '@/components/custom-icons';
import { MailIcon, Loader2Icon } from 'lucide-react';
import { useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginEmailSchema, type LoginEmailInput } from '@/lib/validations/auth';
import { signInWithGoogle, signInWithEmail } from '@/lib/actions/login-actions';

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const form = useForm<LoginEmailInput>({
    resolver: zodResolver(loginEmailSchema),
    defaultValues: {
      email: '',
    },
  });

  const onEmailSubmit = async (data: LoginEmailInput) => {
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
            <Field>
              <Button
                variant="outline"
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
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
                <span className="bg-card px-4 text-muted-foreground">
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
                  <Button type="submit" disabled={isLoading} className="w-full">
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
