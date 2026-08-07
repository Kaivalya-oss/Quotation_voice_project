import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Brain,
  Database,
  FileText,
  Lock,
  MessageCircle,
  Mic,
  PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCountUp } from "@/hooks/use-count-up";
import heroImage from "@/assets/hero-voice-ai.jpg";

export function Hero() {
  return (
    <section className="surface-gradient relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[46rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
        <div className="animate-fade-up">
          <h1 className="mt-6 text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">
            Create Professional Quotations Using{" "}
            <span className="gradient-text">Just Your Voice</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Eliminate manual paperwork. Speak naturally, let AI generate quotations instantly, send them
            via WhatsApp, and automatically save them to your company database.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-full px-7 shadow-glow">
              <Link to="/register">
                Get Started <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-7">
              <a href="#workflow">
                <PlayCircle className="size-4" /> Watch Demo
              </a>
            </Button>
          </div>
          <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
            {[
              ["42 sec", "Average voice note"],
              ["8 sec", "Quotation generated"],
              ["1200+", "Sales teams"],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="font-display text-2xl font-semibold">{v}</dt>
                <dd className="text-xs text-muted-foreground">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="relative animate-fade-up">
          <div className="glass-card overflow-hidden rounded-3xl p-2">
            <img
              src={heroImage}
              width={1280}
              height={1024}
              alt="AI assistant listening to a salesperson and automatically creating a quotation"
              className="w-full rounded-2xl"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

const features = [
  { icon: Mic, title: "Voice-to-Quotation", text: "Convert natural speech into structured quotation details in seconds." },
  { icon: Brain, title: "AI Data Extraction", text: "Customer, products, quantity, price, GST, discount and delivery, extracted automatically." },
  { icon: FileText, title: "Automatic PDF Generation", text: "Generate branded, professional quotation PDFs instantly." },
  { icon: MessageCircle, title: "WhatsApp Integration", text: "Send quotations straight to your customer's WhatsApp." },
  { icon: Database, title: "Automatic Database Entry", text: "Every quotation is stored, with no manual data entry required." },
  { icon: BarChart3, title: "Dashboard & Analytics", text: "Track quotations, sales performance and customer history." },
  { icon: Lock, title: "Secure Authentication", text: "Role-based access for Admins and Sales Executives." },
];

export function Features() {
  return (
    <section id="features" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="max-w-2xl">
        <h2 className="text-3xl font-semibold sm:text-4xl">Everything your sales desk needs</h2>
        <p className="mt-4 text-muted-foreground">
          One workflow that replaces spreadsheets, templates, and follow-up chaos.
        </p>
      </div>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, text }) => (
          <Card key={title} className="hover-lift rounded-2xl border-border/70">
            <CardContent className="p-6">
              <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

const steps = [
  "Voice Input",
  "Speech Recognition",
  "AI Processing",
  "Quotation Generation",
  "WhatsApp Delivery",
  "Database Storage",
];

export function Workflow() {
  return (
    <section id="workflow" className="surface-gradient scroll-mt-20 border-y border-border/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold sm:text-4xl">From spoken words to a sent quotation</h2>
          <p className="mt-4 text-muted-foreground">Six automated steps. Zero manual paperwork.</p>
        </div>
        <ol className="mt-12 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {steps.map((step, i) => (
            <li
              key={step}
              className="glass-card animate-fade-up relative rounded-2xl p-5"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <span className="font-display text-sm font-semibold text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="mt-2 text-sm font-medium leading-snug">{step}</p>
              {i < steps.length - 1 && (
                <ArrowRight className="absolute -right-3 top-1/2 hidden size-5 -translate-y-1/2 text-primary/50 lg:block" />
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const stats = [
  { value: 80, suffix: "%", label: "Faster quotation creation" },
  { value: 95, suffix: "%", label: "Reduction in manual work" },
  { value: 100, suffix: "%", label: "Digital records" },
  { value: 8, suffix: " sec", label: "Instant customer delivery" },
];

function StatCard({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const { value: n, ref } = useCountUp(value);
  return (
    <Card className="hover-lift rounded-2xl border-border/70 text-center">
      <CardContent className="p-8">
        <span ref={ref} className="gradient-text font-display text-4xl font-semibold">
          {n}
          {suffix}
        </span>
        <p className="mt-3 text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

export function Benefits() {
  return (
    <section id="benefits" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>
    </section>
  );
}


export function CtaBand() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <div className="glass-card flex flex-col items-center gap-6 rounded-3xl px-6 py-14 text-center">
        <h2 className="max-w-2xl text-3xl font-semibold sm:text-4xl">
          Start quoting with your voice today
        </h2>
        <p className="max-w-xl text-muted-foreground">
          Set up your company, invite your sales executives, and send your first AI generated quotation in
          under ten minutes.
        </p>
        <Button asChild size="lg" className="rounded-full px-8 shadow-glow">
          <Link to="/register">
            Get Started <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
