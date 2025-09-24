// layout/sidebar-item.tsx
import { NavLink } from "react-router-dom"
import { SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar"
import type { LucideIcon } from "lucide-react"

export function AppSidebarItem({
  to,
  title,
  icon: Icon,
  currentPath,
}: {
  to: string
  title: string
  icon?: LucideIcon
  pro?: boolean
  currentPath: string
}) {
  const isActive = currentPath === to

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <div className="flex w-full items-center justify-between">
          <NavLink to={to} className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4" />}
            <span>{title}</span>
          </NavLink>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
