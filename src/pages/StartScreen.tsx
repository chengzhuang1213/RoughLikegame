export function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="start-page">
      <div className="start-copy">
        <img className="start-logo" src="/ui/start/dream-stage-logo.png" alt="DreamStage" />
      </div>
      <button className="school-gate-start" type="button" onClick={onStart} aria-label="开始巡演">
        <img src="/ui/start/start-tour-button.png" alt="" />
      </button>
    </main>
  );
}
