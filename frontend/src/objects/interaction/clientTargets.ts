/**
 * オーソリティが管理しない、シーンが自分で置く操作対象(チュートリアルのボタンなど)。
 * 狙いの候補には、通常のオブジェクトと同じく targets.ts の registerTarget で登録する(id ごとに 1 つ)。
 * ここは「その id をクリックしたときに何をするか」だけを持つ。状態は持たない(読み書きは呼び出し側がする)
 */
export type ClientTarget = {
  /** 狙って左クリックしたときに呼ばれる */
  interact: () => void;
};

const targets = new Map<string, ClientTarget>();

/** 処理を登録する。同じ id は上書き。戻り値は解除関数(入れ替わっていたら何もしない) */
export const registerClientTarget = (
  id: string,
  target: ClientTarget,
): (() => void) => {
  targets.set(id, target);
  return () => {
    if (targets.get(id) === target) {
      targets.delete(id);
    }
  };
};

export const getClientTarget = (id: string): ClientTarget | undefined =>
  targets.get(id);

/** クライアント側の操作対象か(狙える対象かの判定に使う。サーバーの availability は無い) */
export const hasClientTarget = (id: string): boolean => targets.has(id);
