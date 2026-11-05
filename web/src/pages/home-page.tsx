import { FinalCta } from "@/components/home/final-cta"
import { HeroSection } from "@/components/home/hero-section"
import { HowItWorks } from "@/components/home/how-it-works"
import { InstallationSection } from "@/components/home/installation-section"
import { PanelLinesSection } from "@/components/home/panel-lines-section"
import { WhySection } from "@/components/home/why-section"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"

export function HomePage() {
  useDocumentTitle("PVC Wall & Ceiling Panels | PanelScan by Disenyo Interior Solution")
  // The hero animates on load; everything marked data-rv below reveals as it is reached.
  const revealRef = useScrollReveal<HTMLDivElement>()
  return (
    <div ref={revealRef}>
      <HeroSection />
      <PanelLinesSection />
      <WhySection />
      <InstallationSection />
      <HowItWorks />
      <FinalCta />
    </div>
  )
}
