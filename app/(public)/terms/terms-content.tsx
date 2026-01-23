'use client';

import { Check, AlertTriangle, Shield, Sparkles } from 'lucide-react';
import { LegalHeader } from '@/components/legal/legal-header';
import { LegalHero } from '@/components/legal/legal-hero';
import { ContentCard } from '@/components/landing/content-card';
import { ListWithIcons } from '@/components/legal/list-with-icons';
import { DataTable } from '@/components/legal/data-table';
import { ConfirmationBox } from '@/components/legal/confirmation-box';
import { termsContent } from '@/constants/public-pages-content';
import { parseHtmlText } from '@/lib/utils/parse-html-text';

export function TermsOfServiceContent() {
  return (
    <div className="bg-background min-h-screen">
      <LegalHeader />

      <LegalHero
        icon={termsContent.metadata.icon}
        badge={termsContent.metadata.badge}
        headline={termsContent.metadata.headline.text}
        highlightedText={termsContent.metadata.headline.highlight}
        subheadline={termsContent.metadata.subheadline}
        effectiveDate={termsContent.metadata.effectiveDate}
        lastUpdated={termsContent.metadata.lastUpdated}
      />

      <section className="pb-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-8">
            {/* Section 1 */}
            <ContentCard variant="always">
              <h2 className="mb-4 text-2xl font-bold">
                1. What Invoice Forge Is (And Isn&apos;t)
              </h2>
              <p className="text-muted-foreground mb-6">
                {parseHtmlText(termsContent.sections[0]!.intro)}
              </p>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-lg font-semibold">What we ARE:</h3>
                  <ListWithIcons
                    items={termsContent.sections[0]!.whatWeAre!.items}
                    variant="check"
                  />
                </div>
                <div>
                  <h3 className="mb-3 text-lg font-semibold">
                    What we ARE NOT:
                  </h3>
                  <ListWithIcons
                    items={termsContent.sections[0]!.whatWeAreNot!.items}
                    variant="x"
                  />
                </div>
              </div>
              <div className="bg-primary/5 mt-6 rounded-lg p-4">
                <p className="mb-2 font-semibold">
                  By using Invoice Forge, you agree:
                </p>
                <ul className="space-y-1 text-sm">
                  {termsContent.sections[0]!.agreement!.items.map(
                    (item, idx) => (
                      <li key={idx} className="text-muted-foreground">
                        {idx + 1}. {item}
                      </li>
                    )
                  )}
                </ul>
              </div>
            </ContentCard>

            {/* Section 2 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
                <Sparkles className="h-6 w-6" />
                2. Beta Status: Free, But &quot;As-Is&quot;
              </h2>
              <p className="text-muted-foreground mb-6">
                {parseHtmlText(termsContent.sections[1]!.intro)}
              </p>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-lg font-semibold text-green-600 dark:text-green-400">
                    It&apos;s Free
                  </h3>
                  <ListWithIcons
                    items={termsContent.sections[1]!.free!.items}
                    variant="check"
                  />
                </div>
                <div>
                  <h3 className="mb-3 text-lg font-semibold text-amber-600 dark:text-amber-400">
                    But Zero Guarantees
                  </h3>
                  <ul className="space-y-2">
                    {termsContent.sections[1]!.noGuarantees!.items.map(
                      (item, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                          <span className="text-muted-foreground text-sm">
                            {item}
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              </div>
              <div className="mt-6 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
                <p className="text-sm font-semibold">
                  <AlertTriangle className="mr-2 inline h-4 w-4" />
                  Translation:
                </p>
                <p className="text-muted-foreground mt-2 text-sm">
                  {parseHtmlText(termsContent.sections[1]!.translation!.text)}
                </p>
              </div>
            </ContentCard>

            {/* Section 3 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 text-2xl font-bold">
                3. Your Responsibilities
              </h2>
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 text-lg font-semibold">
                    You Are the Invoice Issuer
                  </h3>
                  <p className="text-muted-foreground mb-3">
                    {parseHtmlText(
                      termsContent.sections[2]!.invoiceIssuer!.intro
                    )}
                  </p>
                  <ul className="space-y-2">
                    {termsContent.sections[2]!.invoiceIssuer!.items.map(
                      (item, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <div className="bg-primary/10 mt-0.5 rounded-full p-1">
                            <Check className="text-primary h-3 w-3" />
                          </div>
                          <span className="text-muted-foreground text-sm">
                            {item}
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                </div>
                <div className="bg-primary/5 rounded-lg p-4">
                  <p className="text-center font-semibold italic">
                    {termsContent.sections[2].quote}
                  </p>
                </div>
              </div>
            </ContentCard>

            {/* Section 4 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 text-2xl font-bold">4. What We Do NOT Do</h2>
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 text-lg font-semibold">
                    No Automated Tax Reporting
                  </h3>
                  <ListWithIcons
                    items={termsContent.sections[3]!.noTaxReporting!.items}
                    variant="x"
                  />
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-semibold">
                    No E-Invoicing Compliance
                  </h3>
                  <ListWithIcons
                    items={termsContent.sections[3]!.noEInvoicing!.items}
                    variant="x"
                  />
                  <p className="text-muted-foreground mt-4 text-sm italic">
                    {parseHtmlText(
                      termsContent.sections[3]!.noEInvoicing!.note
                    )}
                  </p>
                </div>
              </div>
            </ContentCard>

            {/* Section 5 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
                <Shield className="h-6 w-6" />
                5. Limitation of Liability
              </h2>
              <p className="text-muted-foreground mb-4">
                {parseHtmlText(termsContent.sections[4]!.intro)}
              </p>
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-lg font-semibold">
                    We are NOT responsible for:
                  </h3>
                  <ListWithIcons
                    items={termsContent.sections[4]!.notResponsible!.items}
                    variant="x"
                  />
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
                  <p className="text-sm">
                    {parseHtmlText(termsContent.sections[4]!.maximum!.text)}
                  </p>
                  <p className="text-muted-foreground mt-2 text-sm">
                    {parseHtmlText(
                      termsContent.sections[4]!.maximum!.exception
                    )}
                  </p>
                </div>
              </div>
            </ContentCard>

            {/* Section 6 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 text-2xl font-bold">
                6. Your Data &amp; Snapshots
              </h2>
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 text-lg font-semibold">
                    You Own Your Data
                  </h3>
                  <p className="text-muted-foreground">
                    {termsContent.sections[5]!.ownership!.text}
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-semibold">
                    The Snapshot System
                  </h3>
                  <p className="text-muted-foreground mb-3">
                    {parseHtmlText(termsContent.sections[5]!.snapshots!.intro)}
                  </p>
                  <ul className="text-muted-foreground ml-6 list-disc space-y-1">
                    {termsContent.sections[5]!.snapshots!.items.map(
                      (item, index) => (
                        <li key={index}>{item}</li>
                      )
                    )}
                  </ul>
                  <div className="bg-primary/5 mt-4 rounded-lg p-4">
                    <p className="text-sm font-semibold">
                      {termsContent.sections[5]!.snapshots!.why!.title}
                    </p>
                    <p className="text-muted-foreground mt-2 text-sm">
                      {termsContent.sections[5]!.snapshots!.why!.text}
                    </p>
                  </div>
                  <p className="text-muted-foreground mt-4 text-sm">
                    {parseHtmlText(
                      termsContent.sections[5]!.snapshots!.retention
                    )}
                  </p>
                </div>
              </div>
            </ContentCard>

            {/* Section 7 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 text-2xl font-bold">7. Age Restriction</h2>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-6">
                <p className="text-muted-foreground mb-3">
                  {parseHtmlText(termsContent.sections[6]!.alert!.text)}
                </p>
                <p className="text-muted-foreground text-sm">
                  {termsContent.sections[6]!.alert!.action}
                </p>
              </div>
            </ContentCard>

            {/* Section 8 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 text-2xl font-bold">
                8. Right of Withdrawal (EU Directive 2011/83/EU)
              </h2>
              <p className="text-muted-foreground mb-4">
                {parseHtmlText(termsContent.sections[7]!.text)}
              </p>
              <p className="text-muted-foreground text-sm">
                {termsContent.sections[7].note}
              </p>
            </ContentCard>

            {/* Section 9 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
                <Shield className="h-6 w-6" />
                9. User-Generated Content & Liability
              </h2>
              <div className="bg-primary/5 mb-4 rounded-lg p-4">
                <p className="font-semibold">
                  {termsContent.sections[8]!.callout!.title}
                </p>
                <p className="text-muted-foreground mt-2 text-sm">
                  {termsContent.sections[8]!.callout!.text}
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-lg font-semibold">
                    We are NOT liable for:
                  </h3>
                  <ListWithIcons
                    items={termsContent.sections[8]!.notLiable!.items}
                    variant="x"
                  />
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
                  <p className="text-sm">
                    {parseHtmlText(termsContent.sections[8]!.indemnify)}
                  </p>
                </div>
              </div>
            </ContentCard>

            {/* Section 10 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 text-2xl font-bold">
                10. Infrastructure Providers (Sub-processors)
              </h2>
              <p className="text-muted-foreground mb-4">
                {termsContent.sections[9].intro}
              </p>
              <DataTable
                headers={termsContent.sections[9]!.table!.headers}
                rows={termsContent.sections[9]!.table!.rows}
              />
              <p className="text-muted-foreground mt-4 text-sm">
                {parseHtmlText(termsContent.sections[9]!.compliance)}
              </p>
            </ContentCard>

            {/* Section 11 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 text-2xl font-bold">
                11. Account Termination
              </h2>
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 text-lg font-semibold">
                    Termination by You
                  </h3>
                  <p className="text-muted-foreground mb-3">
                    {parseHtmlText(termsContent.sections[10]!.byYou!.intro)}
                  </p>
                  <ul className="space-y-2">
                    {termsContent.sections[10]!.byYou!.items.map(
                      (item, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <div className="bg-primary/10 mt-0.5 rounded-full p-1">
                            <Check className="text-primary h-3 w-3" />
                          </div>
                          <span className="text-muted-foreground text-sm">
                            {item}
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">
                    Termination by Us
                  </h3>
                  <p className="text-muted-foreground mb-3">
                    {parseHtmlText(termsContent.sections[10]!.byUs!.intro)}
                  </p>
                  <ul className="space-y-2">
                    {termsContent.sections[10]!.byUs!.items.map(
                      (item, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                          <span className="text-muted-foreground text-sm">
                            {item}
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                  <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-4">
                    <p className="text-sm">
                      {parseHtmlText(termsContent.sections[10]!.byUs!.refunds)}
                    </p>
                  </div>
                </div>
              </div>
            </ContentCard>

            {/* Section 12 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 text-2xl font-bold">
                12. Governing Law & Jurisdiction
              </h2>
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  {parseHtmlText(termsContent.sections[11]!.law)}
                </p>
                <p className="text-muted-foreground">
                  {parseHtmlText(termsContent.sections[11]!.jurisdiction)}
                </p>
              </div>
            </ContentCard>

            {/* Section 13 */}
            <ContentCard variant="always">
              <h2 className="mb-4 text-center text-2xl font-bold">
                13. Final Note: We&apos;re a Helper Tool
              </h2>
              <p className="text-muted-foreground mb-6 text-center text-lg">
                {parseHtmlText(termsContent.sections[12]!.intro)}
              </p>
              <p className="text-muted-foreground mb-6 text-center">
                {termsContent.sections[12].body}
              </p>
              <div className="mx-auto max-w-md space-y-2 text-left">
                {termsContent.sections[12]!.responsibilities!.map(
                  (item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="bg-primary/10 rounded-full p-1">
                        <Check className="text-primary h-4 w-4" />
                      </div>
                      <span className="text-muted-foreground">{item}</span>
                    </div>
                  )
                )}
              </div>
              <p className="text-muted-foreground mt-6 text-center font-semibold italic">
                {termsContent.sections[12].quote}
              </p>
            </ContentCard>

            {/* Confirmation */}
            <ConfirmationBox
              title={termsContent.confirmation.title}
              items={termsContent.confirmation.items}
              lastUpdated={termsContent.confirmation.lastUpdated}
              compliance={termsContent.confirmation.compliance}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
