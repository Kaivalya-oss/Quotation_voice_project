import type { ReactNode } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  FileText,
  PieChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/new-quotation", label: "New Quotation", icon: Mic },
  { to: "/app/quotations", label: "Quotations", icon: FileText },
  { to: "/app/customers", label: "Customers", icon: Users },
  { to: "/app/analytics", label: "Analytics", icon: PieChart },
  { to: "/app/admin", label: "Admin Panel", icon: ShieldCheck },
  { to: "/app/settings", label: "Settings", icon: Settings },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Sidebar">
      {nav.map(({ to, label, icon: Icon, ...rest }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          activeOptions={{ exact: "exact" in rest ? rest.exact : false }}
          className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-primary/10 data-[status=active]:text-primary"
        >
          <Icon className="size-4.5 shrink-0" />
          <span className="truncate">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        <Logo />
      </div>
      <div className="flex-1 overflow-y-auto">
        <NavLinks onNavigate={onNavigate} />
      </div>
      <div className="p-3">
        <div className="glass-card rounded-2xl p-4">
          <p className="text-xs font-semibold">AI credits</p>
          <p className="mt-1 text-xs text-muted-foreground">1,240 of 2,000 voice minutes used</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-[62%] rounded-full bg-primary" />
          </div>
        </div>
        <Link
          to="/login"
          className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="size-4.5" /> Logout
        </Link>
      </div>
    </div>
  );
}

const notifications = [
  { title: "QT-2041 delivered on WhatsApp", time: "4 min ago" },
  { title: "Northline Foods approved QT-2039", time: "1 hr ago" },
  { title: "Monthly analytics report is ready", time: "Yesterday" },
];

export function AppShell() {
  const { dark, toggle } = useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const crumb = nav.find((n) => n.to === pathname)?.label ?? "Dashboard";

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarBody />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="grid h-16 grid-cols-[auto_1fr_auto] items-center gap-3 px-4 sm:px-6">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open navigation">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SidebarBody />
              </SheetContent>
            </Sheet>

            <div className="relative hidden min-w-0 max-w-md lg:block">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search quotations, customers…" className="rounded-full pl-9" />
            </div>
            <div className="lg:hidden" />

            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
                {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                    <Bell className="size-5" />
                    <span className="absolute right-2 top-2 size-2 rounded-full bg-destructive" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifications.map((n) => (
                    <DropdownMenuItem key={n.title} className="flex-col items-start gap-0.5">
                      <span className="text-sm">{n.title}</span>
                      <span className="text-xs text-muted-foreground">{n.time}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-muted">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-primary/10 text-primary">PN</AvatarFallback>
                    </Avatar>
                    <span className="hidden text-sm font-medium sm:block">Priya Nair</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="flex flex-col">
                    Priya Nair
                    <Badge variant="secondary" className="mt-1 w-fit">
                      Sales Executive
                    </Badge>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/app/settings">Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/login">Logout</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <div className="flex items-center gap-1.5 px-4 pt-5 text-xs text-muted-foreground sm:px-6">
          <Link to="/app" className="hover:text-primary">
            VoiceQuote
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-foreground">{crumb}</span>
        </div>

        <main className="flex-1 px-4 pb-12 pt-4 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4")}>
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
