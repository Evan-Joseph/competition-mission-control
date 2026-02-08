import ThemeToggle from "../../ThemeToggle";

export default function SettingsPage() {
  return (
    <div className="p-8 animate-fade-in max-w-6xl mx-auto w-full pb-20">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">设置</h1>
        <p className="text-text-secondary">先做占位，包含主题切换。</p>
      </div>

      <div className="rounded-2xl bg-surface-dark border border-border-dark p-6 flex items-center justify-between">
        <div>
          <div className="text-white font-bold">主题</div>
          <div className="text-text-secondary text-sm mt-1">深色优先，支持切换浅色。</div>
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}
