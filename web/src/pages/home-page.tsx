import { FinalCta } from "@/components/home/final-cta"
import { RevealSection } from "@/components/layout/reveal-section"
import { HeroSection } from "@/components/home/hero-section"
import { HowItWorks } from "@/components/home/how-it-works"
import { InstallationSection } from "@/components/home/installation-section"
import { PanelLinesSection } from "@/components/home/panel-lines-section"
import { WhySection } from "@/components/home/why-section"
import { useDocumentTitle } from "@/hooks/use-document-title"

export function HomePage() {
  useDocumentTitle("PVC Wall & Ceiling Panels | PanelScan by Disenyo Interior Solution")
  return (
    <>
      {/* The hero is above the fold and never waits for a scroll. Everything
          below reveals once, the first time it is reached. */}
      <HeroSection />
      <RevealSection as="div"><PanelLinesSection /></RevealSection>
      <RevealSection as="div"><WhySection /></RevealSection>
      <RevealSection as="div"><InstallationSection /></RevealSection>
      <RevealSection as="div"><HowItWorks /></RevealSection>
      <RevealSection as="div"><FinalCta /></RevealSection>
    </>
  )
}
