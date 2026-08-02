import { useRun } from "@/store/run";
import { Home } from "@/ui/Home";
import { Builder } from "@/ui/Builder";
import { Runner } from "@/ui/Runner";
import "@/styles/app.css";

/**
 * v1 shell: a tiny view switch (no router needed) between Home, Builder and
 * Runner. Projects/presets and the House Style editor arrive in Milestone 5.
 */
export default function App() {
  const view = useRun((s) => s.view);
  return (
    <div className="app">
      {view === "home" && <Home />}
      {view === "builder" && <Builder />}
      {view === "runner" && <Runner />}
    </div>
  );
}
