package server

import (
	"bytes"
	_ "embed"
	"html/template"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
	"github.com/jogi-hackathon/iubeo/backend/internal/search"
)

const (
	searchQueryMaxRunes  = 200
	searchTokenGrace     = time.Hour
	searchLimitPerWindow = 10
	searchWindow         = time.Minute
	fallbackSearchURL    = "https://search.yahoo.co.jp/search?p="
)

//go:embed search.html
var searchHTML string

var searchTmpl = template.Must(template.New("search").Parse(searchHTML))

type searchPage struct {
	Query    string
	Token    string
	Form     bool
	Message  string
	Fallback string
	Results  []search.Result
}

// WithSearch は検索ページの結果を取る Client を設定する。設定していなければ GetSearchPage は Yahoo! JAPAN へ飛ばす。
func (s *Server) WithSearch(client search.Client) *Server {
	s.searcher = client
	return s
}

func (s *Server) GetSearchPage(w http.ResponseWriter, r *http.Request, params api.GetSearchPageParams) {
	token := ""
	if params.T != nil {
		token = *params.T
	}
	subject := ""
	if s.wisp != nil {
		id, ok := s.wisp.VerifyWithGrace(token, searchTokenGrace)
		if !ok {
			renderSearchPage(w, http.StatusUnauthorized, searchPage{Message: "The search link is invalid or has expired. Reopen search from the start page."})
			return
		}
		subject = id
	}
	query := truncateRunes(strings.TrimSpace(params.Q), searchQueryMaxRunes)
	if query == "" {
		renderSearchPage(w, http.StatusBadRequest, searchPage{Form: true, Token: token, Message: "Enter a search query."})
		return
	}
	if !s.searchLimiter.Allow(subject) {
		renderSearchPage(w, http.StatusTooManyRequests, searchPage{Form: true, Query: query, Token: token, Message: "Too many searches. Wait a minute and try again."})
		return
	}
	if s.searcher == nil {
		h := w.Header()
		h.Set("Location", fallbackSearchURL+url.QueryEscape(query))
		h.Set("Cache-Control", "no-store")
		h.Set("Referrer-Policy", "no-referrer")
		w.WriteHeader(http.StatusFound)
		return
	}

	results, err := s.searcher.Search(r.Context(), query)
	if err != nil {
		slog.Warn("search failed", "err", err)
		renderSearchPage(w, http.StatusBadGateway, searchPage{
			Form:     true,
			Query:    query,
			Token:    token,
			Message:  "The search service did not respond. Try again later.",
			Fallback: "https://search.brave.com/search?q=" + url.QueryEscape(query),
		})
		return
	}
	renderSearchPage(w, http.StatusOK, searchPage{Form: true, Query: query, Token: token, Results: results})
}

func renderSearchPage(w http.ResponseWriter, status int, page searchPage) {
	var buf bytes.Buffer
	if err := searchTmpl.Execute(&buf, page); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	h := w.Header()
	h.Set("Content-Type", "text/html; charset=utf-8")
	h.Set("Cache-Control", "no-store")
	h.Set("Referrer-Policy", "no-referrer")
	w.WriteHeader(status)
	_, _ = w.Write(buf.Bytes())
}

func truncateRunes(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n])
}
