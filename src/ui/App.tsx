import BoardPage from "./BoardPage";

export default function App() {
  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100">
      <BoardPage />
    </div>
  );
}

