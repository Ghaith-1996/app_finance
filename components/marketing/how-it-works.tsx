import { Reveal } from "@/components/marketing/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { workflowSteps } from "@/lib/mock-data";

export function HowItWorks() {
  return (
    <section id="workflow" className="px-4 py-24 sm:px-6 lg:px-8">
      <Reveal className="mx-auto max-w-6xl space-y-12">
        <SectionHeading
          eyebrow="How it works"
          title="From your holdings to a daily brief in three steps"
          description="Pulsefolio maps your holdings to the news that affects them, so the brief starts from what you own."
        />
        <ol className="grid gap-8 md:grid-cols-3">
          {workflowSteps.map((step) => (
            <li key={step.step} className="space-y-4">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-strong font-mono text-sm font-semibold text-brand">
                {step.step}
              </span>
              <h3 className="text-xl font-semibold text-primary">{step.title}</h3>
              <p className="text-sm text-secondary">{step.description}</p>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}
