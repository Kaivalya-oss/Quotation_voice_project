import { createFileRoute } from "@tanstack/react-router";
import { SiteNav } from "@/components/landing/SiteNav";
import { SiteFooter } from "@/components/landing/SiteFooter";
import {
  Benefits,
  CtaBand,
  Features,
  Hero,
  Workflow,
} from "@/components/landing/Sections";

const title = "VoiceQuote AI: Voice-Based Quotation Management";
const description =
  "Speak naturally and let AI generate professional quotations instantly, deliver them on WhatsApp, and store every record automatically.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <main>
        <Hero />
        <Features />
        <Workflow />
        <Benefits />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}
