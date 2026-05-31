import Link from "next/link";

import { LegalDocumentShell } from "@/components/legal/legal-document-shell";
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_GOVERNING_JURISDICTION,
  LEGAL_LAST_UPDATED,
  LEGAL_MAILING_ADDRESS,
  LEGAL_OPERATOR_NAME,
  LEGAL_REFUND_NOTICE,
} from "@/lib/legal/constants";

export const metadata = {
  title: "Terms of Service - Pulsefolio",
  description: "Terms of Service for Pulsefolio.",
};

export default function TermsPage() {
  return (
    <LegalDocumentShell
      title="Terms of Service"
      description="These Terms of Service govern access to Pulsefolio, a portfolio-aware finance workflow application that combines market data, news ingestion, AI-assisted analysis, and subscription billing."
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      lastUpdated={LEGAL_LAST_UPDATED}
      relatedLinks={[{ href: "/privacy", label: "Privacy Policy" }]}
    >
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">1. Operator and Scope</h2>
        <p>
          Pulsefolio is operated by <strong>{LEGAL_OPERATOR_NAME}</strong> (&quot;we&quot;, &quot;us&quot;, and
          &quot;our&quot;). These Terms apply to your access to and use of the Pulsefolio website,
          authenticated application, article chat, portfolio copilot, community features, and any
          related services we make available.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">2. Acceptance and Eligibility</h2>
        <p>
          By accessing or using the Service, you agree to these Terms. If you use the Service on
          behalf of an organization, you represent that you have authority to bind that
          organization. You may not use the Service if doing so would violate applicable law or any
          contractual restriction that applies to you.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">3. Service Description</h2>
        <p>
          The Service helps users organize portfolio data, ingest market and news information,
          generate portfolio-aware summaries, and ask questions about articles and holdings through
          AI-assisted workflows. Features, provider routing, quotas, and supported functionality may
          change over time.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">4. No Financial Advice</h2>
        <p>
          Pulsefolio is provided for informational and educational purposes only. The Service does
          not provide personalized investment, legal, tax, accounting, or brokerage advice, and it
          is not a recommendation or solicitation to buy, sell, or hold any security. You remain
          solely responsible for your investment decisions.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">5. Accounts and Access</h2>
        <p>
          You must provide accurate account and profile information and keep it current. You are
          responsible for activity under your account, safeguarding your credentials, and promptly
          notifying us of suspected unauthorized access. We may suspend access to protect the
          Service, investigate abuse, or comply with legal obligations.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">6. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Use the Service for unlawful, fraudulent, abusive, or deceptive activity.</li>
          <li>Attempt to reverse engineer, interfere with, or bypass security or access controls.</li>
          <li>Scrape, harvest, or bulk extract data beyond authorized use of the Service.</li>
          <li>Upload malicious code, phishing links, or content that harms other users.</li>
          <li>Misrepresent your identity, affiliation, plan status, or entitlement to paid features.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">7. User Data and License</h2>
        <p>
          You retain ownership of the data and content you submit to the Service, including
          portfolio holdings, watchlist items, community posts, and chat prompts. You grant us a
          limited license to host, process, transform, transmit, and display that content solely as
          needed to operate, secure, support, and improve the Service.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">8. AI-Assisted Features</h2>
        <p>
          The Service uses AI providers to generate summaries, portfolio commentary, and
          conversational responses. AI output may be incomplete, incorrect, biased, stale, or
          unsuitable for your use case. You must review AI-generated output critically and may not
          rely on it as the sole basis for financial or operational decisions.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">9. Third-Party Data and Services</h2>
        <p>
          The Service depends on third-party authentication, hosting, payments, AI, news, and
          market-data providers. Third-party data is provided &quot;as is,&quot; and we do not guarantee its
          accuracy, completeness, or availability. Your use of certain third-party services may also
          be subject to those providers&apos; own terms and policies.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">10. Billing, Trials, and Cancellation</h2>
        <p>
          Premium features are billed through Stripe. New paid subscriptions are initiated through
          Stripe Checkout. Existing paid subscriptions are managed through the Stripe Customer
          Portal, including payment-method updates, cancellation, and plan changes. Where offered at
          checkout, the first paid subscription may include a 7-day trial. Pricing, taxes, and
          billing intervals will be shown in the checkout or billing flow presented to you at the
          time of purchase.
        </p>
        <p className="mt-3">
          Unless required by law or expressly stated in the checkout or portal flow, fees are
          non-refundable. <strong>{LEGAL_REFUND_NOTICE}</strong>
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">11. Privacy</h2>
        <p>
          Your use of the Service is also governed by our{" "}
          <Link
            href="/privacy"
            className="font-medium text-brand underline underline-offset-2 hover:text-brand-strong"
          >
            Privacy Policy
          </Link>
          . That policy explains how we collect, use, share, retain, and protect personal
          information in connection with the Service.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">12. Intellectual Property</h2>
        <p>
          We and our licensors retain all rights in the Service, including software, design,
          branding, documentation, and non-user content. These Terms do not transfer ownership of
          our intellectual property to you.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">13. Availability and Changes</h2>
        <p>
          We may modify, suspend, or discontinue any part of the Service, including plan features,
          provider routing, quotas, and limits. We may also update these Terms. Material updates may
          be communicated through the Service, by email, or by updating the date on this page. Your
          continued use after an update takes effect means you accept the revised Terms.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">14. Suspension and Termination</h2>
        <p>
          We may suspend or terminate access if we reasonably believe you violated these Terms,
          created security or abuse risk, failed to pay applicable fees, or exposed us or other
          users to legal or operational harm. Upon termination, your right to use the Service ends,
          but provisions that should survive by their nature will continue to apply.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">15. Disclaimers</h2>
        <p>
          To the fullest extent permitted by law, the Service is provided &quot;as is&quot; and &quot;as
          available,&quot; without warranties of any kind, whether express, implied, or statutory,
          including any implied warranties of merchantability, fitness for a particular purpose,
          non-infringement, accuracy, or uninterrupted availability.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">16. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, we will not be liable for indirect, incidental,
          consequential, special, exemplary, or punitive damages, or for lost profits, lost
          revenues, lost data, lost goodwill, or investment losses arising from or related to your
          use of the Service, even if we were advised such damages were possible.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">17. Governing Law</h2>
        <p>
          These Terms are governed by the laws of <strong>{LEGAL_GOVERNING_JURISDICTION}</strong>
          {" "}and the applicable laws of Canada, except where mandatory consumer protection law
          requires otherwise.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">18. Contact</h2>
        <p>
          For legal notices or questions about these Terms, contact <strong>{LEGAL_OPERATOR_NAME}</strong>.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Email: {LEGAL_CONTACT_EMAIL}</li>
          <li>Mail: {LEGAL_MAILING_ADDRESS}</li>
        </ul>
      </section>
    </LegalDocumentShell>
  );
}
