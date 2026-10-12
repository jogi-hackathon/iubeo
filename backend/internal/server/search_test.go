package server

import (
	"context"
	"errors"
	"html"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/matchmaking"
	"github.com/jogi-hackathon/iubeo/backend/internal/player"
	"github.com/jogi-hackathon/iubeo/backend/internal/search"
	"github.com/jogi-hackathon/iubeo/backend/internal/session"
	"github.com/jogi-hackathon/iubeo/backend/internal/wisp"
)

type fakeSearcher struct {
	results []search.Result
	err     error
	queries []string
}

func (f *fakeSearcher) Search(_ context.Context, query string) ([]search.Result, error) {
	f.queries = append(f.queries, query)
	return f.results, f.err
}

func newSearchTestServer(t *testing.T, searcher search.Client, withWisp bool) http.Handler {
	t.Helper()
	sessions := session.NewManager(session.NewMemoryStore(), time.Now, session.DefaultConfig)
	srv := New(player.NewSigner(testKey), sessions, matchmaking.New(1, sessions, time.Now, matchmaking.Options{}), []string{testOrigin})
	if withWisp {
		srv.WithWisp(wisp.NewIssuer(wispKey, 0, time.Now), "wss://example.test/wisp/")
	}
	if searcher != nil {
		srv.WithSearch(searcher)
	}
	return srv.Handler()
}

func searchPath(q, token string) string {
	v := url.Values{"q": {q}}
	if token != "" {
		v.Set("t", token)
	}
	return "/api/v1/search/page?" + v.Encode()
}

func issueToken(t *testing.T, at time.Time) string {
	t.Helper()
	token, _, err := wisp.NewIssuer(wispKey, wisp.DefaultTTL, func() time.Time { return at }).Issue("p1")
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func body(t *testing.T, res *http.Response) string {
	t.Helper()
	b, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestSearchPageRequiresValidWispToken(t *testing.T) {
	fake := &fakeSearcher{}
	h := newSearchTestServer(t, fake, true)

	cases := []struct {
		name  string
		token string
		want  int
	}{
		{"トークンなし", "", http.StatusUnauthorized},
		{"署名が違う", issueToken(t, time.Now()) + "x", http.StatusUnauthorized},
		{"期限切れから 1 時間以内", issueToken(t, time.Now().Add(-30*time.Minute)), http.StatusOK},
		{"期限切れから 1 時間を超えた", issueToken(t, time.Now().Add(-2*time.Hour)), http.StatusUnauthorized},
		{"有効", issueToken(t, time.Now()), http.StatusOK},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			res := do(t, h, http.MethodGet, searchPath("go", c.token))
			if res.StatusCode != c.want {
				t.Fatalf("status = %d, want %d", res.StatusCode, c.want)
			}
			if c.want == http.StatusUnauthorized && !strings.Contains(body(t, res), "<!doctype html>") {
				t.Fatal("401 must be an HTML page")
			}
		})
	}
}

func TestSearchPageAllowsNoTokenWithoutWispKey(t *testing.T) {
	fake := &fakeSearcher{results: []search.Result{{Title: "Go", URL: "https://go.dev/", Description: "lang"}}}
	res := do(t, newSearchTestServer(t, fake, false), http.MethodGet, searchPath("go", ""))
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}
}

func TestSearchPageHeaders(t *testing.T) {
	res := do(t, newSearchTestServer(t, &fakeSearcher{}, false), http.MethodGet, searchPath("go", ""))
	if got := res.Header.Get("Content-Type"); got != "text/html; charset=utf-8" {
		t.Errorf("Content-Type = %q", got)
	}
	if got := res.Header.Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q", got)
	}
	if got := res.Header.Get("Referrer-Policy"); got != "no-referrer" {
		t.Errorf("Referrer-Policy = %q", got)
	}
}

func TestSearchPageRedirectsToYahooWithoutClient(t *testing.T) {
	h := newSearchTestServer(t, nil, false)
	cases := []struct{ q, want string }{
		{"go", "https://search.yahoo.co.jp/search?p=go"},
		{"go 言語", "https://search.yahoo.co.jp/search?p=go+%E8%A8%80%E8%AA%9E"},
		{"a&b=c#d", "https://search.yahoo.co.jp/search?p=a%26b%3Dc%23d"},
	}
	for _, c := range cases {
		res := do(t, h, http.MethodGet, searchPath(c.q, ""))
		if res.StatusCode != http.StatusFound {
			t.Fatalf("q=%q: status = %d, want 302", c.q, res.StatusCode)
		}
		if got := res.Header.Get("Location"); got != c.want {
			t.Fatalf("q=%q: Location = %q, want %q", c.q, got, c.want)
		}
	}
}

func TestSearchPageRedirectRequiresValidWispToken(t *testing.T) {
	h := newSearchTestServer(t, nil, true)
	if res := do(t, h, http.MethodGet, searchPath("go", "")); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("no token: status = %d, want 401", res.StatusCode)
	}
	res := do(t, h, http.MethodGet, searchPath("go", issueToken(t, time.Now())))
	if res.StatusCode != http.StatusFound {
		t.Fatalf("valid token: status = %d, want 302", res.StatusCode)
	}
}

