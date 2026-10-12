package session

import (
	"math/rand/v2"
	"strconv"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

type PhaseRules struct {
	Count        int
	Duration     time.Duration
	Intermission time.Duration
	Bypass       time.Duration
	Fire         time.Duration
}

type PhaseState struct {
	Number     int
	Status     api.PhaseStatus
	StartedAt  time.Time
	DeadlineAt time.Time
	EndedAt    time.Time
	Tasks      []TaskState
}

type TaskState struct {
	ID           string
	Type         api.TaskType
	Assignee     string
	TargetFileID string
	Topic        string
	CompletedAt  time.Time
}

var creationTaskTypes = []api.TaskType{api.Write, api.WebSearch, api.ImageGeneration}

// web_search は 1 人 1 フェーズにつき 1 件まで。2 件目以降はこちらから選ぶ
var creationTaskTypesNoSearch = []api.TaskType{api.Write, api.ImageGeneration}

func pickCreationType(r *rand.Rand, searched bool) api.TaskType {
	types := creationTaskTypes
	if searched {
		types = creationTaskTypesNoSearch
	}
	return types[r.IntN(len(types))]
}

// 同じプレイヤーに同じファイルの read_edit を出してよい回数
const sameFileLimit = 2

// 1 人あたりのタスク数。フェーズ 1 から 1, 2, 2, 3, 3, ...
func tasksPerPlayer(number int) int {
	return number/2 + 1
}

// read_edit を引く確率。後半ほど上げて、ファイルを取り合わせる
func readEditRate(number int) float64 {
	return min(0.25+0.1*float64(number-1), 0.6)
}

// read_edit の対象を、他のプレイヤーが既に対象にしたファイルから選ぶ確率
func conflictRate(number int) float64 {
	return min(0.15*float64(number-1), 0.6)
}

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
	total := tasksPerPlayer(number) * len(st.Players)
	quota := make([]int, len(alive))
	for i := range quota {
		quota[i] = total / len(alive)
	}
	for _, i := range r.Perm(len(alive))[:total%len(alive)] {
		quota[i]++
	}

	stock := st.stockFileIDs()
	claimed := map[string]bool{}

	var tasks []TaskState
	for i, pid := range alive {
		used := map[string]int{}
		var mine []string
		searched := false
		for range quota[i] {
			t := TaskState{ID: taskID(number, len(tasks)+1), Assignee: pid}
			if r.Float64() < readEditRate(number) {
				t.Type = api.ReadEdit
				var left, contested []string
				for _, id := range stock {
					if used[id] < sameFileLimit {
						left = append(left, id)
						if claimed[id] {
							contested = append(contested, id)
						}
					}
				}
				switch {
				case len(left) == 0:
					t.Type = pickCreationType(r, searched)
				case len(contested) > 0 && r.Float64() < conflictRate(number):
					t.TargetFileID = contested[r.IntN(len(contested))]
				default:
					t.TargetFileID = left[r.IntN(len(left))]
				}
				if t.TargetFileID != "" {
					used[t.TargetFileID]++
					mine = append(mine, t.TargetFileID)
				}
			} else {
				t.Type = pickCreationType(r, searched)
			}
			if t.Type == api.WebSearch {
				searched = true
			}
			tasks = append(tasks, t)
		}
		for _, id := range mine {
			claimed[id] = true
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
	st.resetCPUAgents(now)
	// お題は他の抽選(タスクの種類・CPU の性格)の後に引く。先に引くと、同じ seed の結果が変わってしまうため
	st.assignTopics(r)
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

func (st *State) apiPhase() api.Phase {
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
		if t.Topic != "" {
			task.Topic = &t.Topic
		}
		if !t.CompletedAt.IsZero() {
			task.Status = api.TaskStatusCompleted
			task.CompletedAt = &t.CompletedAt
		}
		ph.Tasks = append(ph.Tasks, task)
	}
	return ph
}
