'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { updateTimeZone } from '@/lib/actions/profile-actions';
import {
  goToSignIn,
  redirectIfUnauthorized,
} from '@/lib/helpers/client-session-redirect';
import { TIME_ZONE_MESSAGE } from '@/lib/validations/profile';

const SAVED_MESSAGE = 'Time zone saved.';
const SAVE_FAILED_MESSAGE = "Your time zone couldn't be saved. Try again.";

/** "UTC+03:00" for a zone right now (DST-aware); empty when the engine can't format it. */
function offsetLabel(zone: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'longOffset',
    })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value;
    if (!part) return '';
    return part === 'GMT' ? 'UTC+00:00' : part.replace('GMT', 'UTC');
  } catch {
    return '';
  }
}

function buildLabels(zones: string[]): Map<string, string> {
  return new Map(
    zones.map((zone) => {
      const offset = offsetLabel(zone);
      return [zone, offset ? `${zone} (${offset})` : zone];
    })
  );
}

function listZones(saved: string | null): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  // A saved zone the engine omits (e.g. "UTC") must still be selectable.
  if (saved && !zones.includes(saved)) zones = [saved, ...zones];
  return zones;
}

export function TimeZoneSettings({ timeZone }: { timeZone: string | null }) {
  const zones = useMemo(() => listZones(timeZone), [timeZone]);
  const labels = useMemo(() => buildLabels(zones), [zones]);
  const zoneLabel = (zone: string) => labels.get(zone) ?? zone;
  const [value, setValue] = useState<string | null>(timeZone);
  const [saved, setSaved] = useState<string | null>(timeZone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!value || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await updateTimeZone(value);
      if (redirectIfUnauthorized(result)) return;
      if (result.success) {
        setSaved(value);
        toast.success(SAVED_MESSAGE);
      } else if (result.code === 'VALIDATION') {
        setError(
          result.fieldErrors?.timeZone?.[0] ??
            result.error ??
            TIME_ZONE_MESSAGE
        );
      } else {
        toast.error(result.error || SAVE_FAILED_MESSAGE);
      }
    } catch {
      goToSignIn();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time zone</CardTitle>
        <CardDescription>
          Used for &quot;today&quot;, month boundaries and overdue on your
          dashboard and in your AI assistant&apos;s answers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Field data-invalid={error ? true : undefined} className="flex-1">
            <FieldLabel htmlFor="time-zone-input" className="sr-only">
              Time zone
            </FieldLabel>
            <Combobox
              items={zones}
              value={value}
              onValueChange={(next: string | null) => {
                setValue(next);
                setError(null);
              }}
              itemToStringLabel={zoneLabel}
              disabled={saving}
            >
              <ComboboxInput
                id="time-zone-input"
                disabled={saving}
                placeholder="Choose a time zone"
                aria-invalid={error ? true : undefined}
                className="w-full"
              />
              <ComboboxContent>
                <ComboboxEmpty>No time zone found.</ComboboxEmpty>
                <ComboboxList>
                  {(zone: string) => (
                    <ComboboxItem key={zone} value={zone}>
                      {zoneLabel(zone)}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            {error ? (
              <FieldError>{error}</FieldError>
            ) : !saved ? (
              <FieldDescription>
                Not set yet. UTC is used until you choose one.
              </FieldDescription>
            ) : null}
          </Field>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!value || saving}
            className="w-full sm:w-auto"
          >
            {saving && <Spinner />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
