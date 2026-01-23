'use client';

import { LandingNav } from '@/components/landing/landing-nav';
import { LandingHero } from '@/components/landing/landing-hero';
import { FeatureGrid } from '@/components/landing/feature-grid';
import { BetaPricingSection } from '@/components/landing/beta-pricing-section';
import { HowItWorksSection } from '@/components/landing/how-it-works-section';
import { FinalCtaSection } from '@/components/landing/final-cta-section';
import { LandingFooter } from '@/components/landing/landing-footer';
import { landingContent } from '@/constants/public-pages-content';
import { authRoutes, legalRoutes } from '@/config/routes.config';

const loginHref = authRoutes.signIn;

export function LandingPage() {
  const footerSections = [
    {
      title: landingContent.footer.sections.product.title,
      links: landingContent.footer.sections.product.links,
    },
    {
      title: landingContent.footer.sections.company.title,
      links: [
        { label: 'Login', href: authRoutes.signIn },
        { label: 'Privacy Policy', href: legalRoutes.privacy },
        { label: 'Terms of Service', href: legalRoutes.terms },
      ],
    },
  ];

  return (
    <>
      <LandingNav
        brandName={landingContent.navigation.brandName}
        links={landingContent.navigation.links}
        ctaButton={landingContent.navigation.ctaButton}
        ctaHref={loginHref}
      />

      <main>
        <LandingHero
          badge={landingContent.hero.badge}
          headline={landingContent.hero.headline}
          subheadline={landingContent.hero.subheadline}
          ctaButton={landingContent.hero.ctaButton}
          ctaHref={loginHref}
          stats={landingContent.hero.stats}
        />

        <FeatureGrid
          badge={landingContent.features.badge}
          headline={landingContent.features.headline}
          subheadline={landingContent.features.subheadline}
          features={landingContent.features.items}
        />

        <BetaPricingSection
          badge={landingContent.betaPricing.badge}
          headline={landingContent.betaPricing.headline}
          description={landingContent.betaPricing.description}
          benefits={landingContent.betaPricing.benefits}
          pricing={landingContent.betaPricing.pricing}
          ctaButton={landingContent.betaPricing.ctaButton}
          ctaHref={loginHref}
          ctaDisclaimer={landingContent.betaPricing.ctaDisclaimer}
        />

        <HowItWorksSection
          badge={landingContent.howItWorks.badge}
          headline={landingContent.howItWorks.headline}
          subheadline={landingContent.howItWorks.subheadline}
          steps={landingContent.howItWorks.steps}
        />

        <FinalCtaSection
          headline={landingContent.finalCta.headline}
          subheadline={landingContent.finalCta.subheadline}
          ctaButton={landingContent.finalCta.ctaButton}
          ctaHref={loginHref}
          disclaimer={landingContent.finalCta.disclaimer}
        />
      </main>

      <LandingFooter
        brandName={landingContent.footer.brandName}
        description={landingContent.footer.description}
        sections={footerSections}
        copyright={landingContent.footer.copyright}
        disclaimer={landingContent.footer.disclaimer}
      />
    </>
  );
}
