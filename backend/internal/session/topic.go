package session

import (
	"math/rand/v2"
	"slices"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

// webSearchTopics は Web 検索タスクのお題の候補。お題はサーバーがタスクごとに決めて、クライアントは表示と判定に使う。
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

// assignTopics は、フェーズの web_search タスクにお題を割り当てる。同じフェーズ内では、なるべく別々の語になる。
func (st *State) assignTopics(r *rand.Rand) {
	for i := range st.Phase.Tasks {
		t := &st.Phase.Tasks[i]
		if t.Type == api.WebSearch {
			t.Topic = pickTopic(topicsOf(st.Phase.Tasks[:i]), r.IntN)
		}
	}
}

// pickTopic は、同じフェーズで既に使われているお題を避けて引く。候補を使い切ったら、重複を許す。
// intn は [0, n) の乱数を返す関数。
func pickTopic(used []string, intn func(n int) int) string {
	pool := slices.DeleteFunc(slices.Clone(webSearchTopics), func(topic string) bool {
		return slices.Contains(used, topic)
	})
	if len(pool) == 0 {
		pool = webSearchTopics
	}
	return pool[intn(len(pool))]
}
