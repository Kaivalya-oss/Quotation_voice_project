import { Link } from "@tanstack/react-router";
import { Github, Linkedin, Twitter, Youtube } from "lucide-react";
import { Logo } from "@/components/Logo";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Workflow", href: "#workflow" },
      { label: "Analytics", href: "#benefits" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About us", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Service", href: "#" },
      { label: "Security", href: "#" },
    ],
  },
];

const socials = [Twitter, Linkedin, Youtube, Github];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card/60">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.6fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">
            AI powered voice-based quotation management for modern sales teams. Speak, review, send.
          </p>
          <div className="flex gap-2">
            {socials.map((Icon, i) => (
              <a
                key={i}
                href="#"
                aria-label="Social link"
                className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-semibold">{col.title}</h3>
            <ul className="mt-4 space-y-3">
              {col.links.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-primary">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© 2026 VoiceQuote AI Technologies Pvt. Ltd. All rights reserved.</p>
          <Link to="/login" className="hover:text-primary">
            Sales executive login
          </Link>
        </div>
      </div>
    </footer>
  );
}
