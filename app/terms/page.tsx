import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Pulsefolio",
  description: "Terms of Service for Pulsefolio",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-16 lg:py-24">
        <Link
          href="/"
          className="mb-10 inline-block text-sm text-slate-400 hover:text-brand transition-colors"
        >
          &larr; Back to home
        </Link>

        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>

        <div className="mt-10 space-y-10 text-sm leading-relaxed text-slate-300">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Pulsefolio (&quot;the Service&quot;), you agree to be bound
              by these Terms of Service. If you do not agree with any part of these terms, you may
              not use the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">2. Description of Service</h2>
            <p>
              Pulsefolio is a portfolio-aware finance workflow application that ingests global
              market and news data, enriches articles with AI, runs portfolio-specific matching and
              scoring, and generates a personalized feed and portfolio insights. The Service also
              supports article-level chat and portfolio-level copilot chat.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">3. Not Financial Advice</h2>
            <p>
              The Service is provided for informational and educational purposes only. Nothing
              provided by Pulsefolio constitutes personalized investment advice, a
              recommendation, or an offer to buy or sell any security. You should consult a
              qualified financial professional before making any investment decisions. Use of the
              Service is at your own risk.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">4. User Accounts</h2>
            <p>
              You must provide accurate and complete information when creating an account. You are
              responsible for maintaining the security of your account credentials and for all
              activity that occurs under your account. You agree to notify us immediately of any
              unauthorized use.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">5. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Use the Service for any unlawful purpose or in violation of any applicable laws</li>
              <li>Attempt to reverse-engineer, decompile, or extract source code from the Service</li>
              <li>Interfere with or disrupt the integrity or performance of the Service</li>
              <li>Use automated means to scrape, harvest, or collect data from the Service beyond normal API usage</li>
              <li>Impersonate any person or entity, or misrepresent your affiliation</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">6. Intellectual Property</h2>
            <p>
              The Service, including its design, code, content, and branding, is the property of
              Pulsefolio and its licensors. You retain ownership of any data you upload (e.g.,
              portfolio holdings). By submitting data, you grant Pulsefolio a limited license
              to process it for the purpose of providing the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">7. AI-Generated Content</h2>
            <p>
              Portions of the Service use artificial intelligence to generate summaries, insights,
              and analysis. AI-generated content may contain inaccuracies, omissions, or errors. You
              acknowledge that AI output should not be relied upon as the sole basis for any
              financial decision.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">8. Third-Party Data</h2>
            <p>
              The Service integrates data from third-party providers (including market data, news
              feeds, and financial APIs). This data is provided &quot;as is&quot; without warranty.
              Pulsefolio does not guarantee the accuracy, completeness, or timeliness of
              third-party data.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">9. Billing &amp; Subscriptions</h2>
            <p>
              Certain features of the Service may require a paid subscription. Subscription fees are
              billed through Stripe. You agree to pay all applicable fees and taxes. Refunds are
              handled according to the refund policy available at the time of purchase. We reserve
              the right to change pricing with reasonable notice.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">10. Privacy</h2>
            <p>
              Your use of the Service is also governed by our Privacy Policy. We collect and process
              personal data only as necessary to operate the Service, including authentication,
              portfolio analysis, and communication. We do not sell your personal data to third
              parties.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">11. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Pulsefolio and its affiliates shall not
              be liable for any indirect, incidental, special, consequential, or punitive damages
              arising from your use of the Service, including but not limited to financial losses
              resulting from investment decisions informed by the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">12. Disclaimer of Warranties</h2>
            <p>
              The Service is provided &quot;as is&quot; and &quot;as available&quot; without
              warranties of any kind, whether express or implied, including but not limited to
              implied warranties of merchantability, fitness for a particular purpose, and
              non-infringement.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">13. Termination</h2>
            <p>
              We may suspend or terminate your access to the Service at our discretion, with or
              without notice, for conduct that we believe violates these Terms or is harmful to
              other users or the Service. Upon termination, your right to use the Service ceases
              immediately.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">14. Changes to These Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. Material changes will be
              communicated via the Service or email. Continued use after changes constitutes
              acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">15. Contact</h2>
            <p>
              If you have questions about these Terms, please open an issue on our{" "}
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand underline underline-offset-2 hover:text-brand-strong"
              >
                GitHub repository
              </a>{" "}
              or reach out through the Service.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
