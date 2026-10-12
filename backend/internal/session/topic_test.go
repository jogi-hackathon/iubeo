package session

import (
	"slices"
	"testing"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

func TestPickTopicAvoidsUsed(t *testing.T) {
	last := webSearchTopics[len(webSearchTopics)-1]
	used := slices.Clone(webSearchTopics[:len(webSearchTopics)-1])
	if got := pickTopic(used, func(int) int { return 0 }); got != last {
		t.Errorf("pickTopic = %q, want the only unused topic %q", got, last)
	}
}

func TestPickTopicAllowsRepeatWhenExhausted(t *testing.T) {
	if got := pickTopic(webSearchTopics, func(int) int { return 0 }); got != webSearchTopics[0] {
		t.Errorf("pickTopic = %q, want %q once every topic is used", got, webSearchTopics[0])
	}
}

func TestPhaseTopicsGoOnlyToWebSearchAndDifferWithinPhase(t *testing.T) {
	for seed := uint64(1); seed <= 20; seed++ {
		st := NewMultiplayerState("sess-topic", []string{"p1", "p2", "p3"}, nil, t0, Timeouts{Start: 30 * time.Second, Abandon: 60 * time.Second}, DefaultConfig.Phases, seed)
		st.startPhase(3, t0)

		var topics []string
		for _, task := range st.Phase.Tasks {
			if task.Type != api.WebSearch {
				if task.Topic != "" {
					t.Fatalf("seed %d: %s task %s has topic %q", seed, task.Type, task.ID, task.Topic)
				}
				continue
			}
			if !slices.Contains(webSearchTopics, task.Topic) {
				t.Fatalf("seed %d: web_search task %s has topic %q, not in the list", seed, task.ID, task.Topic)
			}
			if slices.Contains(topics, task.Topic) {
				t.Errorf("seed %d: topic %q repeated within the phase", seed, task.Topic)
			}
			topics = append(topics, task.Topic)
		}
	}
}

func TestPhaseTopicReachesAPI(t *testing.T) {
	st := NewMultiplayerState("sess-topic", []string{"p1", "p2"}, nil, t0, Timeouts{Start: 30 * time.Second, Abandon: 60 * time.Second}, DefaultConfig.Phases, 5)
	st.startPhase(3, t0)

	for i, task := range st.apiPhase().Tasks {
		want := st.Phase.Tasks[i].Topic
		switch {
		case want == "" && task.Topic != nil:
			t.Errorf("task %s: topic = %q, want none", task.TaskId, *task.Topic)
		case want != "" && (task.Topic == nil || *task.Topic != want):
			t.Errorf("task %s: topic = %v, want %q", task.TaskId, task.Topic, want)
		}
	}
}
