'use client';

import { Check, Lock, Mail } from 'lucide-react';
import { LegalHeader } from '@/components/legal/legal-header';
import { LegalHero } from '@/components/legal/legal-hero';
import { ContentCard } from '@/components/landing/content-card';
import { ListWithIcons } from '@/components/legal/list-with-icons';
import { DataTable } from '@/components/legal/data-table';
import { ConfirmationBox } from '@/components/legal/confirmation-box';
import { privacyContent } from '@/constants/public-pages-content';
import { parseHtmlText } from '@/lib/utils/parse-html-text';

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-background min-h-screen">
      <LegalHeader />

      <LegalHero
        icon={privacyContent.metadata.icon}
        badge={privacyContent.metadata.badge}
        headline={privacyContent.metadata.headline.text}
        highlightedText={privacyContent.metadata.headline.highlight}
        subheadline={privacyContent.metadata.subheadline}
        effectiveDate={privacyContent.metadata.effectiveDate}
        lastUpdated={privacyContent.metadata.lastUpdated}
      />

      <section className="pb-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-8">
            {/* Section 1 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 text-2xl font-bold">
                1. The Basics: What We Collect &amp; Why
              </h2>
              <p className="text-muted-foreground mb-6">
                {parseHtmlText(privacyContent.sections[0]!.intro)}
              </p>
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 text-lg font-semibold">
                    Your Account Info
                  </h3>
                  <p className="text-muted-foreground mb-2">
                    <strong>What:</strong> Email address, name (if you provide
                    it), profile photo (from Google/GitHub)
                  </p>
                  <p className="text-muted-foreground mb-2">
                    <strong>Why:</strong> So you can log in and we can identify
                    your account
                  </p>
                  <p className="text-muted-foreground">
                    <strong>Source:</strong> You (via OAuth login)
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-semibold">
                    Your Business Data
                  </h3>
                  <p className="text-muted-foreground mb-2">
                    <strong>What:</strong>
                  </p>
                  <ul className="text-muted-foreground ml-6 list-disc space-y-1">
                    <li>
                      Sender profiles (your company name, address, tax ID, bank
                      account)
                    </li>
                    <li>
                      Customer database (client names, emails, addresses, tax
                      IDs)
                    </li>
                    <li>Product catalog (names, prices, descriptions)</li>
                  </ul>
                  <p className="text-muted-foreground mt-2">
                    <strong>Why:</strong> So Invoice Forge can generate invoices
                    with the right information
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-semibold">
                    Invoice Data &amp; Snapshots
                  </h3>
                  <p className="text-muted-foreground mb-2">
                    <strong>What:</strong> Invoice details (number, date,
                    currency, totals) + <strong>Snapshots</strong> – frozen
                    copies of sender + customer data at the time you finalize an
                    invoice
                  </p>
                  <div className="bg-primary/5 mt-4 rounded-lg p-4">
                    <p className="text-sm font-semibold">Why Snapshots?</p>
                    <p className="text-muted-foreground mt-2 text-sm">
                      Imagine you update your client&apos;s address in your
                      database. Without snapshots, your old invoices would show
                      the <em>new</em> address (confusing!). Snapshots keep
                      historical invoices accurate.
                    </p>
                  </div>
                  <p className="text-muted-foreground mt-4 text-sm">
                    <strong>Retention:</strong> Invoices (including snapshots)
                    are kept as long as you use the service. When you delete
                    your account, everything is permanently removed within 30
                    days.
                  </p>
                </div>
              </div>
            </ContentCard>

            {/* Section 2 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 text-2xl font-bold">2. Age Restriction</h2>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-6">
                <p className="text-muted-foreground mb-3">
                  Invoice Forge is{' '}
                  <strong>strictly for users 18 years of age or older</strong>.
                  We do not knowingly collect or process personal data from
                  anyone under 18.
                </p>
                <p className="text-muted-foreground text-sm">
                  If you believe a minor has created an account, please contact
                  us immediately at <strong>privacy@invoiceforge.com</strong>,
                  and we will delete their data within 72 hours.
                </p>
              </div>
            </ContentCard>

            {/* Section 3 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 text-2xl font-bold">3. Cookies & Tracking</h2>
              <p className="text-muted-foreground mb-4">
                Invoice Forge uses{' '}
                <strong>one strictly necessary session cookie</strong> for
                authentication purposes only.
              </p>
              <div className="bg-primary/5 mb-4 rounded-lg p-4">
                <h3 className="mb-3 text-lg font-semibold">
                  Authentication Cookie Details
                </h3>
                <ul className="space-y-2 text-sm">
                  <li className="text-muted-foreground">
                    <strong>Cookie Name:</strong>{' '}
                    <code className="bg-muted rounded px-1 py-0.5">
                      next-auth.session-token
                    </code>{' '}
                    (or{' '}
                    <code className="bg-muted rounded px-1 py-0.5">
                      __Secure-next-auth.session-token
                    </code>{' '}
                    on HTTPS)
                  </li>
                  <li className="text-muted-foreground">
                    <strong>Purpose:</strong> Keep you logged in and manage your
                    session
                  </li>
                  <li className="text-muted-foreground">
                    <strong>Technology:</strong> Auth.js (NextAuth.js)
                  </li>
                  <li className="text-muted-foreground">
                    <strong>Duration:</strong> Session-based (expires when you
                    log out or after 30 days of inactivity)
                  </li>
                  <li className="text-muted-foreground">
                    <strong>Type:</strong> First-party cookie (no third-party
                    tracking)
                  </li>
                </ul>
              </div>
              <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
                <p className="text-sm">
                  <strong>
                    By using Invoice Forge, you consent to the use of this
                    strictly necessary cookie.
                  </strong>{' '}
                  Without it, the Service cannot function.
                </p>
              </div>
              <div>
                <h3 className="mb-2 text-lg font-semibold">
                  What We DON&apos;T Use
                </h3>
                <ListWithIcons
                  items={[
                    'Advertising cookies',
                    'Analytics cookies (e.g., Google Analytics)',
                    'Social media tracking pixels',
                    'Cross-site tracking',
                  ]}
                  variant="x"
                />
              </div>
            </ContentCard>

            {/* Section 4 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 text-2xl font-bold">
                4. How We Use Your Data
              </h2>
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-lg font-semibold">Core Functions</h3>
                  <ListWithIcons
                    items={[
                      'Generate invoices (obviously)',
                      'Store your customer/product catalog for easy reuse',
                      'Authenticate your login (via Auth.js/NextAuth with Google or GitHub)',
                    ]}
                    variant="check"
                  />
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-semibold">We Do NOT:</h3>
                  <ListWithIcons
                    items={[
                      'Sell your data to third parties',
                      'Train AI models on your invoices',
                      'Send marketing emails (unless you opt in)',
                      "Share your data with tax authorities (you're responsible for that)",
                    ]}
                    variant="x"
                  />
                </div>
              </div>
            </ContentCard>

            {/* Section 5 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 text-2xl font-bold">
                5. Third-Party Processors (Sub-processors)
              </h2>
              <p className="text-muted-foreground mb-4">
                To run Invoice Forge, we rely on trusted infrastructure
                providers. Here&apos;s a transparent list of who processes your
                data:
              </p>
              <DataTable
                headers={privacyContent.sections[4]!.table!.headers}
                rows={privacyContent.sections[4]!.table!.rows}
              />
              <div className="bg-primary/5 mt-4 rounded-lg p-4">
                <p className="mb-2 text-sm">
                  {parseHtmlText(privacyContent.sections[4]!.safeguards!.text)}
                </p>
                <p className="text-muted-foreground text-sm">
                  {parseHtmlText(
                    privacyContent.sections[4]!.safeguards!.privacy
                  )}
                </p>
              </div>
            </ContentCard>

            {/* Section 6 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 text-2xl font-bold">
                6. Your Rights (GDPR & Ukrainian Law)
              </h2>
              <p className="text-muted-foreground mb-4">
                Under EU law (GDPR) and Ukrainian data protection law, you have
                the right to:
              </p>
              <div className="space-y-4">
                {privacyContent.sections[5]!.rights!.map((right, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <Check className="text-primary mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <h3 className="font-semibold">{right.title}</h3>
                      <p className="text-muted-foreground text-sm">
                        {parseHtmlText(right.description)}
                      </p>
                      {right.details && (
                        <p className="text-muted-foreground mt-1 text-sm">
                          {parseHtmlText(right.details)}
                        </p>
                      )}
                      {right.methods && (
                        <div className="bg-primary/5 mt-2 space-y-1 rounded p-3 text-sm">
                          {right.methods.map((method, methodIndex) => (
                            <p
                              key={methodIndex}
                              className="text-muted-foreground"
                            >
                              {parseHtmlText(method)}
                            </p>
                          ))}
                        </div>
                      )}
                      {right.exportIncludes && (
                        <p className="text-muted-foreground mt-2 text-sm">
                          {parseHtmlText(right.exportIncludes)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
                <p className="text-sm">
                  {parseHtmlText(privacyContent.sections[5]!.responseTime)}
                </p>
              </div>
            </ContentCard>

            {/* Section 7 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 text-2xl font-bold">
                7. Data Retention & Deletion Schedule
              </h2>
              <p className="text-muted-foreground mb-4">
                Here&apos;s exactly how long we keep your data:
              </p>
              <DataTable
                headers={privacyContent.sections[6]!.table!.headers}
                rows={privacyContent.sections[6]!.table!.rows}
              />
              <p className="text-muted-foreground mt-4 text-sm">
                {parseHtmlText(privacyContent.sections[6]!.note)}
              </p>
            </ContentCard>

            {/* Section 8 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
                <Lock className="h-6 w-6" />
                8. Security: How We Protect Your Data
              </h2>
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-lg font-semibold">What We Do</h3>
                  <ListWithIcons
                    items={privacyContent.sections[7]!.whatWeDo!.items}
                    variant="check"
                  />
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-semibold">
                    What We DON&apos;T Promise
                  </h3>
                  <ListWithIcons
                    items={privacyContent.sections[7]!.dontPromise!.items}
                    variant="x"
                  />
                  <p className="text-muted-foreground mt-4 text-sm">
                    {parseHtmlText(privacyContent.sections[7]!.breach)}
                  </p>
                </div>
              </div>
            </ContentCard>

            {/* Section 9 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 text-2xl font-bold">9. Governing Law</h2>
              <p className="text-muted-foreground mb-4">
                {parseHtmlText(privacyContent.sections[8]!.intro)}
              </p>
              <ul className="text-muted-foreground space-y-2 text-sm">
                {privacyContent.sections[8]!.laws!.map((law, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                    <span>{parseHtmlText(law)}</span>
                  </li>
                ))}
              </ul>
            </ContentCard>

            {/* Section 10 */}
            <ContentCard variant="hover-only">
              <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
                <Mail className="h-6 w-6" />
                10. Contact & Data Protection Officer
              </h2>
              <p className="text-muted-foreground mb-4">
                For privacy questions, data requests, or concerns:
              </p>
              <ul className="text-muted-foreground space-y-2">
                {privacyContent.sections[9]!.contacts!.map((contact, index) => (
                  <li key={index}>{contact}</li>
                ))}
              </ul>
              <p className="text-muted-foreground mt-6 text-sm">
                <strong>EU Supervisory Authority:</strong> If you&apos;re
                unhappy with how we handle your data, you can file a complaint
                with your national data protection authority:{' '}
                <a
                  href={privacyContent.sections[9]!.authorities!.eu!.link!.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {privacyContent.sections[9]!.authorities!.eu!.link!.text}
                </a>
              </p>
              <p className="text-muted-foreground mt-2 text-sm">
                <strong>Ukrainian Supervisory Authority:</strong>{' '}
                <a
                  href={
                    privacyContent.sections[9]!.authorities!.ukraine!.link!.url
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {privacyContent.sections[9]!.authorities!.ukraine!.link!.text}
                </a>
              </p>
            </ContentCard>

            {/* Section 11 */}
            <ContentCard variant="always">
              <h2 className="mb-4 text-center text-2xl font-bold">
                11. Final Note: We&apos;re Not Tax Advisors
              </h2>
              <p className="text-muted-foreground mb-6 text-center">
                {parseHtmlText(privacyContent.sections[10]!.intro)}
              </p>
              <div className="mx-auto max-w-md space-y-2 text-left">
                {privacyContent.sections[10]!.responsibilities!.map(
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
              <p className="text-muted-foreground mt-6 text-center font-semibold">
                {privacyContent.sections[10]!.conclusion}
              </p>
            </ContentCard>

            {/* Confirmation */}
            <ConfirmationBox
              title={privacyContent.confirmation.title}
              items={privacyContent.confirmation.items}
              lastUpdated={privacyContent.confirmation.lastUpdated}
              compliance={privacyContent.confirmation.compliance}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