func TestSearchPageRedirectIsRateLimited(t *testing.T) {
	h := newSearchTestServer(t, nil, false)
	for range 10 {
		do(t, h, http.MethodGet, searchPath("go", ""))
	}
	if res := do(t, h, http.MethodGet, searchPath("go", "")); res.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", res.StatusCode)
	}
}

func TestSearchPageRejectsEmptyQuery(t *testing.T) {
	fake := &fakeSearcher{}
	h := newSearchTestServer(t, fake, false)
	for _, q := range []string{"", "   ", " \t "} {
		res := do(t, h, http.MethodGet, searchPath(q, ""))
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("q=%q: status = %d, want 400", q, res.StatusCode)
		}
	}
	if len(fake.queries) != 0 {
		t.Fatalf("empty queries reached the client: %v", fake.queries)
	}
}

func TestSearchPageTruncatesQuery(t *testing.T) {
	fake := &fakeSearcher{}
	h := newSearchTestServer(t, fake, false)
	long := strings.Repeat("語", 250)
	do(t, h, http.MethodGet, searchPath(" "+long+" ", ""))
	if len(fake.queries) != 1 || len([]rune(fake.queries[0])) != 200 {
		t.Fatalf("queries = %v, want one query of 200 runes", fake.queries)
	}
}

func TestSearchPageRateLimitsPerPlayer(t *testing.T) {
	h := newSearchTestServer(t, &fakeSearcher{}, true)
	token := issueToken(t, time.Now())
	for i := range 10 {
		if res := do(t, h, http.MethodGet, searchPath("go", token)); res.StatusCode != http.StatusOK {
			t.Fatalf("request %d: status = %d, want 200", i+1, res.StatusCode)
		}
	}
	res := do(t, h, http.MethodGet, searchPath("go", token))
	if res.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", res.StatusCode)
	}
	if !strings.Contains(body(t, res), "<!doctype html>") {
		t.Fatal("429 must be an HTML page")
	}
}

func TestSearchPageBraveErrorShowsFallback(t *testing.T) {
	fake := &fakeSearcher{err: errors.New("brave: status 500")}
	res := do(t, newSearchTestServer(t, fake, false), http.MethodGet, searchPath("go 言語", ""))
	if res.StatusCode != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", res.StatusCode)
	}
	if !strings.Contains(html.UnescapeString(body(t, res)), "https://search.brave.com/search?q=go+%E8%A8%80%E8%AA%9E") {
		t.Fatal("502 page must link to Brave Search")
	}
}

func TestSearchPageRendersResultsWithLinks(t *testing.T) {
	fake := &fakeSearcher{results: []search.Result{
		{Title: "Go 公式", URL: "https://go.dev/", Description: "Go の説明"},
	}}
	res := do(t, newSearchTestServer(t, fake, false), http.MethodGet, searchPath("go", ""))
	page := body(t, res)
	for _, want := range []string{
		`<a class="title" href="https://go.dev/">Go 公式</a>`,
		"https://go.dev/</div>",
		"Go の説明",
		`name="q" value="go"`,
	} {
		if !strings.Contains(page, want) {
			t.Errorf("page missing %q", want)
		}
	}
	if strings.Contains(page, "target=") {
		t.Error("result links must not open in a new tab")
	}
}

func TestSearchPageEmptyResults(t *testing.T) {
	res := do(t, newSearchTestServer(t, &fakeSearcher{}, false), http.MethodGet, searchPath("zzz", ""))
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}
	if !strings.Contains(body(t, res), "No results for zzz") {
		t.Fatal("empty results must say so")
	}
}

func TestSearchPageEscapesQueryAndResults(t *testing.T) {
	fake := &fakeSearcher{results: []search.Result{
		{Title: `<img src=x onerror=alert(1)>`, URL: "javascript:alert(1)", Description: `<script>alert(2)</script>`},
	}}
	h := newSearchTestServer(t, fake, false)
	page := body(t, do(t, h, http.MethodGet, searchPath(`"><script>alert(3)</script>`, "")))
	for _, bad := range []string{"<script>alert", "<img src=x", `href="javascript`, `"><script>`} {
		if strings.Contains(page, bad) {
			t.Errorf("page contains unescaped %q", bad)
		}
	}
	if !strings.Contains(page, "&lt;img src=x onerror=alert(1)&gt;") {
		t.Error("title must be escaped")
	}
}

func TestSearchPageKeepsTokenOnlyInForm(t *testing.T) {
	fake := &fakeSearcher{err: errors.New("down")}
	h := newSearchTestServer(t, fake, true)
	token := issueToken(t, time.Now())
	page := body(t, do(t, h, http.MethodGet, searchPath("go", token)))
	if !strings.Contains(page, `name="t" value="`+token+`"`) {
		t.Fatal("form must keep the token for the next search")
	}
	if n := strings.Count(page, token); n != 1 {
		t.Fatalf("token appears %d times, want 1 (hidden input only)", n)
	}
}
