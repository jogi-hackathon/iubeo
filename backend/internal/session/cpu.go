package session

import (
	"strconv"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

// CpuTaskInterval は、CPU が 1 つのタスクを片付ける間隔。デバッグ用なので、人間が追える程度にゆっくりにする
const CpuTaskInterval = 1200 * time.Millisecond

// cpuStep は、デバッグ用の CPU に自分のタスクを 1 つずつ片付けさせる。tick から呼ぶ。
// 達成の判定は人間と同じ completeTask を通すので、状態の作り方はサーバーのままで、CPU だけ特別扱いしない
func (st *State) cpuStep(now time.Time) []Output {
	if st.Status != api.SessionStatusPlaying || st.Phase.Status != api.PhaseStatusActive {
		return nil
	}
	var out []Output
	for i := range st.Players {
		p := &st.Players[i]
		if p.Kind != api.Cpu || p.Life != api.Alive {
			continue
		}
		if next, ok := st.CpuNextAt[p.ID]; ok && now.Before(next) {
			continue
		}
		done := st.cpuFinishOneTask(p, now)
		if len(done) == 0 {
			continue
		}
		if st.CpuNextAt == nil {
			st.CpuNextAt = map[string]time.Time{}
		}
		st.CpuNextAt[p.ID] = now.Add(CpuTaskInterval)
		out = append(out, done...)
		if st.allTasksDone() {
			out = append(out, st.endPhase(now)...)
			break
		}
	}
	return out
}

// cpuFinishOneTask は、CPU の未完了タスクを 1 つ片付ける。いま片付けられるものが無ければ nil を返す
// (read_edit の対象を人間が持っている間は、取り上げずに待つ)
func (st *State) cpuFinishOneTask(p *PlayerState, now time.Time) []Output {
	dir := st.object(directoryID)
	for i := range st.Phase.Tasks {
		t := &st.Phase.Tasks[i]
		if t.Assignee != p.ID || !t.CompletedAt.IsZero() {
			continue
		}
		switch t.Type {
		case api.ReadEdit:
			it := st.item(t.TargetFileID)
			if it == nil || it.Location.Kind != InDirectory || !isStockStatus(it.Status) {
				continue
			}
			it.Status = api.FileStatusEdited
			out := upsertDirectory(st, dir)
			return append(out, st.completeTask(p.ID, it.ID, api.FileStatusEdited, now)...)
		case api.Write, api.ImageGeneration:
			status := api.FileStatusFileCreated
			if t.Type == api.ImageGeneration {
				status = api.FileStatusImageCreated
			}
			st.CpuItemSeq++
			id := "cpu-" + strconv.Itoa(st.CpuItemSeq)
			st.Items = append(st.Items, ItemState{
				ID:       id,
				Kind:     api.File,
				Status:   status,
				Location: Location{Kind: InDirectory, ObjectID: directoryID},
			})
			out := upsertDirectory(st, dir)
			return append(out, st.completeTask(p.ID, id, status, now)...)
		}
	}
	return nil
}

// upsertDirectory は、山の中身が変わったことを配る
func upsertDirectory(st *State, dir *ObjectState) []Output {
	if dir == nil {
		return nil
	}
	return []Output{Broadcast{Msg: st.objectUpsert(dir)}}
}
