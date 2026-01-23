import { authRoutes, legalRoutes } from '@/config/routes.config';
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  Globe,
  Shield,
  BarChart3,
  Clock,
  Zap,
  Check,
  Sparkles,
  FileText,
  AlertTriangle,
  Lock,
  Mail,
} from 'lucide-react';

// ============================================================================
// LANDING PAGE CONTENT
// ============================================================================

export interface FeatureItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface HowItWorksStep {
  step: string;
  title: string;
  description: string;
}

export interface StatItem {
  label: string;
  value: string;
}

export const landingContent = {
  navigation: {
    brandName: 'Invoice Forge',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'How It Works', href: '#how-it-works' },
      { label: 'Pricing', href: '#pricing' },
    ],
    ctaButton: 'Get Started',
  },

  hero: {
    badge: {
      icon: Sparkles,
      text: 'Public Beta - Free to Use',
    },
    headline: {
      line1: 'Beautiful Invoices',
      line2: 'In Seconds',
    },
    subheadline:
      'The fastest way to create stunning invoice PDFs. Built for freelancers who care about design and speed.',
    ctaButton: 'Join Beta for Free',
    stats: [
      { label: 'Supported Currencies', value: '5+' },
      { label: 'Invoice Statuses', value: '5' },
      { label: 'Setup Time', value: '< 5 min' },
    ] as StatItem[],
  },

  features: {
    badge: 'Features',
    headline: 'Speed meets Beautiful Design',
    subheadline:
      'Everything you need to create professional-looking invoices without the complexity',
    items: [
      {
        icon: Building2,
        title: 'Multi-Profile Management',
        description:
          'Manage multiple sender profiles for different companies or business entities. Perfect for freelancers with multiple ventures.',
      },
      {
        icon: Globe,
        title: 'Global Ready',
        description:
          'Support for USD, EUR, UAH, GBP, and PLN currencies. Create invoices for clients worldwide with automatic currency handling.',
      },
      {
        icon: Shield,
        title: 'Smart Snapshots',
        description:
          'Your old invoices stay accurate forever. Update client details anytime without worrying about breaking historical records.',
      },
      {
        icon: BarChart3,
        title: 'Smart Dashboard',
        description:
          'Track invoice status in real-time. Monitor Paid, Pending, Overdue, and Draft invoices with visual clarity.',
      },
      {
        icon: Clock,
        title: 'Gorgeous PDFs, Instantly',
        description:
          'Generate pixel-perfect invoices in under a second. Add your logo, preview in real-time, and download beautiful PDFs with one click.',
      },
      {
        icon: Zap,
        title: 'Product Catalog',
        description:
          'Create a reusable product and service catalog. Set custom prices for specific clients and streamline your invoicing workflow.',
      },
    ] as FeatureItem[],
  },

  betaPricing: {
    badge: {
      icon: Sparkles,
      text: 'Public Beta',
    },
    headline: 'Why is Invoice Forge free?',
    description:
      "We're in Public Beta and need your feedback to build the perfect invoicing tool. In exchange for early access and unlimited usage, we ask for your honest input on features, UX, and performance.",
    benefits: [
      'Unlimited invoices & clients',
      'All features unlocked',
      'Direct support from founders',
      'Priority feature requests',
      'No credit card required',
    ],
    pricing: {
      amount: '$0',
      period: '/month',
      subtitle: 'Free during Public Beta',
    },
    ctaButton: 'Join Beta Now',
    ctaDisclaimer: 'No credit card required. Start invoicing in minutes.',
  },

  howItWorks: {
    badge: 'How It Works',
    headline: 'Get started in 3 simple steps',
    subheadline: 'From setup to your first invoice in under 5 minutes',
    steps: [
      {
        step: '01',
        title: 'Setup Your Profile',
        description:
          'Add your company details, logo, and bank accounts. Create multiple profiles if you run several businesses.',
      },
      {
        step: '02',
        title: 'Add Clients & Products',
        description:
          'Build your client database and product catalog. Set custom prices for specific clients.',
      },
      {
        step: '03',
        title: 'Create & Send Invoices',
        description:
          'Generate professional invoices in seconds. Download as PDF or track payment status directly in the dashboard.',
      },
    ] as HowItWorksStep[],
  },

  finalCta: {
    headline: 'Ready to streamline your billing?',
    subheadline:
      'Join hundreds of freelancers and small businesses already using Invoice Forge to get paid faster.',
    ctaButton: 'Start for Free Today',
    disclaimer:
      'No credit card required • Full access during beta • Cancel anytime',
  },

  footer: {
    brandName: 'Invoice Forge',
    description:
      'Professional invoicing made simple for freelancers and small businesses. Built with speed and clarity in mind.',
    sections: {
      product: {
        title: 'Product',
        links: [
          { label: 'Features', href: '#features' },
          { label: 'Pricing', href: '#pricing' },
          { label: 'How It Works', href: '#how-it-works' },
        ],
      },
      company: {
        title: 'Company',
        links: [
          { label: 'Login', href: authRoutes.signIn },
          { label: 'Privacy Policy', href: legalRoutes.privacy },
          { label: 'Terms of Service', href: legalRoutes.terms },
        ],
      },
    },
    copyright: `© ${new Date().getFullYear()} Invoice Forge. All rights reserved.`,
    disclaimer:
      'Invoice Forge is a productivity tool for generating business documents. It is not an official tax reporting system or certified accounting software. Users are responsible for ensuring their invoices meet local legal and tax requirements.',
  },
};

