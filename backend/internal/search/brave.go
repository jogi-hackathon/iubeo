package search

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const (
	defaultBraveEndpoint = "https://api.search.brave.com/res/v1/web/search"
	braveTimeout         = 5 * time.Second
	braveMaxBody         = 1 << 20
	braveCount           = 10
)

var tagPattern = regexp.MustCompile(`<[^>]*>`)

// blockedHosts は IUBEO のエンジンでは開けないサイト(Cloudflare などのチャレンジ、401/403 の拒否)。
// 検索結果からは外す。サブドメインも対象(例: jp.indeed.com は indeed.com で弾く)。
// 2026-10-12 に 3 回・2 種類の UA で取得して確認した。
var blockedHosts = []string{
	// Cloudflare のチャレンジ("Just a moment..." / Turnstile)
	"npmjs.com",
	"stackoverflow.com",
	"medium.com",
	"indeed.com",
	"quora.com",
	"glassdoor.com",
	"economist.com",
	"indiegogo.com",
	"kickstarter.com",
	"shadertoy.com",
	"codepen.io",
	// 403 / 401 で拒否される(チャレンジではない)
	"ft.com",
	"g2.com",
	"yelp.com",
	"tripadvisor.jp",
	"zillow.com",
	"bloomberg.com",
	"nytimes.com",
	"trustpilot.com",
	"wsj.com",
	"reuters.com",
	"adobe.com",
	"oracle.com",
	"akamai.com",
}

type Brave struct {
	key      string
	endpoint string
	client   *http.Client
}

// NewBrave は Brave Search API の クライアントを作る。endpoint が空なら本番の URL を使う。
func NewBrave(key, endpoint string) *Brave {
	if endpoint == "" {
		endpoint = defaultBraveEndpoint
	}
	return &Brave{key: key, endpoint: endpoint, client: &http.Client{Timeout: braveTimeout}}
}

type braveResponse struct {
	Web struct {
		Results []struct {
			Title       string `json:"title"`
			URL         string `json:"url"`
			Description string `json:"description"`
		} `json:"results"`
	} `json:"web"`
}

func (b *Brave) Search(ctx context.Context, query string) ([]Result, error) {
	u, err := url.Parse(b.endpoint)
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("q", query)
	q.Set("count", fmt.Sprint(braveCount))
	q.Set("country", "JP")
	q.Set("search_lang", "jp")
	q.Set("ui_lang", "ja-JP")
	q.Set("safesearch", "moderate")
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Subscription-Token", b.key)
	res, err := b.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, braveMaxBody))
		return nil, fmt.Errorf("brave: status %d", res.StatusCode)
	}
	var body braveResponse
	if err := json.NewDecoder(io.LimitReader(res.Body, braveMaxBody)).Decode(&body); err != nil {
		return nil, fmt.Errorf("brave: decode: %w", err)
	}
	results := make([]Result, 0, len(body.Web.Results))
	for _, r := range body.Web.Results {
		if !isWebURL(r.URL) || isBlockedURL(r.URL) {
			continue
		}
		results = append(results, Result{
			Title:       plainText(r.Title),
			URL:         r.URL,
			Description: plainText(r.Description),
		})
	}
	return results, nil
}

// plainText は Brave の <strong> などのタグを外し、実体参照を戻す。
func plainText(s string) string {
	return strings.TrimSpace(html.UnescapeString(tagPattern.ReplaceAllString(s, "")))
}

func isWebURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Host != "" && (u.Scheme == "http" || u.Scheme == "https")
}

// isBlockedURL は URL のホストが blockedHosts に当たるか。ドメインの境界で比べるので、premedium.com は当たらない。
func isBlockedURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	host := strings.ToLower(u.Hostname())
	for _, blocked := range blockedHosts {
		if host == blocked || strings.HasSuffix(host, "."+blocked) {
			return true
		}
	}
	return false
}
