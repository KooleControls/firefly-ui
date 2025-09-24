import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ChevronRight } from "lucide-react"
import { Link, useLocation } from "react-router-dom"
import { ModeToggle } from "./mode-toggle"

function Breadcrumbs() {
  const location = useLocation()
  const segments = location.pathname.split("/").filter(Boolean)

  const crumbs = segments.map((segment, index) => {
    const path = "/" + segments.slice(0, index + 1).join("/")
    const name = decodeURIComponent(segment)
      .replace(/-/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase())

    return { name, path, isLast: index === segments.length - 1 }
  })

  return (
    <nav className="flex items-center text-sm text-muted-foreground gap-1">
      <Link to="/" className="hover:underline text-foreground">
        Home
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <ChevronRight className="h-4 w-4" />
          {crumb.isLast ? (
            <span className="text-foreground font-medium">{crumb.name}</span>
          ) : (
            <Link to={crumb.path} className="hover:underline text-foreground">
              {crumb.name}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}

export function AppHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <Breadcrumbs />

        <div className="ml-auto flex items-center gap-2">
          

          <ModeToggle />
        </div>

      </div>

    </header>
  )
}

