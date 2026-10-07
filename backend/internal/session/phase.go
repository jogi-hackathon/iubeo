package session

import (
	"math/rand/v2"
	"strconv"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

// PhaseRules はフェーズの決まり(state-schema.md §5.2)
type PhaseRules struct {
	// Count はフェーズの数
	Count int
	// Duration はフェーズの長さ(開始から締切まで)
	Duration time.Duration
	// Intermission はフェーズの間の長さ
	Intermission time.Duration
}

// PhaseState はフェーズの内部状態。Number が 0 なら、まだフェーズが無い
type PhaseState struct {
	Number     int
	Status     api.PhaseStatus
	StartedAt  time.Time
	DeadlineAt time.Time
	// EndedAt はフェーズが終わった時刻(締切、または全員が完了した時刻)。ここから intermission を数える
	EndedAt time.Time
	Tasks   []TaskState
}

// TaskState はタスクの内部状態
type TaskState struct {
	ID       string
	Type     api.TaskType
	Assignee string
	// TargetFileID は read_edit のときだけ。対象の在庫ファイルの id
	TargetFileID string
	// CompletedAt はサーバーが完了を受け付けた時刻。ゼロなら未完了
	CompletedAt time.Time
	// FileID は達成に使ったファイル。同じファイルの達成は 1 回だけ数える
	FileID string
}

func taskID(phase, n int) string {
	return "task-" + strconv.Itoa(phase) + "-" + strconv.Itoa(n)
}

// startPhase は第 number フェーズを始める。タスクを作って生存者に配り、phase.started を送る。
//
// 全体の件数は number × セッション開始時の人数。生存者で均等に割り、端数は乱数で選んだ生存者に 1 件ずつ足す。
// 種類は read_edit と write から乱数で選ぶ。read_edit の対象は在庫のファイルで重複させず、
// 在庫が尽きたら write にする
// 第2フェーズからは、先にアイテムを初期状態に戻す
func (st *State) startPhase(number int, now time.Time) []Output {
	var out []Output
	if number > 1 {
		out = st.resetItems()
	}
	r := rand.New(&st.rng)

	var alive []string
	for _, p := range st.Players {
		if p.Life == api.Alive {
			alive = append(alive, p.ID)
		}
	}
	total := number * len(st.Players)
	quota := make([]int, len(alive))
	for i := range quota {
		quota[i] = total / len(alive)
	}
	for _, i := range r.Perm(len(alive))[:total%len(alive)] {
		quota[i]++
	}

	stock := st.stockFileIDs()
	r.Shuffle(len(stock), func(i, j int) { stock[i], stock[j] = stock[j], stock[i] })

	var tasks []TaskState
	for i, pid := range alive {
		for range quota[i] {
			t := TaskState{ID: taskID(number, len(tasks)+1), Type: api.Write, Assignee: pid}
			if r.IntN(2) == 0 && len(stock) > 0 {
				t.Type = api.ReadEdit
				t.TargetFileID, stock = stock[0], stock[1:]
			}
			tasks = append(tasks, t)
		}
	}

	st.Status = api.SessionStatusPlaying
	st.Phase = PhaseState{
		Number:     number,
		Status:     api.PhaseStatusActive,
		StartedAt:  now,
		DeadlineAt: now.Add(st.Phases.Duration),
		Tasks:      tasks,
	}
	return append(out, Broadcast{Msg: api.PhaseStartedMessage{Type: api.PhaseStarted, Seq: st.nextSeq(), ServerTime: now, Phase: st.apiPhase()}})
}

// resetItems はアイテムを初期状態に戻す(ディレクトリの在庫を初期化し、成果物・手持ちは消す。state-schema.md §5.2)
func (st *State) resetItems() []Output {
	var holders []string
	for _, it := range st.Items {
		if it.Location.Kind == HeldBy {
			holders = append(holders, it.Location.PlayerID)
		}
	}
	st.Items = initialItems()
	var out []Output
	if o := st.object(directoryID); o != nil {
		out = append(out, Broadcast{Msg: st.objectUpsert(o)})
	}
	for _, id := range holders {
		if p := st.player(id); p != nil {
			out = append(out, Broadcast{Msg: st.playerUpdated(p)})
		}
	}
	return out
}

// advance は時刻が進んだことで起きるフェーズの切り替えを行う。Step は時刻を持つ入力を処理する前に、まずこれを呼ぶ。
// こうして締切を過ぎた後の入力は、締切の処理の後で扱う(締切と完了の順序。state-schema.md §5.1)
func (st *State) advance(now time.Time) []Output {
	switch {
	case st.Status == api.SessionStatusPlaying && st.Phase.Status == api.PhaseStatusActive && !now.Before(st.Phase.DeadlineAt):
		return st.endPhase(st.Phase.DeadlineAt)
	case st.Status == api.SessionStatusIntermission && !now.Before(st.Phase.EndedAt.Add(st.Phases.Intermission)):
		return st.startPhase(st.Phase.Number+1, now)
	}
	return nil
}

// allTasksDone は生存者全員が担当のタスクを完了したか
func (st *State) allTasksDone() bool {
	for _, t := range st.Phase.Tasks {
		if t.CompletedAt.IsZero() && st.player(t.Assignee).Life == api.Alive {
			return false
		}
	}
	return true
}

func (st *State) hasPendingTask(playerID string) bool {
	for _, t := range st.Phase.Tasks {
		if t.Assignee == playerID && t.CompletedAt.IsZero() {
			return true
		}
	}
	return false
}

// endPhase はフェーズを終える。未達の生存者を脱落させ(player.updated と effect の fall)、作業中のアクションを取りやめ、
// phase.ended を送る。最後のフェーズだったか生存者がいなければ、決着をつける
func (st *State) endPhase(at time.Time) []Output {
	var out []Output
	eliminated := []string{}
	for i := range st.Players {
		p := &st.Players[i]
		if p.Life != api.Alive || !st.hasPendingTask(p.ID) {
			continue
		}
		p.Life = api.Eliminated
		out = append(out, st.releasePlayer(p)...)
		id := p.ID
		out = append(out,
			Broadcast{Msg: st.playerUpdated(p)},
			Broadcast{Msg: api.EffectMessage{Type: api.Effect, Name: api.EffectMessageNameFall, PlayerId: &id}},
		)
		eliminated = append(eliminated, p.ID)
	}
	out = append(out, st.cancelActions()...)

	survivors := 0
	for _, p := range st.Players {
		if p.Life == api.Alive {
			survivors++
		}
	}
	st.Phase.EndedAt = at
	next := api.PhaseEndedMessageNextIntermission
	if survivors == 0 || st.Phase.Number >= st.Phases.Count {
		next = api.PhaseEndedMessageNextCompleted
		st.Phase.Status = api.PhaseStatusCompleted
	} else {
		st.Phase.Status = api.PhaseStatusIntermission
		st.Status = api.SessionStatusIntermission
	}
	out = append(out, Broadcast{Msg: api.PhaseEndedMessage{
		Type: api.PhaseEnded, Seq: st.nextSeq(), PhaseNumber: st.Phase.Number, EliminatedPlayerIds: eliminated, Next: next,
	}})
	if next == api.PhaseEndedMessageNextCompleted {
		// 決着は仮: 最後のフェーズを生存者が 1 人以上で終えれば victory、途中で全員脱落したら defeat
		outcome := api.Victory
		if survivors == 0 {
			outcome = api.Defeat
		}
		out = append(out, st.finish(outcome, at)...)
	}
	return out
}

// finish は決着をつけ、session.finished を送ってからセッションを終える(ADR-0004)
func (st *State) finish(outcome api.Outcome, at time.Time) []Output {
	st.Status = api.SessionStatusFinished
	st.Result = api.Result{Outcome: outcome, DecidedAt: at}
	st.Ended = true
	return []Output{
		Broadcast{Msg: api.SessionFinishedMessage{Type: api.SessionFinished, Seq: st.nextSeq(), Result: st.Result}},
		End{Reason: ReasonFinished},
	}
}

// stockFileIDs はディレクトリの在庫のファイルの id を、初期在庫の並びで返す
func (st *State) stockFileIDs() []string {
	var ids []string
	for _, it := range st.Items {
		if it.Kind == api.File && isStockStatus(it.Status) && it.Location.Kind == InDirectory {
			ids = append(ids, it.ID)
		}
	}
	return ids
}

// completeTask は、担当者がファイルをディレクトリに入れたときに、それで達成になるタスクを完了にする(state-schema.md §5.1)。
// read_edit は対象のファイルを編集済みで、write は作ったファイルを入れたとき。締切より前に受け付けたものだけ数える。
// 完了にしたら task.completed を返す
func (st *State) completeTask(playerID string, f *ItemState, now time.Time) []Output {
	ph := &st.Phase
	if ph.Status != api.PhaseStatusActive || !now.Before(ph.DeadlineAt) {
		return nil
	}
	for _, t := range ph.Tasks {
		if t.FileID == f.ID {
			return nil
		}
	}
	for i := range ph.Tasks {
		t := &ph.Tasks[i]
		if t.Assignee != playerID || !t.CompletedAt.IsZero() {
			continue
		}
		if (t.Type == api.ReadEdit && t.TargetFileID == f.ID && f.Status == api.FileStatusEdited) ||
			(t.Type == api.Write && f.Status == api.FileStatusFileCreated) {
			t.CompletedAt = now
			t.FileID = f.ID
			return []Output{Broadcast{Msg: api.TaskCompletedMessage{Type: api.TaskCompleted, Seq: st.nextSeq(), TaskId: t.ID, CompletedAt: now}}}
		}
	}
	return nil
}

// apiPhase はフェーズを配る形に組み立てる
func (st State) apiPhase() api.Phase {
	ph := api.Phase{
		Number:     st.Phase.Number,
		Status:     st.Phase.Status,
		StartedAt:  st.Phase.StartedAt,
		DeadlineAt: st.Phase.DeadlineAt,
		Tasks:      make([]api.Task, 0, len(st.Phase.Tasks)),
	}
	for _, t := range st.Phase.Tasks {
		task := api.Task{TaskId: t.ID, Type: t.Type, AssigneePlayerId: t.Assignee, Status: api.TaskStatusPending}
		if t.TargetFileID != "" {
			task.TargetFileId = &t.TargetFileID
		}
		if !t.CompletedAt.IsZero() {
			task.Status = api.TaskStatusCompleted
			task.CompletedAt = &t.CompletedAt
		}
		ph.Tasks = append(ph.Tasks, task)
	}
	return ph
}