// ============================================================================
// PRIVACY POLICY CONTENT
// ============================================================================

export interface LegalSection {
  id: string;
  title: string;
  content: string | string[] | Record<string, unknown>;
}

export const privacyContent = {
  metadata: {
    icon: Shield,
    badge: 'Privacy Policy',
    headline: {
      text: 'Your Data,',
      highlight: 'Your Control',
    },
    subheadline:
      'Simple, honest privacy policy. No legal jargon, no hidden surprises.',
    effectiveDate: 'January 22, 2026',
    lastUpdated: 'January 23, 2026',
  },

  sections: [
    {
      id: 'basics',
      title: '1. The Basics: What We Collect & Why',
      intro:
        "Invoice Forge is a <strong>productivity tool</strong> that helps you create invoices. To make that work, we need to collect some data. Here's the simple breakdown:",
      subsections: [
        {
          title: 'Your Account Info',
          items: [
            {
              label: 'What',
              text: 'Email address, name (if you provide it), profile photo (from Google/GitHub)',
            },
            {
              label: 'Why',
              text: 'So you can log in and we can identify your account',
            },
            {
              label: 'Source',
              text: 'You (via OAuth login)',
            },
          ],
        },
        {
          title: 'Your Business Data',
          intro: '<strong>What:</strong>',
          list: [
            'Sender profiles (your company name, address, tax ID, bank account)',
            'Customer database (client names, emails, addresses, tax IDs)',
            'Product catalog (names, prices, descriptions)',
          ],
          outro:
            '<strong>Why:</strong> So Invoice Forge can generate invoices with the right information',
        },
        {
          title: 'Invoice Data & Snapshots',
          items: [
            {
              label: 'What',
              text: 'Invoice details (number, date, currency, totals) + <strong>Snapshots</strong> – frozen copies of sender + customer data at the time you finalize an invoice',
            },
          ],
          callout: {
            title: 'Why Snapshots?',
            text: "Imagine you update your client's address in your database. Without snapshots, your old invoices would show the <em>new</em> address (confusing!). Snapshots keep historical invoices accurate.",
          },
          retention:
            '<strong>Retention:</strong> Invoices (including snapshots) are kept as long as you use the service. When you delete your account, everything is permanently removed within 30 days.',
        },
      ],
    },
    {
      id: 'age-restriction',
      title: '2. Age Restriction',
      alert: {
        type: 'warning',
        text: 'Invoice Forge is <strong>strictly for users 18 years of age or older</strong>. We do not knowingly collect or process personal data from anyone under 18.',
        action:
          'If you believe a minor has created an account, please contact us immediately at <strong>privacy@invoiceforge.com</strong>, and we will delete their data within 72 hours.',
      },
    },
    {
      id: 'cookies',
      title: '3. Cookies & Tracking',
      intro:
        'Invoice Forge uses <strong>one strictly necessary session cookie</strong> for authentication purposes only.',
      cookieDetails: {
        title: 'Authentication Cookie Details',
        items: [
          {
            label: 'Cookie Name',
            text: '<code class="bg-muted rounded px-1 py-0.5">next-auth.session-token</code> (or <code class="bg-muted rounded px-1 py-0.5">__Secure-next-auth.session-token</code> on HTTPS)',
          },
          {
            label: 'Purpose',
            text: 'Keep you logged in and manage your session',
          },
          {
            label: 'Technology',
            text: 'Auth.js (NextAuth.js)',
          },
          {
            label: 'Duration',
            text: 'Session-based (expires when you log out or after 30 days of inactivity)',
          },
          {
            label: 'Type',
            text: 'First-party cookie (no third-party tracking)',
          },
        ],
      },
      consent:
        '<strong>By using Invoice Forge, you consent to the use of this strictly necessary cookie.</strong> Without it, the Service cannot function.',
      dontUse: {
        title: "What We DON'T Use",
        items: [
          'Advertising cookies',
          'Analytics cookies (e.g., Google Analytics)',
          'Social media tracking pixels',
          'Cross-site tracking',
        ],
      },
    },
    {
      id: 'data-usage',
      title: '4. How We Use Your Data',
      coreFunctions: {
        title: 'Core Functions',
        items: [
          'Generate invoices (obviously)',
          'Store your customer/product catalog for easy reuse',
          'Authenticate your login (via Auth.js/NextAuth with Google or GitHub)',
        ],
      },
      dontDo: {
        title: 'We Do NOT:',
        items: [
          'Sell your data to third parties',
          'Train AI models on your invoices',
          'Send marketing emails (unless you opt in)',
          "Share your data with tax authorities (you're responsible for that)",
        ],
      },
    },
    {
      id: 'third-party',
      title: '5. Third-Party Processors (Sub-processors)',
      intro:
        "To run Invoice Forge, we rely on trusted infrastructure providers. Here's a transparent list of who processes your data:",
      table: {
        headers: ['Service', 'What They Do', 'What They See', 'Location'],
        rows: [
          {
            service: 'Vercel',
            purpose: 'Hosting and serverless functions',
            data: 'Encrypted application data, server logs',
            location: 'USA (with EU edge caching)',
          },
          {
            service: 'Neon',
            purpose: 'Database storage (PostgreSQL)',
            data: 'All user data (encrypted at rest)',
            location: 'USA',
          },
          {
            service: 'Auth.js OAuth Providers',
            purpose: 'Authentication via Google/GitHub',
            data: 'Your email, name, profile photo (authentication only)',
            location: 'USA (Google/GitHub servers)',
          },
        ],
      },
      safeguards: {
        title: 'Data Transfer Safeguards:',
        text: 'All providers comply with GDPR through <strong>Standard Contractual Clauses (SCCs)</strong> approved by the European Commission.',
        privacy:
          '<strong>Your data is private</strong> – no one else can see your invoices or customer lists. These processors only handle the technical infrastructure.',
      },
    },
    {
      id: 'your-rights',
      title: '6. Your Rights (GDPR & Ukrainian Law)',
      intro:
        'Under EU law (GDPR) and Ukrainian data protection law, you have the right to:',
      rights: [
        {
          icon: Check,
          title: 'Access Your Data',
          description: 'Request a copy of everything we store about you.',
        },
        {
          icon: Check,
          title: 'Correct Your Data',
          description:
            'Fix mistakes in your customer database, sender profiles, etc.',
        },
        {
          icon: Check,
          title: 'Delete Your Account',
          description:
            'Close your account anytime via Settings → Privacy → Delete Account.',
          details:
            '<strong>What gets deleted:</strong> Everything – your account, invoices, customer database, product catalog. All gone within 30 days.',
        },
        {
          icon: Check,
          title: 'Export Your Data (Data Portability)',
          description:
            'You can export all your data in <strong>JSON format</strong> at any time:',
          methods: [
            '<strong>Method 1:</strong> Go to Settings → Privacy → Export My Data',
            "<strong>Method 2:</strong> Contact us at <strong>privacy@invoiceforge.com</strong> and we'll send you a complete data export within 72 hours",
          ],
          exportIncludes:
            'Your export will include: customer lists, product catalog, invoices, sender profiles, and all associated metadata.',
        },
        {
          icon: Check,
          title: 'Restrict Processing',
          description:
            'Ask us to stop using your data (account will be suspended).',
        },
        {
          icon: Check,
          title: 'Object to Processing',
          description:
            'You may object to certain types of data processing by contacting <strong>privacy@invoiceforge.com</strong>. We will cease processing unless we have compelling legitimate grounds.',
        },
      ],
      responseTime:
        '<strong>Response Time:</strong> We will respond to all data requests within <strong>30 days</strong> (may be extended by 2 months for complex requests, with notification).',
    },
    {
      id: 'data-retention',
      title: '7. Data Retention & Deletion Schedule',
      intro: "Here's exactly how long we keep your data:",
      table: {
        headers: ['Data Type', 'Retention Period'],
        rows: [
          {
            type: 'User account & profile',
            period: 'Deleted 30 days after you close your account',
          },
          {
            type: 'Invoices & snapshots',
            period: 'Deleted with your account (30 days after closure)',
          },
          {
            type: 'Customer/product catalogs',
            period:
              'Deleted with your account (or sooner if you delete them manually)',
          },
          {
            type: 'System logs',
            period: '90 days (for security and debugging)',
            bold: true,
          },
          {
            type: 'Database backups',
            period: 'Overwritten every 7 days (rolling backups)',
            bold: true,
          },
          {
            type: 'Deleted account data',
            period:
              'Fully purged from all systems within 30 days (including backups)',
            bold: true,
          },
          {
            type: 'Authentication session',
            period: 'Expires after 30 days of inactivity or when you log out',
          },
        ],
      },
      note: "<strong>No long-term storage:</strong> We don't keep your data after you leave. Export what you need before deleting your account.",
    },
    {
      id: 'security',
      title: '8. Security: How We Protect Your Data',
      icon: Lock,
      whatWeDo: {
        title: 'What We Do',
        items: [
          'Encryption: Data is encrypted in transit (TLS/SSL) and at rest (database encryption)',
          'OAuth Only: No passwords stored – we use Google/GitHub authentication',
          'Access Controls: Only authorized team members can access infrastructure',
        ],
      },
      dontPromise: {
        title: "What We DON'T Promise",
        items: [
          '100% hack-proof (no system is)',
          "Zero downtime (we're in beta)",
        ],
      },
      breach:
        "<strong>If a breach happens:</strong> We'll notify you within 72 hours via email (GDPR requirement). We'll also inform relevant supervisory authorities if required by law.",
    },
    {
      id: 'governing-law',
      title: '9. Governing Law',
      intro:
        'This Privacy Policy is governed by the <strong>laws of Ukraine</strong> and complies with:',
      laws: [
        '<strong>GDPR</strong> (EU Regulation 2016/679)',
        '<strong>Ukrainian Law on Personal Data Protection</strong>',
        '<strong>ePrivacy Directive</strong> (2002/58/EC)',
      ],
    },
    {
      id: 'contact',
      title: '10. Contact & Data Protection Officer',
      icon: Mail,
      intro: 'For privacy questions, data requests, or concerns:',
      contacts: [
        'Email: privacy@invoiceforge.com',
        'DPO (Data Protection Officer): dpo@invoiceforge.com',
      ],
      authorities: {
        eu: {
          title: 'EU Supervisory Authority:',
          text: "If you're unhappy with how we handle your data, you can file a complaint with your national data protection authority:",
          link: {
            text: 'List of EU DPAs',
            url: 'https://edpb.europa.eu/about-edpb/board/members_en',
          },
        },
        ukraine: {
          title: 'Ukrainian Supervisory Authority:',
          link: {
            text: 'Ukrainian Parliament Commissioner for Human Rights',
            url: 'https://www.ombudsman.gov.ua/',
          },
        },
      },
    },
    {
      id: 'final-note',
      title: "11. Final Note: We're Not Tax Advisors",
      intro:
        'Invoice Forge is a <strong>productivity tool</strong>, not a tax compliance platform. You are responsible for:',
      responsibilities: [
        'Entering accurate data',
        'Complying with local tax laws',
        'Ensuring invoices meet legal requirements',
      ],
      conclusion:
        'We store your data to help you work faster, not to audit you or file your taxes.',
    },
  ],

  confirmation: {
    title: 'By using Invoice Forge, you confirm:',
    items: [
      "You've read this Privacy Policy",
      'You are 18 years of age or older',
      'You understand how we handle your data',
      'You consent to the use of strictly necessary cookies',
      'You know you can delete everything anytime',
    ],
    lastUpdated: 'Last Updated: January 23, 2026',
    compliance:
      'This policy complies with GDPR (EU) 2016/679, Ukrainian Law on Personal Data Protection, ePrivacy Directive, and EU consumer protection laws.',
  },

  footerCta: {
    headline: 'Ready to Get Started?',
    subheadline: 'Join the beta and start creating beautiful invoices today',
    button: 'Join Beta for Free',
  },
};

