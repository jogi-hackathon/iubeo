package voice

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

var testSeed = []byte("0123456789abcdef0123456789abcdef")

func fixedNow(t time.Time) func() time.Time {
	return func() time.Time { return t }
}

func TestIssueAndVerify(t *testing.T) {
	now := time.Unix(1791475200, 0)
	iss, err := NewIssuer(testSeed, "test", 0, fixedNow(now))
	if err != nil {
		t.Fatal(err)
	}
	token, expiresAt, err := iss.Issue("p1", "sess-1")
	if err != nil {
		t.Fatal(err)
	}
	if want := now.Add(DefaultTTL); !expiresAt.Equal(want) {
		t.Errorf("expiresAt = %v, want %v", expiresAt, want)
	}
	c, err := iss.Verify(token)
	if err != nil {
		t.Fatal(err)
	}
	if c.Sub != "p1" || c.Room != "sess-1" || c.Iss != "iubeo" || c.Exp != expiresAt.Unix() {
		t.Errorf("claims = %+v", c)
	}

	// vc と同じ手順で読めること(alg=EdDSA、base64url、3 パート)
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("token = %s", token)
	}
	head, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		t.Fatal(err)
	}
	var h struct {
		Alg string `json:"alg"`
	}
	if err := json.Unmarshal(head, &h); err != nil {
		t.Fatal(err)
	}
	if h.Alg != "EdDSA" {
		t.Errorf("alg = %q, want EdDSA", h.Alg)
	}
}

func TestVerifyRejectsExpiredAndWrongKey(t *testing.T) {
	now := time.Unix(1791475200, 0)
	token, _, _ := func() (string, time.Time, error) {
		iss, _ := NewIssuer(testSeed, "", 0, fixedNow(now))
		return iss.Issue("p1", "sess-1")
	}()

	later, _ := NewIssuer(testSeed, "", 0, fixedNow(now.Add(DefaultTTL)))
	if _, err := later.Verify(token); err == nil {
		t.Error("expired token must be rejected")
	}

	other, _ := NewIssuer([]byte("ffffffffffffffffffffffffffffffff"), "", 0, fixedNow(now))
	if _, err := other.Verify(token); err == nil {
		t.Error("token signed with another key must be rejected")
	}
}

func TestNewIssuerRejectsBadSeed(t *testing.T) {
	if _, err := NewIssuer([]byte("short"), "", 0, time.Now); err == nil {
		t.Error("a short seed must be rejected")
	}
}
