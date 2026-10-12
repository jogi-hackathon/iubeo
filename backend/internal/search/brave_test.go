package search

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestBraveSearchParsesResults(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if q.Get("q") != "go言語" || q.Get("country") != "JP" || q.Get("search_lang") != "jp" ||
			q.Get("ui_lang") != "ja-JP" || q.Get("safesearch") != "moderate" || q.Get("count") != "10" {
			t.Errorf("query = %v", q)
		}
		if r.Header.Get("X-Subscription-Token") != "key1" || r.Header.Get("Accept") != "application/json" {
			t.Errorf("headers = %v", r.Header)
		}
		_, _ = w.Write([]byte(`{"web":{"results":[
			{"title":"<strong>Go</strong> &amp; more","url":"https://go.dev/","description":"The <strong>Go</strong> &lt;lang&gt;"},
			{"title":"bad","url":"javascript:alert(1)","description":"x"},
			{"title":"no url","url":"","description":"x"}
		]}}`))
	}))
	defer srv.Close()

	got, err := NewBrave("key1", srv.URL).Search(context.Background(), "go言語")
	if err != nil {
		t.Fatal(err)
	}
	want := []Result{{Title: "Go & more", URL: "https://go.dev/", Description: "The Go <lang>"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("results = %+v, want %+v", got, want)
	}
}

func TestBraveSearchReturnsErrorOnBadStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	if _, err := NewBrave("key1", srv.URL).Search(context.Background(), "q"); err == nil {
		t.Fatal("status 429 must be an error")
	}
}

func TestBraveSearchReturnsErrorOnBadJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("<html>"))
	}))
	defer srv.Close()

	if _, err := NewBrave("key1", srv.URL).Search(context.Background(), "q"); err == nil {
		t.Fatal("broken JSON must be an error")
	}
}

func TestBraveSearchDropsBlockedHosts(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"web":{"results":[
			{"title":"npm","url":"https://www.npmjs.com/package/react","description":"x"},
			{"title":"indeed jp","url":"https://jp.indeed.com/jobs","description":"x"},
			{"title":"Go","url":"https://go.dev/","description":"x"}
		]}}`))
	}))
	defer srv.Close()

	got, err := NewBrave("key1", srv.URL).Search(context.Background(), "q")
	if err != nil {
		t.Fatal(err)
	}
	want := []Result{{Title: "Go", URL: "https://go.dev/", Description: "x"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("results = %+v, want %+v", got, want)
	}
}

func TestIsBlockedURL(t *testing.T) {
	for _, raw := range []string{
		"https://npmjs.com/",
		"https://www.npmjs.com/package/react",
		"https://JP.Indeed.com/jobs",
		"https://medium.com:443/@x",
		"https://www.g2.com/",
	} {
		if !isBlockedURL(raw) {
			t.Errorf("isBlockedURL(%q) = false, want true", raw)
		}
	}
	for _, raw := range []string{
		"https://premedium.com/",
		"https://npmjs.com.example.org/",
		"https://go.dev/",
		"https://developer.mozilla.org/",
	} {
		if isBlockedURL(raw) {
			t.Errorf("isBlockedURL(%q) = true, want false", raw)
		}
	}
}

func TestPlainText(t *testing.T) {
	if got := plainText(` <strong>A</strong>&nbsp;&quot;B&quot; <b>x</b> `); got != "A \"B\" x" {
		t.Fatalf("plainText = %q", got)
	}
}
