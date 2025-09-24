// layout/app-sidebar.tsx
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { NavLink } from "react-router-dom"


export function AppSidebar({
  currentPath,
  children,
  ...props
}: {
  currentPath: string
  children: React.ReactNode
} & React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink to="/dashboard" className="flex items-center gap-2">
                <span className="font-bold">ESP viewer</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="flex-1 flex flex-col gap-6 p-4">
        <SidebarMenu>{children}</SidebarMenu>
      </SidebarContent>
    </Sidebar>
  )
}
