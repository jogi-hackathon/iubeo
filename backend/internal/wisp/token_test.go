package wisp

import (
	"testing"
	"time"
)

func fixedNow(t time.Time) func() time.Time {
	return func() time.Time { return t }
}

var testKey = []byte("0123456789abcdef0123456789abcdef")

const vectorToken = "eyJzdWIiOiJwMSIsImV4cCI6MTc5MTQ3NTUwMH0.gYfZ4NS194E_3ssWnAuuyahVxMxt9O6vjwG4W7oJHRM"

var vectorNow = time.Unix(1791475200, 0)

func TestIssueAndVerify(t *testing.T) {
	iss := NewIssuer(testKey, 0, fixedNow(vectorNow))
	token, expiresAt, err := iss.Issue("p1")
	if err != nil {
		t.Fatal(err)
	}
	if want := vectorNow.Add(DefaultTTL); !expiresAt.Equal(want) {
		t.Fatalf("expiresAt = %v, want %v", expiresAt, want)
	}
	id, ok := iss.Verify(token)
	if !ok || id != "p1" {
		t.Fatalf("Verify = (%q, %v), want (p1, true)", id, ok)
	}
}

func TestVerifyRejectsExpired(t *testing.T) {
	token, _, _ := NewIssuer(testKey, time.Minute, fixedNow(vectorNow)).Issue("p1")
	later := NewIssuer(testKey, time.Minute, fixedNow(vectorNow.Add(time.Minute)))
	if _, ok := later.Verify(token); ok {
		t.Fatal("expired token must be rejected")
	}
}

func TestVerifyRejectsWrongKeyAndTampering(t *testing.T) {
	token, _, _ := NewIssuer(testKey, 0, fixedNow(vectorNow)).Issue("p1")
	other := NewIssuer([]byte("ffffffffffffffffffffffffffffffff"), 0, fixedNow(vectorNow))
	if _, ok := other.Verify(token); ok {
		t.Fatal("token signed with another key must be rejected")
	}
	tampered := NewIssuer(testKey, 0, fixedNow(vectorNow))
	forged := vectorToken[:len(vectorToken)-2] + "AA"
	if _, ok := tampered.Verify(forged); ok {
		t.Fatal("tampered signature must be rejected")
	}
}

func TestVectorIsStable(t *testing.T) {
	token, _, err := NewIssuer(testKey, 0, fixedNow(vectorNow)).Issue("p1")
	if err != nil {
		t.Fatal(err)
	}
	if token != vectorToken {
		t.Fatalf("token = %s, want %s", token, vectorToken)
	}
}
