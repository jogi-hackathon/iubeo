import type {FlowNotice} from "../flow";
import type {TaskType} from "../net";

export const taskLabels: Record<TaskType, string> = {
  read_edit: "読み込みと編集",
  write: "書き込み",
  web_search: "検索",
  image_generation: "画像生成",
};

export const noticeLabels: Record<FlowNotice, string> = {
  replaced: "別のタブで入り直したため、ここは切れました",
  dissolved: "人数がそろわず、セッションは解散しました",
  abandoned: "全員が切断したままになったので、セッションは破棄されました",
  lost: "接続が切れ、再接続できませんでした",
};
