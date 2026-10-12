export function BootError({error}: {error: Error}) {
  return (
    <div className="boot-screen boot-error">
      <p>起動に失敗しました</p>
      <pre>{error.message}</pre>
    </div>
  );
}
