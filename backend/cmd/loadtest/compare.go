package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
)

var seriesColor = []string{"#4A6FA5", "#E07A3F", "#4C9A6A", "#A85CA8"}

func renderCompare(files, labels []string, title, out string) error {
	results := make([]*result, 0, len(files))
	names := make([]string, 0, len(files))
	for i, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			return err
		}
		var r result
		if err := json.Unmarshal(b, &r); err != nil {
			return fmt.Errorf("%s: %w", f, err)
		}
		results = append(results, &r)
		name := r.Label
		if i < len(labels) && labels[i] != "" {
			name = labels[i]
		}
		if name == "" {
			name = strings.TrimSuffix(filepath.Base(f), filepath.Ext(f))
		}
		names = append(names, name)
	}

	svg := buildChart(results, names, title)
	if out == "" {
		fmt.Print(svg)
		return nil
	}
	if err := os.WriteFile(out, []byte(svg), 0o644); err != nil {
		return err
	}
	fmt.Printf("比較チャートを %s に書いた\n", out)
	return nil
}

func buildChart(results []*result, names []string, title string) string {
	const (
		width  = 1000.0
		height = 700.0
	)

	rtt := make([][]float64, len(results))
	tick := make([][]float64, len(results))
	for i, r := range results {
		rtt[i] = []float64{r.RTTMs.P50, r.RTTMs.P95, r.RTTMs.P99}
		tick[i] = []float64{r.TickIntervalMs.P50, r.TickIntervalMs.P95, r.TickIntervalMs.P99}
	}

	var b strings.Builder
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" width="%[1]v" height="%[2]v" viewBox="0 0 %[1]v %[2]v" font-family="-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Noto Sans JP', sans-serif">`, width, height)
	fmt.Fprintf(&b, `<rect width="%[1]v" height="%[2]v" fill="#FFFFFF"/>`, width, height)
	text(&b, 40, 46, title, 22, "700", "#1A1A1A")

	if len(results) > 0 {
		r := results[0]
		text(&b, 40, 70, fmt.Sprintf("クライアント %d / セッション %d / %d Hz / %0.0f 秒 (助走 %0.0f 秒を除く)",
			r.Clients, r.Clients/r.MatchSize, r.Hz, r.DurationS, r.WarmupS), 13, "400", "#5A5A5A")
	}

	legend(&b, names, 40, 100)

	drawPanel(&b, "体感レイテンシ RTT (低いほど良い)", []string{"p50", "p95", "p99"}, rtt, names, 40, 140, 440, 300, "ms")
	drawPanel(&b, "配信間隔のばらつき (20Hz = 50ms に近いほど良い)", []string{"p50", "p95", "p99"}, tick, names, 520, 140, 440, 300, "ms")

	tableY := 480.0
	text(&b, 40, tableY, "数値", 15, "700", "#1A1A1A")
	rows := [][]string{{"指標", "n", "p50", "p95", "p99", "max"}}
	for i, r := range results {
		rows = append(rows,
			[]string{names[i] + " RTT", fmt.Sprint(r.RTTMs.Count), f1(r.RTTMs.P50), f1(r.RTTMs.P95), f1(r.RTTMs.P99), f1(r.RTTMs.Max)},
			[]string{names[i] + " 配信間隔", fmt.Sprint(r.TickIntervalMs.Count), f1(r.TickIntervalMs.P50), f1(r.TickIntervalMs.P95), f1(r.TickIntervalMs.P99), f1(r.TickIntervalMs.Max)},
		)
	}
	colX := []float64{40, 300, 400, 500, 600, 700}
	for ri, row := range rows {
		y := tableY + 26 + float64(ri)*22
		weight := "400"
		if ri == 0 {
			weight = "700"
		}
		for ci, cell := range row {
			text(&b, colX[ci], y, cell, 13, weight, "#1A1A1A")
		}
	}

	if len(results) == 2 {
		diffY := tableY + 26 + float64(len(rows))*22 + 16
		text(&b, 40, diffY, conclusion(results[0], results[1], names[0], names[1]), 14, "700", "#1A1A1A")
		text(&b, 40, diffY+22, fmt.Sprintf("配信 %0.0f 通/秒 vs %0.0f 通/秒 / 切断 %d vs %d",
			results[0].MessagesPerSec, results[1].MessagesPerSec, results[0].Disconnects, results[1].Disconnects),
			13, "400", "#5A5A5A")
	}

	b.WriteString("</svg>\n")
	return b.String()
}

