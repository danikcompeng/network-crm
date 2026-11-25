// Every signed-in screen: the page, and the tab bar under it
// (plans/crm.md, Feature 2). /login lives outside this group.
import { DayWatcher } from "@/components/day-watcher";
import { TabBar } from "@/components/tab-bar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {/* Room for the fixed tab bar (56 px) and the home indicator, so nothing hides behind it. */}
      <div className="flex flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))]">{children}</div>
      <TabBar />
      <DayWatcher />
    </>
  );
}
