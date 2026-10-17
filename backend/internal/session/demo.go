package session

import (
	"fmt"
	"strings"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

// DemoTask は発表のデモで決め打ちにするタスク。Topic は web_search のお題(空ならいつもどおり抽選)
type DemoTask struct {
	Type  api.TaskType
	Topic string
}

// ParseDemoTasks は IUBEO_DEMO_TASKS を読む。フェーズを ";"、フェーズの中のタスクを "," で区切る。
// web_search だけ "web_search:お題" でお題も決められる。例: "write;web_search:名古屋 グルメ,image_generation;read_edit"
func ParseDemoTasks(s string) ([][]DemoTask, error) {
	if strings.TrimSpace(s) == "" {
		return nil, nil
	}
	var phases [][]DemoTask
	for i, phase := range strings.Split(s, ";") {
		var tasks []DemoTask
		for task := range strings.SplitSeq(phase, ",") {
			typ, topic, hasTopic := strings.Cut(strings.TrimSpace(task), ":")
			t := DemoTask{Type: api.TaskType(strings.TrimSpace(typ)), Topic: strings.TrimSpace(topic)}
			if !t.Type.Valid() {
				return nil, fmt.Errorf("phase %d: unknown task type %q", i+1, t.Type)
			}
			if hasTopic && (t.Type != api.WebSearch || t.Topic == "") {
				return nil, fmt.Errorf("phase %d: only web_search takes a topic, and it must not be empty: %q", i+1, task)
			}
			tasks = append(tasks, t)
		}
		phases = append(phases, tasks)
	}
	return phases, nil
}

// demoTasks はフェーズ number のタスクを、生き残っている全員に同じ並びで出す。
// read_edit はフェーズの中で n 個目なら棚の n 個目のファイルを全員が取り合う(棚が足りなければ write にする)
func (st *State) demoTasks(number int, script []DemoTask, alive []string) []TaskState {
	stock := st.stockFileIDs()
	var tasks []TaskState
	for _, pid := range alive {
		edits := 0
		for _, d := range script {
			t := TaskState{ID: taskID(number, len(tasks)+1), Type: d.Type, Assignee: pid, Topic: d.Topic}
			if t.Type == api.ReadEdit {
				if edits < len(stock) {
					t.TargetFileID = stock[edits]
				} else {
					t.Type = api.Write
				}
				edits++
			}
			tasks = append(tasks, t)
		}
	}
	return tasks
}
