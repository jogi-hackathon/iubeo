package session

import (
	"math/rand/v2"
	"slices"
	"strconv"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

// PhaseRules はフェーズと決着の決まり(state-schema.md §5.2、ADR-0006)
type PhaseRules struct {
	// Count はフェーズの数
	Count int
	// Duration はフェーズの長さ(開始から締切まで)
	Duration time.Duration
	// Intermission はフェーズの間の長さ
	Intermission time.Duration
	// Bypass は、最後のフェーズを生き残って bypassPermission を立ててから、火がつかなくても victory にするまでの長さ
	Bypass time.Duration
	// Fire は、火をつけてから victory にするまでの長さ(燃える演出の時間)
	Fire time.Duration
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
}

var taskTypes = []api.TaskType{api.ReadEdit, api.Write, api.WebSearch, api.ImageGeneration}

var creationTaskTypes = []api.TaskType{api.Write, api.WebSearch, api.ImageGeneration}

func taskID(phase, n int) string {
	return "task-" + strconv.Itoa(phase) + "-" + strconv.Itoa(n)
}

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

	var tasks []TaskState
	for i, pid := range alive {
		left := slices.Clone(stock)
		for range quota[i] {
			t := TaskState{ID: taskID(number, len(tasks)+1), Type: taskTypes[r.IntN(len(taskTypes))], Assignee: pid}
			if t.Type == api.ReadEdit {
				if len(left) == 0 {
					t.Type = creationTaskTypes[r.IntN(len(creationTaskTypes))]
				} else {
					j := r.IntN(len(left))
					t.TargetFileID = left[j]
					left = slices.Delete(left, j, j+1)
				}
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

func (st *State) resetItems() []Output {
	var holders []string
	for _, it := range st.Items {
		if it.Location.Kind == HeldBy {
			holders = append(holders, it.Location.PlayerID)
		}
	}
	st.Items = st.initialItems()
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

func (st *State) advance(now time.Time) []Output {
	switch {
	case st.Status == api.SessionStatusPlaying && st.Phase.Status == api.PhaseStatusActive && !now.Before(st.Phase.DeadlineAt):
		return st.endPhase(st.Phase.DeadlineAt)
	case st.Status == api.SessionStatusIntermission && !now.Before(st.Phase.EndedAt.Add(st.Phases.Intermission)):
		return st.startPhase(st.Phase.Number+1, now)
	case !st.FireAt.IsZero() && !now.Before(st.FireAt.Add(st.Phases.Fire)):
		return st.finish(api.Victory, st.FireAt.Add(st.Phases.Fire))
	case st.FireAt.IsZero() && !st.BypassAt.IsZero() && !now.Before(st.BypassAt.Add(st.Phases.Bypass)):
		return st.finish(api.Victory, st.BypassAt.Add(st.Phases.Bypass))
	}
	return nil
}

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
	switch {
	case survivors == 0:
		out = append(out, st.finish(api.Defeat, at)...)
	case next == api.PhaseEndedMessageNextCompleted:
		out = append(out, st.bypass(at)...)
	}
	return out
}

func (st *State) bypass(at time.Time) []Output {
	st.Team.BypassPermission = true
	st.BypassAt = at
	out := []Output{Broadcast{Msg: api.TeamUpdatedMessage{Type: api.TeamUpdated, Seq: st.nextSeq(), Team: st.Team}}}
	for i := range st.Objects {
		o := &st.Objects[i]
		if o.Kind != api.LighterStand || st.player(o.Owner).Life != api.Alive {
			continue
		}
		o.Availability = api.ObjectAvailabilityAvailable
		out = append(out, Broadcast{Msg: st.objectUpsert(o)})
	}
	return out
}

func (st *State) startFire(p *PlayerState, o *ObjectState, now time.Time) []Output {
	st.Team.FireStarted = true
	st.FireAt = now
	id, objectID := p.ID, o.ID
	return []Output{
		Broadcast{Msg: api.TeamUpdatedMessage{Type: api.TeamUpdated, Seq: st.nextSeq(), Team: st.Team}},
		Broadcast{Msg: api.EffectMessage{Type: api.Effect, Name: api.EffectMessageNameFire, PlayerId: &id, ObjectId: &objectID}},
	}
}

func (st *State) finish(outcome api.Outcome, at time.Time) []Output {
	st.Status = api.SessionStatusFinished
	st.Result = api.Result{Outcome: outcome, DecidedAt: at}
	st.Ended = true
	return []Output{
		Broadcast{Msg: api.SessionFinishedMessage{Type: api.SessionFinished, Seq: st.nextSeq(), Result: st.Result}},
		End{Reason: ReasonFinished},
	}
}

func (st *State) stockFileIDs() []string {
	var ids []string
	for _, it := range st.Items {
		if it.Kind == api.File && isStockStatus(it.Status) && it.Location.Kind == InDirectory {
			ids = append(ids, it.ID)
		}
	}
	return ids
}

func (st *State) completeTask(playerID, fileID string, status api.FileStatus, now time.Time) []Output {
	ph := &st.Phase
	if ph.Status != api.PhaseStatusActive || !now.Before(ph.DeadlineAt) {
		return nil
	}
	for i := range ph.Tasks {
		t := &ph.Tasks[i]
		if t.Assignee != playerID || !t.CompletedAt.IsZero() {
			continue
		}
		if (t.Type == api.ReadEdit && t.TargetFileID == fileID && status == api.FileStatusEdited) ||
			(t.Type == api.Write && status == api.FileStatusFileCreated) ||
			(t.Type == api.WebSearch && status == api.FileStatusSearchCreated) ||
			(t.Type == api.ImageGeneration && status == api.FileStatusImageCreated) {
			t.CompletedAt = now
			return []Output{Broadcast{Msg: api.TaskCompletedMessage{Type: api.TaskCompleted, Seq: st.nextSeq(), TaskId: t.ID, CompletedAt: now}}}
		}
	}
	return nil
}

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
