import { ArrowRight } from "lucide-react";

import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { workflowSteps } from "@/lib/mock-data";

export function HowItWorks() {
  return (
    <section id="workflow" className="px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-12">
        <SectionHeading
          eyebrow="How it works"
          title="A simpler flow from account sync to daily brief"
          description="The experience should feel less like a power-user terminal and more like a calm financial home that already understands the portfolio."
          theme="light"
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {workflowSteps.map((step, index) => (
            <Panel
              key={step.step}
              className="flex h-full flex-col gap-5 border-black/6 bg-white/80 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold tracking-[0.24em] text-brand">
                  {step.step}
                </span>
                {index < workflowSteps.length - 1 ? (
                  <ArrowRight className="hidden h-4 w-4 text-slate-400 lg:block" />
                ) : null}
              </div>
              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-slate-950">{step.title}</h3>
                <p className="text-sm leading-7 text-slate-600">
                  {step.description}
                </p>
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </section>
  );
}