// ============================================================================
// TERMS OF SERVICE CONTENT
// ============================================================================

export const termsContent = {
  metadata: {
    icon: FileText,
    badge: 'Terms of Service',
    headline: {
      text: 'Simple Terms,',
      highlight: 'No Surprises',
    },
    subheadline:
      "Plain English terms of service. Know exactly what you're agreeing to.",
    effectiveDate: 'January 22, 2026',
    lastUpdated: 'January 23, 2026',
  },

  sections: [
    {
      id: 'what-it-is',
      title: "1. What Invoice Forge Is (And Isn't)",
      intro:
        'Invoice Forge is a <strong>productivity tool</strong> that helps freelancers and small businesses create beautiful, professional-looking invoice PDFs. Think of it like a fancy template generator with a database for your clients and products.',
      whatWeAre: {
        title: 'What we ARE:',
        items: [
          'A visual document creator for invoices',
          'A database for your customers, products, and pricing',
          'A PDF generator with multi-currency support',
        ],
      },
      whatWeAreNot: {
        title: 'What we ARE NOT:',
        items: [
          'A certified tax software or accounting platform',
          'A government-approved e-invoicing system',
          'A replacement for your accountant or tax advisor',
          'Responsible for the legal validity of your invoices',
        ],
      },
      agreement: {
        title: 'By using Invoice Forge, you agree:',
        items: [
          'You understand this is a helper tool, not a compliance solution',
          'You will verify all data before sending invoices to clients',
          'You are solely responsible for tax accuracy and legal compliance',
        ],
      },
    },
    {
      id: 'beta-status',
      title: '2. Beta Status: Free, But "As-Is"',
      icon: Sparkles,
      intro:
        'Invoice Forge is currently in <strong>Public Beta</strong>, which means:',
      free: {
        title: "It's Free",
        color: 'green',
        items: [
          'No payment required during beta',
          'Unlimited invoices, clients, and products',
          'Full access to all features',
        ],
      },
      noGuarantees: {
        title: 'But Zero Guarantees',
        color: 'amber',
        items: [
          'No warranty of any kind – the service is provided AS IS',
          'Data loss may happen – always backup important data',
          'Calculations might be wrong – verify totals yourself',
          "Features may break – we're actively developing",
        ],
      },
      translation: {
        icon: AlertTriangle,
        text: 'Use Invoice Forge to speed up your workflow, but always double-check your invoices before hitting send.',
      },
    },
    {
      id: 'your-responsibilities',
      title: '3. Your Responsibilities',
      invoiceIssuer: {
        title: 'You Are the Invoice Issuer',
        intro: 'When you generate an invoice with Invoice Forge:',
        items: [
          'You are the legal issuer, not us',
          'You are responsible for ensuring it meets your local tax laws',
          'You must include all mandatory fields required in your country',
        ],
      },
      quote: '"We provide the canvas; you paint the picture."',
    },
    {
      id: 'what-we-dont-do',
      title: '4. What We Do NOT Do',
      noTaxReporting: {
        title: 'No Automated Tax Reporting',
        items: [
          'We do not send invoice data to tax authorities',
          'We do not integrate with government VAT systems (OSS, MOSS, etc.)',
          'We do not file tax returns on your behalf',
        ],
      },
      noEInvoicing: {
        title: 'No E-Invoicing Compliance',
        items: [
          'Our invoices are not EN 16931 certified (the EU e-invoicing standard)',
          'We do not support Peppol network transmission',
          'We do not guarantee acceptance by government portals',
        ],
        note: 'For official e-invoicing (B2G), consult a certified provider.',
      },
    },
    {
      id: 'liability',
      title: '5. Limitation of Liability',
      icon: Shield,
      intro:
        'Since Invoice Forge is free and a beta tool, our liability is limited:',
      notResponsible: {
        title: 'We are NOT responsible for:',
        items: [
          'Lost profits or business interruption',
          'Incorrect tax calculations or invoice errors',
          'Data loss, downtime, or service outages',
          'Fines or penalties from tax authorities',
          'Damages from third-party service failures',
        ],
      },
      maximum: {
        text: '<strong>Maximum Liability:</strong> €0 (you paid nothing, so we owe nothing).',
        exception:
          "<strong>Exception:</strong> This doesn't cover intentional harm or gross negligence on our part, or mandatory consumer protections under EU law.",
      },
    },
    {
      id: 'your-data',
      title: '6. Your Data & Snapshots',
      ownership: {
        title: 'You Own Your Data',
        text: 'Customer info, invoice data, product catalogs – all yours. You can delete your account anytime.',
      },
      snapshots: {
        title: 'The Snapshot System',
        intro:
          'When you finalize an invoice, we save a <strong>snapshot</strong> (frozen copy) of:',
        items: [
          'Your sender profile',
          'The customer details',
          'Bank account info',
        ],
        why: {
          title: 'Why?',
          text: 'So your historical invoices stay accurate even if you update your client database later.',
        },
        retention:
          '<strong>Retention:</strong> Snapshots are kept as long as you use Invoice Forge. When you delete your account, all data (including snapshots) is permanently removed within 30 days.',
      },
    },
    {
      id: 'age-restriction',
      title: '7. Age Restriction',
      alert: {
        type: 'warning',
        text: 'Invoice Forge is <strong>strictly for users 18 years of age or older</strong>. By creating an account, you confirm that you are at least 18 years old.',
        action:
          'If we discover that a user is under 18, we will immediately terminate their account and delete all associated data.',
      },
    },
    {
      id: 'withdrawal',
      title: '8. Right of Withdrawal (EU Directive 2011/83/EU)',
      text: 'As this Service is provided <strong>free of charge</strong> during beta, the 14-day withdrawal right for digital content (EU Directive 2011/83/EU) <strong>does not apply</strong>.',
      note: 'You may, however, delete your account at any time through your account settings, and all your data will be permanently removed within 30 days.',
    },
    {
      id: 'user-content',
      title: '9. User-Generated Content & Liability',
      icon: Shield,
      callout: {
        title: 'Invoice Forge acts solely as a technical tool.',
        text: 'We do not monitor, review, or validate user-generated content (invoices, customer data, product descriptions).',
      },
      notLiable: {
        title: 'We are NOT liable for:',
        items: [
          'Fraudulent or illegal invoices created using our platform',
          'False information entered by users',
          'Tax evasion or regulatory violations by users',
          'Any disputes between you and your clients',
        ],
      },
      indemnify:
        '<strong>You agree to indemnify Invoice Forge</strong> against any claims, damages, or legal actions arising from invoices you create or distribute using our Service.',
    },
    {
      id: 'infrastructure',
      title: '10. Infrastructure Providers (Sub-processors)',
      intro:
        'Invoice Forge uses the following third-party services to operate:',
      table: {
        headers: ['Provider', 'Service', 'Data Processed', 'Location'],
        rows: [
          {
            provider: 'Vercel',
            service: 'Hosting & Deployment',
            data: 'Application hosting, logs',
            location: 'USA (with EU edge caching)',
          },
          {
            provider: 'Neon',
            service: 'Database (PostgreSQL)',
            data: 'All user data (encrypted at rest)',
            location: 'USA',
          },
          {
            provider: 'Auth.js OAuth',
            service: 'Authentication',
            data: 'Email, name, profile photo',
            location: 'USA (Google/GitHub)',
          },
        ],
      },
      compliance:
        'Both Vercel and Neon comply with GDPR through <strong>Standard Contractual Clauses (SCCs)</strong>. You acknowledge and consent to this data processing.',
    },
    {
      id: 'termination',
      title: '11. Account Termination',
      byYou: {
        title: 'Termination by You',
        intro:
          'You may delete your account at any time through <strong>Settings → Privacy → Delete Account</strong>. Upon deletion:',
        items: [
          'All your data (invoices, customers, products, snapshots) will be permanently removed within 30 days',
          'You will no longer have access to the Service',
        ],
      },
      byUs: {
        title: 'Termination by Us',
        color: 'red',
        intro:
          'We reserve the right to <strong>suspend or terminate your account immediately and without prior notice</strong> if:',
        items: [
          'You violate these Terms',
          'You engage in fraudulent, illegal, or abusive activity',
          'You use the Service to harm others or our infrastructure',
          'We are required to do so by law',
          'We determine, in our sole discretion, that your use poses a risk to the Service or other users',
        ],
        refunds:
          '<strong>No Refunds:</strong> Since the Service is free during beta, no refunds or compensation are owed upon termination.',
      },
    },
    {
      id: 'governing-law',
      title: '12. Governing Law & Jurisdiction',
      law: 'These Terms are governed by the <strong>laws of Ukraine</strong>.',
      jurisdiction:
        'Any disputes arising from these Terms or your use of the Service shall be resolved exclusively in the competent courts of <strong>Kyiv, Ukraine</strong>.',
    },
    {
      id: 'final-note',
      title: "13. Final Note: We're a Helper Tool",
      intro:
        '<strong>Invoice Forge is a productivity tool, not a compliance platform.</strong>',
      body: 'We help you create beautiful invoices quickly. But you are the business owner, and you are responsible for:',
      responsibilities: [
        'Tax accuracy',
        'Legal compliance',
        'Financial record-keeping',
        'The content of your invoices',
      ],
      quote: '"Use us as a helper, not a replacement for professional advice."',
    },
  ],

  confirmation: {
    title: 'By using Invoice Forge, you confirm:',
    items: [
      "You've read these Terms",
      'You are 18 years of age or older',
      'You understand the beta limitations',
      'You accept full responsibility for your invoices',
    ],
    lastUpdated: 'Last Updated: January 23, 2026',
    compliance:
      'This document complies with EU consumer protection laws (GDPR, Consumer Rights Directive 2011/83/EU) and Ukrainian law, but does NOT certify Invoice Forge for government e-invoicing systems.',
  },

  footerCta: {
    headline: 'Ready to Get Started?',
    subheadline: 'Join the beta and start creating beautiful invoices today',
    button: 'Join Beta for Free',
  },
};
