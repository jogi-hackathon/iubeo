package session

import (
	"math/rand/v2"
	"slices"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

var webSearchTopics = []string{
	"firefox-wasm",
	"WISP protocol",
	"three.js",
	"WebAssembly",
	"emscripten",
	"Playwright",
	"Gecko engine",
	"React Three Fiber",
	"MDN Web Docs",
	"Vite",
	"wisp-js",
	"Mercury Workshop",
}

func topicsOf(tasks []TaskState) []string {
	var topics []string
	for _, t := range tasks {
		if t.Topic != "" {
			topics = append(topics, t.Topic)
		}
	}
	return topics
}

func (st *State) assignTopics(r *rand.Rand) {
	for i := range st.Phase.Tasks {
		t := &st.Phase.Tasks[i]
		if t.Type == api.WebSearch {
			t.Topic = pickTopic(topicsOf(st.Phase.Tasks[:i]), r.IntN)
		}
	}
}

func pickTopic(used []string, intn func(n int) int) string {
	pool := slices.DeleteFunc(slices.Clone(webSearchTopics), func(topic string) bool {
		return slices.Contains(used, topic)
	})
	if len(pool) == 0 {
		pool = webSearchTopics
	}
	return pool[intn(len(pool))]
}
