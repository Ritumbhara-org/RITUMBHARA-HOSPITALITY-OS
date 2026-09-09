import { Bell, Search, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Sidebar } from './sidebar'

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/40 bg-background/80 backdrop-blur-xl px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:backdrop-blur-none sm:px-6">
      <Sheet>
        <SheetTrigger render={<Button size="icon" variant="ghost" className="sm:hidden hover:bg-accent" />}>
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle Menu</span>
        </SheetTrigger>
        <SheetContent side="left" className="sm:max-w-xs p-0 border-border/40">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Navigation menu</SheetDescription>
          <Sidebar />
        </SheetContent>
      </Sheet>
      
      <div className="flex w-full items-center justify-between sm:justify-end gap-4 md:ml-auto md:gap-2 lg:gap-4">
        <div className="flex-1 md:flex-initial hidden sm:block">
          <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3.5 py-2 border border-border/40">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-medium text-muted-foreground">Wonder Megacity, Bhubaneswar</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl hover:bg-accent">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">Search</span>
          </Button>
          <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl hover:bg-accent">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">Notifications</span>
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="ghost" size="icon" className="ml-1 h-9 w-9 rounded-xl hover:bg-accent" />
            }>
              <Avatar className="h-7 w-7 ring-2 ring-border">
                <AvatarImage src="" alt="Admin" />
                <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">AD</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-semibold">Admin</p>
                  <p className="text-xs text-muted-foreground">admin@ritumbhara.com</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuItem>Support</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive">Logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
