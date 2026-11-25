// Every signed-in screen: the page, and the tab bar under it
// (plans/crm.md, Feature 2). /login lives outside this group.
import { DayWatcher } from "@/components/day-watcher";
import { TabBar } from "@/components/tab-bar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {/* Hidden until focused. It targets this layout's one wrapper, not a
          page's <main>: hidden pages stay in the DOM under <Activity>. */}
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:inset-x-0 focus:top-0 focus:z-50 focus:flex focus:min-h-20 focus:items-center focus:outline-offset-[-4px] focus:border-b focus:border-line-strong focus:bg-surface focus:px-5 focus:pt-[env(safe-area-inset-top)] focus:font-semibold focus:text-accent"
      >
        Skip to content
      </a>
      {/* Room for the fixed tab bar (56 px) and the home indicator, so nothing hides behind it. */}
      <div id="content" tabIndex={-1} className="flex flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] outline-none">
        {children}
      </div>
      <TabBar />
      <DayWatcher />
    </>
  );
}
