'use client';

import { toast } from 'sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { UserAvatar } from '@/components/layout/user/user-avatar';
import { Spinner } from '@/components/ui/spinner';
import { SessionUser } from '@/types/session-user';
import { useModal } from '@/store/use-modal-store';
import {
  profileFormSchema,
  ProfileFormValues,
} from '@/lib/validations/profile';
import { updateProfile } from '@/lib/actions/profile-actions';
import { TriangleAlert } from 'lucide-react';
import { authRoutes } from '@/config/routes.config';

export function ProfileSettings({ user }: { user: SessionUser }) {
  const confirmationModal = useModal('confirmationModal');
  const router = useRouter();
  const [isEmailChanged, setIsEmailChanged] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(user.image || '');

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: user.name,
      email: user.email,
      image: user.image || '',
    },
  });

  const handleEmailChange = (email: string) => {
    setIsEmailChanged(email !== user.email);
  };

  const handleAvatarUrlChange = (url: string) => {
    setAvatarPreview(url);
  };

  const handleConfirmedSubmit = async (data: ProfileFormValues) => {
    try {
      const result = await updateProfile(data);

      if (!result.success) {
        toast.error(result.error || 'Failed to update profile');
        return;
      }

      toast.success('Profile updated successfully');

      if (result.emailChanged) {
        await signOut({ callbackUrl: authRoutes.signIn, redirect: true });
      } else {
        router.refresh();
      }
    } catch {
      toast.error('Failed to update profile');
    }
  };

  const onSubmit = async (data: ProfileFormValues) => {
    if (isEmailChanged) {
      confirmationModal.open({
        open: true,
        title: 'Confirm Email Change',
        description:
          'Warning: After changing your email, you will be logged out and will need to sign in with your new email. You will no longer be able to login with your old email. Are you sure you want to continue?',
        variant: 'destructive',
        confirmText: 'Yes, Change Email',
        cancelText: 'Cancel',
        onClose: confirmationModal.close,
        onConfirm: () => handleConfirmedSubmit(data),
      });
    } else {
      await handleConfirmedSubmit(data);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>
            Update your profile information and how others see you on the
            platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="profile-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-6"
          >
            <div className="flex items-center gap-6">
              <UserAvatar
                user={{
                  ...user,
                  image: avatarPreview,
                }}
                className="h-20 w-20 rounded-full"
              />
              <div className="flex-1">
                <Controller
                  name="image"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="profile-form-avatar">
                        Avatar URL
                      </FieldLabel>
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        id="profile-form-avatar"
                        type="url"
                        aria-invalid={fieldState.invalid}
                        placeholder="https://example.com/avatar.jpg"
                        onChange={(e) => {
                          field.onChange(e);
                          handleAvatarUrlChange(e.target.value);
                        }}
                      />

                      <FieldError errors={[fieldState.error]} />

                      <p className="text-muted-foreground mt-1 text-xs">
                        Enter a URL to your avatar image
                      </p>
                    </Field>
                  )}
                />
              </div>
            </div>

            <FieldGroup>
              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="profile-form-name">
                      Full Name
                    </FieldLabel>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      id="profile-form-name"
                      aria-invalid={fieldState.invalid}
                      placeholder="Enter your full name"
                      autoComplete="name"
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="profile-form-email">Email</FieldLabel>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      id="profile-form-email"
                      type="email"
                      aria-invalid={fieldState.invalid}
                      placeholder="Enter your email"
                      autoComplete="email"
                      onChange={(e) => {
                        field.onChange(e);
                        handleEmailChange(e.target.value);
                      }}
                    />

                    <FieldError errors={[fieldState.error]} />

                    {isEmailChanged && (
                      <p className="text-warning mt-1 flex items-center gap-2 text-sm text-amber-600">
                        <TriangleAlert />
                        Changing email will require you to login again
                      </p>
                    )}
                  </Field>
                )}
              />
            </FieldGroup>

            <div className="flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Spinner className="mr-2" />}
                {form.formState.isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
