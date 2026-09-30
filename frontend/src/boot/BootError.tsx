/** 起動失敗の表示。boot 中の例外と、Canvas 内(レンダラー初期化)の例外で共通に使う */
export function BootError({error}: {error: Error}) {
  return (
    <div className="boot-screen boot-error">
      <p>起動に失敗しました</p>
      <pre>{error.message}</pre>
    </div>
  );
}
