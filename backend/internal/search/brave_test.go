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

func TestPlainText(t *testing.T) {
	if got := plainText(` <strong>A</strong>&nbsp;&quot;B&quot; <b>x</b> `); got != "A \"B\" x" {
		t.Fatalf("plainText = %q", got)
	}
}
