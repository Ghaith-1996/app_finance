import { LegalDocumentShell } from "@/components/legal/legal-document-shell";
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
  LEGAL_MAILING_ADDRESS,
  LEGAL_OPERATOR_NAME,
  LEGAL_PRIVACY_CONTACT,
  LEGAL_PRIVACY_REQUEST_CHANNEL,
} from "@/lib/legal/constants";

export const metadata = {
  title: "Privacy Policy - Pulsefolio",
  description: "Privacy Policy for Pulsefolio.",
};

export default function PrivacyPage() {
  return (
    <LegalDocumentShell
      title="Privacy Policy"
      description="This Privacy Policy explains how Pulsefolio collects, uses, shares, retains, and protects personal information for a Canadian audience, with an Ontario-focused baseline under PIPEDA."
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      lastUpdated={LEGAL_LAST_UPDATED}
      relatedLinks={[{ href: "/terms", label: "Terms of Service" }]}
    >
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">1. Who We Are</h2>
        <p>
          Pulsefolio is operated by <strong>{LEGAL_OPERATOR_NAME}</strong> (&quot;we&quot;, &quot;us&quot;, and
          &quot;our&quot;). This Privacy Policy applies to the public site, authenticated application,
          billing flows, AI-assisted chat features, and community features we operate under the
          Pulsefolio name.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">2. Information We Collect</h2>
        <p>Depending on how you use the Service, we may collect:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Account and profile information, such as email address, name, handle, and avatar.</li>
          <li>Authentication details from sign-in providers such as Google or GitHub.</li>
          <li>Portfolio, holdings, watchlist, and community content you submit or generate.</li>
          <li>Article-chat and portfolio-copilot prompts, responses, and related context.</li>
          <li>Billing and subscription metadata, such as Stripe customer IDs, plan, and status.</li>
          <li>Security and technical data, such as IP address, session information, device or browser data, abuse-prevention signals, and service logs.</li>
          <li>Essential preference data, such as theme and language cookies or local-device settings.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">3. How We Use Information</h2>
        <p>We use personal information only as reasonably necessary to:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Authenticate users and maintain account and profile records.</li>
          <li>Store and display portfolios, holdings, watchlists, community posts, and related content.</li>
          <li>Generate personalized feed items, portfolio insights, and AI-assisted responses.</li>
          <li>Process subscription billing, account changes, and billing support flows.</li>
          <li>Protect the Service against abuse, fraud, scraping, spam, and unauthorized access.</li>
          <li>Operate, troubleshoot, secure, and improve the Service.</li>
          <li>Comply with legal obligations, resolve disputes, and enforce our terms.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">4. Service Providers and Sharing</h2>
        <p>
          We may disclose personal information to service providers that help us operate the
          Service, subject to contractual and operational controls. Based on the current repo and
          deployment model, those providers may include:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Supabase for authentication, database, and application storage.</li>
          <li>Stripe for subscription billing, checkout, and billing portal operations.</li>
          <li>Vercel for application hosting and delivery infrastructure.</li>
          <li>Cloudflare Turnstile for bot and abuse prevention on sensitive actions.</li>
          <li>Configurable AI providers, which may include Azure OpenAI, OpenRouter, Mistral, OpenAI, or Anthropic, depending on deployment configuration and feature routing.</li>
          <li>Authentication providers such as Google or GitHub when you choose those sign-in methods.</li>
        </ul>
        <p className="mt-3">
          We also rely on news and market-data providers to retrieve public or licensed content for
          the Service. We do not describe optional advertising or marketing trackers as active in
          the current product because the current repo does not show them enabled.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">5. AI and Portfolio Context</h2>
        <p>
          To provide article chat, portfolio copilot, and related AI-assisted features, we may send
          prompts and supporting context to configured AI providers. That context can include your
          questions, article excerpts or metadata, holdings context, portfolio summaries, and prior
          messages needed to generate a response. You should avoid submitting highly sensitive
          personal information in free-text prompts unless it is necessary for your intended use.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">6. Cookies and Similar Technologies</h2>
        <p>At present, the current product primarily relies on essential technologies only:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Authentication and session cookies needed to keep you signed in.</li>
          <li>Preference cookies or local storage for theme and language settings.</li>
          <li>Security checks, including Turnstile signals for sensitive write actions.</li>
        </ul>
        <p className="mt-3">
          If we later enable optional analytics or marketing technologies, we will update this
          policy and, where required, provide additional notice or choice mechanisms before relying
          on those tools.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">7. Cross-Border Processing</h2>
        <p>
          Some of our service providers may process personal information outside Canada, including
          in the United States or other jurisdictions where they operate. When personal information
          is processed outside Canada, it may be accessible to foreign courts, regulators, law
          enforcement, or national security authorities under the laws of those jurisdictions. We
          remain responsible for personal information under our control and use contractual or other
          measures intended to provide a comparable level of protection.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">8. Retention</h2>
        <p>
          We retain personal information only as long as reasonably necessary for the purposes
          described in this policy, including service delivery, security, fraud prevention, billing,
          dispute handling, and legal compliance. Specific retention periods should be finalized and
          documented before launch where they are not already defined operationally. When
          information is no longer required, we will delete, anonymize, or otherwise de-identify it
          where appropriate, subject to legal or operational retention requirements.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">9. Security Safeguards</h2>
        <p>
          We use administrative, technical, and organizational safeguards that are appropriate to
          the sensitivity of the information we handle. These may include authentication controls,
          least-privilege access, server-side access restrictions, encryption in transit where
          supported, bot and abuse prevention, and operational monitoring. No system can guarantee
          absolute security.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">10. Your Rights and Choices</h2>
        <p>Subject to applicable law, you may have the right to:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Request access to personal information we hold about you.</li>
          <li>Request correction of inaccurate or incomplete personal information.</li>
          <li>Withdraw consent for certain processing where consent is the legal basis and withdrawal is legally available.</li>
          <li>Request account closure or deletion of personal information, subject to billing, fraud-prevention, security, and legal-retention requirements.</li>
        </ul>
        <p className="mt-3">
          We do not currently promise an in-app export or deletion workflow. Rights requests and
          account-closure requests should be sent to <strong>{LEGAL_PRIVACY_REQUEST_CHANNEL}</strong>.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">11. Complaints and Privacy Contact</h2>
        <p>
          If you have questions, requests, or complaints about this Privacy Policy or our handling
          of personal information, contact our privacy contact:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Privacy contact: {LEGAL_PRIVACY_CONTACT}</li>
          <li>Email: {LEGAL_CONTACT_EMAIL}</li>
          <li>Mail: {LEGAL_MAILING_ADDRESS}</li>
        </ul>
        <p className="mt-3">
          We will investigate complaints and respond as required by applicable law. If you are not
          satisfied with our response, you may have the right to complain to the Office of the
          Privacy Commissioner of Canada.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">12. Breach Response</h2>
        <p>
          If we become aware of a privacy or security incident affecting personal information, we
          will investigate the incident, take appropriate containment and remediation steps, and
          assess any reporting or notification obligations under applicable law, including PIPEDA
          where it applies.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">13. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. If we make material changes, we may
          provide notice through the Service, by email, or by updating the effective or last-updated
          dates on this page.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">14. Contact</h2>
        <p>
          General privacy or legal correspondence for Pulsefolio may also be sent to{" "}
          <strong>{LEGAL_OPERATOR_NAME}</strong>.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Email: {LEGAL_CONTACT_EMAIL}</li>
          <li>Mail: {LEGAL_MAILING_ADDRESS}</li>
        </ul>
      </section>
    </LegalDocumentShell>
  );
}