func conclusion(a, b *result, an, bn string) string {
	d := func(x, y float64) string {
		if y == 0 {
			return "比較できない"
		}
		pct := (x - y) / y * 100
		switch {
		case math.Abs(pct) < 2:
			return "ほぼ同じ"
		case pct < 0:
			return fmt.Sprintf("%s の方が %0.0f%% 低い", bn, -pct)
		default:
			return fmt.Sprintf("%s の方が %0.0f%% 低い", an, pct)
		}
	}
	return fmt.Sprintf("RTT p95: %s (配信間隔 p95: %s)", d(a.RTTMs.P95, b.RTTMs.P95), d(a.TickIntervalMs.P95, b.TickIntervalMs.P95))
}

func f1(v float64) string { return fmt.Sprintf("%.1f", v) }

func text(b *strings.Builder, x, y float64, s string, size float64, weight, fill string) {
	fmt.Fprintf(b, `<text x="%s" y="%s" font-size="%s" font-weight="%s" fill="%s">%s</text>`,
		f1(x), f1(y), f1(size), weight, fill, escape(s))
}

func escape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;")
	return r.Replace(s)
}

func legend(b *strings.Builder, names []string, x, y float64) {
	for i, n := range names {
		cx := x + float64(i)*200
		fmt.Fprintf(b, `<rect x="%s" y="%s" width="14" height="14" rx="2" fill="%s"/>`,
			f1(cx), f1(y-11), seriesColor[i%len(seriesColor)])
		text(b, cx+22, y, n, 14, "600", "#1A1A1A")
	}
}

func drawPanel(b *strings.Builder, title string, cats []string, values [][]float64, names []string, x, y, w, h float64, unit string) {
	const (
		padLeft   = 56.0
		padBottom = 34.0
		padTop    = 44.0
	)
	fmt.Fprintf(b, `<rect x="%s" y="%s" width="%s" height="%s" rx="8" fill="#FAFAFA" stroke="#E0E0E0"/>`,
		f1(x), f1(y), f1(w), f1(h))
	text(b, x+16, y+26, title, 14, "700", "#1A1A1A")

	plotX, plotY := x+padLeft, y+padTop
	plotW, plotH := w-padLeft-20, h-padTop-padBottom
	if plotW <= 0 || plotH <= 0 {
		return
	}

	maxV := niceMax(maxOf(values))
	if maxV <= 0 {
		text(b, plotX+10, plotY+plotH/2, "データなし", 14, "400", "#999999")
		return
	}

	for i := 0; i <= 4; i++ {
		v := maxV * float64(i) / 4
		gy := plotY + plotH - plotH*float64(i)/4
		fmt.Fprintf(b, `<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="#E8E8E8"/>`,
			f1(plotX), f1(gy), f1(plotX+plotW), f1(gy))
		text(b, plotX-8-floatLen(f1(v))*7, gy+4, f1(v), 11, "400", "#8A8A8A")
	}

	slotW := plotW / float64(len(cats))
	nSeries := float64(len(names))
	groupW := slotW * 0.68
	barW := groupW / nSeries

	for ci, cat := range cats {
		slotX := plotX + slotW*float64(ci)
		for si := range names {
			v := 0.0
			if si < len(values) && ci < len(values[si]) {
				v = values[si][ci]
			}
			bh := plotH * v / maxV
			bx := slotX + (slotW-groupW)/2 + barW*float64(si)
			by := plotY + plotH - bh
			fmt.Fprintf(b, `<rect x="%s" y="%s" width="%s" height="%s" rx="2" fill="%s"/>`,
				f1(bx), f1(by), f1(barW-2), f1(bh), seriesColor[si%len(seriesColor)])
			if v > 0 {
				text(b, bx+barW/2-floatLen(f1(v))*3.5, by-5, f1(v), 11, "600", "#333333")
			}
		}
		text(b, slotX+slotW/2-floatLen(cat)*3.5, plotY+plotH+20, cat, 12, "600", "#444444")
	}
	text(b, x+w-40, y+h-10, unit, 11, "400", "#8A8A8A")
}

func maxOf(values [][]float64) float64 {
	var m float64
	for _, s := range values {
		for _, v := range s {
			m = math.Max(m, v)
		}
	}
	return m
}

func niceMax(v float64) float64 {
	if v <= 0 {
		return 0
	}
	mag := math.Pow(10, math.Floor(math.Log10(v)))
	for _, step := range []float64{1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10} {
		if v <= step*mag {
			return step * mag
		}
	}
	return 10 * mag
}

func floatLen(s string) float64 { return float64(len([]rune(s))) }
