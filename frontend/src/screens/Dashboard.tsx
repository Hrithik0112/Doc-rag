import { useEffect, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { GithubCalendar } from '@/components/ui/github-calendar'
import {
  getEvalRuns, getOverview, getRecentQueries, getScoreBuckets, getTimeseries,
  type DayPoint, type EvalRun, type Overview, type QueryRow, type ScoreBucket,
} from '../api'
import { Band, Empty, Figure, Meter } from '../components/Figures'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { chartTheme } from '../lib/chart'
import { useTheme } from '../lib/theme'
import { compact, day, ms, pctLabel, stamp } from '../lib/format'

type Data = {
  overview: Overview
  series: DayPoint[]
  buckets: ScoreBucket[]
  queries: QueryRow[]
  evals: EvalRun[]
}

const STATUS_COPY: Record<
  QueryRow['status'],
  { label: string; variant: 'good' | 'warn' | 'bad' }
> = {
  ok: { label: 'Answered', variant: 'good' },
  no_hits: { label: 'No passages', variant: 'warn' },
  quota: { label: 'Quota', variant: 'warn' },
  error: { label: 'Error', variant: 'bad' },
}

export function Dashboard() {
  const { theme } = useTheme()
  // Recharts takes colours as props, not CSS variables, so the whole config is
  // re-derived when the theme flips.
  const { CHART, STATUS, axis, grid, line, tooltipStyle, barCursor } = chartTheme(theme)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = () =>
      Promise.all([
        getOverview(), getTimeseries(364), getScoreBuckets(), getRecentQueries(25), getEvalRuns(),
      ])
        .then(([overview, series, buckets, queries, evals]) => {
          if (alive) { setData({ overview, series, buckets, queries, evals }); setError(null) }
        })
        .catch((e) => alive && setError(e instanceof Error ? e.message : 'Could not load stats'))
    load()
    const t = setInterval(load, 10_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (error) {
    return <p className="p-8 text-sm text-critical">{error}</p>
  }
  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center gap-3 text-sm text-faint">
        <span className="size-1.5 animate-ping rounded-full bg-glow" aria-hidden />
        Reading the query log…
      </div>
    )
  }

  const { overview: o, series, buckets, queries, evals } = data
  const recent = series.slice(-14)
  // Window the grid to the data. A full year with one active day is mostly dead
  // space; padding it with invented history would be worse. Starts 12 weeks back
  // at minimum and grows to a year as real history accumulates.
  const firstActive = series.findIndex((d) => d.queries > 0)
  const span = firstActive === -1 ? 84 : Math.min(364, Math.max(84, series.length - firstActive + 21))
  const activity = series
    .slice(-span)
    .map((d) => ({ date: String(d.day).slice(0, 10), count: d.queries }))

  const genTokens = o.prompt_tokens + o.completion_tokens
  const failed = o.queries_quota + o.queries_error + o.queries_no_hits
  const latest = evals[0]

  const evalSeries = [...evals].reverse().map((e) => ({
    at: stamp(e.created_at),
    hybrid: (e.recall_hybrid / e.n_questions) * 100,
    vector: (e.recall_vector / e.n_questions) * 100,
  }))

  const bucketData = buckets.map((b) => ({
    label: b.bucket === 9 ? '0.040+' : b.floor.toFixed(3),
    n: b.n,
    weak: b.bucket <= 2,
  }))

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-8 max-lg:px-5">
        <header className="mb-7">
          <h1 className="font-serif text-4xl font-medium tracking-tight text-text">Instrumentation</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-dim">
            Measured from the query log, not sampled or simulated. Embedding a passage returns
            no usage metadata, so embedding token counts are local estimates and are labelled
            as such.
          </p>
        </header>

        {/* ── headline ─────────────────────────────────────────────── */}
        <Band>
          <Figure
            lead
            label="Answers fully grounded"
            value={pctLabel(o.queries_clean, o.queries_cited)}
            flip
            tone={o.queries_cited && o.queries_clean < o.queries_cited ? 'critical' : 'good'}
            note={
              o.queries_cited
                ? `${o.queries_clean} of ${o.queries_cited} cited answers had every citation trace back to a retrieved passage`
                : 'No cited answers yet'
            }
          />
          <Figure
            label="Questions answered"
            value={compact(o.queries)}
            note={`${o.queries_ok} succeeded, ${failed} did not`}
          />
          <Figure
            label="Generation tokens"
            value={compact(genTokens)}
            note={`${compact(o.prompt_tokens)} in, ${compact(o.completion_tokens)} out, reported by the API`}
          />
          <Figure
            label="Failure rate"
            value={pctLabel(failed, o.queries, '0%')}
            tone={failed ? 'critical' : 'dim'}
            note={`${o.queries_quota} quota, ${o.queries_error} error, ${o.queries_no_hits} found nothing`}
          />
        </Band>

        {/* ── usage. A year of daily counts reads better as a grid than as a
               line that is flat for 350 days; tokens keep a chart because the
               magnitude, not the rhythm, is the point. Two measures of
               different scale get two panels, never two y-axes. ─────────── */}
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_26rem] gap-5 max-xl:grid-cols-1">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="font-serif text-base font-medium">Question activity</CardTitle>
              <CardDescription className="text-xs text-faint">
                One cell per day. Shade is the count, bucketed against active days only.
                The window grows toward a year as history accumulates.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {o.queries === 0 ? (
                <Empty>Ask something and it appears here.</Empty>
              ) : (
                <GithubCalendar
                  days={activity}
                  label="Questions asked"
                  unit="questions"
                  variant="city-lights"
                  shape="rounded"
                  glowIntensity={7}
                />
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="font-serif text-base font-medium">Generation tokens</CardTitle>
              <CardDescription className="text-xs text-faint">
                Last 14 days, prompt plus completion as reported by Gemini
              </CardDescription>
            </CardHeader>
            <CardContent>
              {genTokens === 0 ? (
                <Empty>No generation yet.</Empty>
              ) : (
                <ResponsiveContainer width="100%" height={186}>
                  <AreaChart data={recent} margin={{ top: 4, right: 4, bottom: 0, left: -6 }}>
                    <defs>
                      <linearGradient id="tfill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART[1]} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={CHART[1]} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...grid} />
                    <XAxis dataKey="day" tickFormatter={day} {...axis} minTickGap={28} />
                    <YAxis tickFormatter={compact} {...axis} width={48} />
                    <Tooltip {...tooltipStyle} labelFormatter={(v) => day(String(v))}
                             formatter={(v) => [Number(v ?? 0).toLocaleString(), 'Tokens']} />
                    <Area type="monotone" dataKey="tokens" name="Tokens"
                          stroke={CHART[1]} fill="url(#tfill)" {...line} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── retrieval health ─────────────────────────────────────── */}
        <div className="mt-5 grid grid-cols-3 gap-5 max-lg:grid-cols-1">
          <Card className="col-span-2 max-lg:col-span-1">
            <CardHeader>
              <CardTitle className="font-serif text-base font-medium">
                Top-hit fusion score
              </CardTitle>
              <CardDescription className="text-xs text-faint">
                A pile-up in the two leftmost bars means retrieval is scraping. That shows here
                before the answers start going wrong.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {o.queries_ok === 0 ? (
                <Empty>No answered questions yet.</Empty>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={bucketData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid {...grid} />
                    <XAxis dataKey="label" {...axis} />
                    <YAxis allowDecimals={false} {...axis} width={40} />
                    <Tooltip {...tooltipStyle} cursor={barCursor}
                             formatter={(v) => [String(v ?? 0), 'Questions']}
                             labelFormatter={(v) => `Score from ${v}`} />
                    <Bar dataKey="n" name="Questions" radius={[4, 4, 0, 0]} maxBarSize={38}>
                      {bucketData.map((b, i) => (
                        <Cell key={i} fill={b.weak ? STATUS.warning : CHART[0]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-base font-medium">
                Which arm found it
              </CardTitle>
              <CardDescription className="text-xs text-faint">
                Across every retrieved passage. Keyword-only hits are the ones vector search
                would have missed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Meter
                parts={[
                  { label: 'Both arms agreed', n: o.hits_both_arms, color: CHART[0] },
                  { label: 'Vector only', n: o.hits_vector_only, color: CHART[1] },
                  { label: 'Keyword only', n: o.hits_keyword_only, color: CHART[2] },
                ]}
              />
            </CardContent>
          </Card>
        </div>

        {/* ── corpus, latency, eval ────────────────────────────────── */}
        <div className="mt-5 grid grid-cols-3 gap-5 max-lg:grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-base font-medium">Corpus</CardTitle>
            </CardHeader>
            <CardContent>
              <Rows
                rows={[
                  ['Documents', `${o.documents_ready} ready`],
                  ['Pages', String(o.pages)],
                  ['Passages', String(o.chunks)],
                  ['Awaiting embedding', String(o.chunks_unembedded)],
                  ['Stalled', String(o.documents_failed)],
                  ['Ingest tokens (est.)', compact(o.ingest_tokens_est)],
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-base font-medium">Latency</CardTitle>
              <CardDescription className="text-xs text-faint">
                Median and 95th percentile, answered questions only
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Rows
                rows={[
                  ['Retrieval, median', ms(o.retrieval_ms_p50)],
                  ['Retrieval, p95', ms(o.retrieval_ms_p95)],
                  ['Generation, median', ms(o.generation_ms_p50)],
                  ['Generation, p95', ms(o.generation_ms_p95)],
                ]}
              />
              <p className="mt-3 text-xs leading-snug text-faint">
                Retrieval includes one embedding round trip for the question, which is
                throttled to stay inside the free-tier rate limit.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-base font-medium">Models</CardTitle>
            </CardHeader>
            <CardContent>
              <Rows
                rows={[
                  ['Embedding', o.embed_model],
                  ['Generation', o.chat_model],
                  ['Query embed tokens (est.)', compact(o.query_embed_tokens_est)],
                  ['Citations emitted', String(o.total_citations)],
                  ['Citations unverified', String(o.unverified_citations)],
                ]}
              />
            </CardContent>
          </Card>
        </div>

        {/* ── eval trend ───────────────────────────────────────────── */}
        <Card className="mt-5">
          <CardHeader>
            <CardTitle className="font-serif text-base font-medium">Evaluation runs</CardTitle>
            <CardDescription className="text-xs text-faint">
              Recall at 5 against gold page labels, hybrid retrieval versus the vector-only
              baseline. Run <code className="font-mono">python -m backend.eval.run_eval</code> to
              add a point.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {evals.length === 0 ? (
              <Empty>No eval runs recorded yet.</Empty>
            ) : evals.length === 1 ? (
              <SingleEval run={latest} />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={evalSeries} margin={{ top: 4, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid {...grid} />
                  <XAxis dataKey="at" {...axis} minTickGap={40} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} {...axis} width={44} />
                  <Tooltip {...tooltipStyle} formatter={(v) => `${Number(v ?? 0).toFixed(0)}%`} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line dataKey="hybrid" name="Hybrid" stroke={CHART[0]} {...line} />
                  <Line dataKey="vector" name="Vector only" stroke={CHART[1]}
                        strokeDasharray="4 3" {...line} />
                </LineChart>
              </ResponsiveContainer>
            )}
            {evals.length > 1 && latest && (
              <p className="mt-3 text-xs text-faint">
                Latest: {latest.recall_hybrid}/{latest.n_questions} hybrid versus{' '}
                {latest.recall_vector}/{latest.n_questions} vector only, {stamp(latest.created_at)}.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── query log ────────────────────────────────────────────── */}
        <Card className="mt-5">
          <CardHeader>
            <CardTitle className="font-serif text-base font-medium">Recent questions</CardTitle>
            <CardDescription className="text-xs text-faint">
              Newest first. A red citation count means the answer cited a page that was not
              retrieved.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {queries.length === 0 ? (
              <Empty>Nothing logged yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[52rem]">
                  <TableHeader>
                    <TableRow className="border-y border-hair hover:bg-transparent">
                      <TableHead className="pl-4 text-faint">Question</TableHead>
                      <TableHead className="text-faint">Scope</TableHead>
                      <TableHead className="text-faint">Status</TableHead>
                      <TableHead className="text-right text-faint">Passages</TableHead>
                      <TableHead className="text-right text-faint">Top score</TableHead>
                      <TableHead className="text-right text-faint">Citations</TableHead>
                      <TableHead className="text-right text-faint">Tokens</TableHead>
                      <TableHead className="text-right text-faint">Latency</TableHead>
                      <TableHead className="pr-4 text-right text-faint">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queries.map((q) => {
                      const s = STATUS_COPY[q.status]
                      return (
                        <TableRow key={q.id} className="border-hair">
                          <TableCell className="pl-4">
                            {/* truncate needs a block box: max-width on a td is
                                ignored under auto table layout */}
                            <div className="max-w-[22rem] truncate" title={q.question}>
                              {q.question}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-faint">
                            {q.corpus_wide ? 'All documents' : 'Scoped'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={s.variant}>{s.label}</Badge>
                          </TableCell>
                          <TableCell className="tabular text-right">{q.n_hits}</TableCell>
                          <TableCell className="tabular text-right text-faint">
                            {q.top_score === null ? '—' : q.top_score.toFixed(4)}
                          </TableCell>
                          <TableCell className="tabular text-right">
                            {q.n_unverified > 0 ? (
                              <span className="text-critical">
                                {q.n_citations} ({q.n_unverified} unverified)
                              </span>
                            ) : (
                              q.n_citations
                            )}
                          </TableCell>
                          <TableCell className="tabular text-right text-faint">
                            {compact(q.prompt_tokens + q.completion_tokens)}
                          </TableCell>
                          <TableCell className="tabular text-right text-faint">
                            {ms(q.retrieval_ms + q.generation_ms)}
                          </TableCell>
                          <TableCell className="pr-4 text-right text-xs text-faint">
                            {stamp(q.created_at)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-hair/70">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-3 py-1.5 first:pt-0">
          <dt className="text-xs text-faint">{k}</dt>
          <dd className="tabular truncate text-sm">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function SingleEval({ run }: { run: EvalRun }) {
  const rate = (n: number) => `${((n / run.n_questions) * 100).toFixed(0)}%`
  return (
    <>
      <p className="text-xs text-faint">
        One run so far, so there is no trend to plot yet. Run the harness again to see movement.
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1.5 sm:grid-cols-3">
        {[
          ['Hybrid recall@5', `${rate(run.recall_hybrid)} (${run.recall_hybrid}/${run.n_questions})`],
          ['Vector-only recall@5', `${rate(run.recall_vector)} (${run.recall_vector}/${run.n_questions})`],
          ['Hybrid advantage', `+${run.recall_hybrid - run.recall_vector} questions`],
          ['Answers graded correct', run.n_graded ? `${run.n_correct}/${run.n_graded}` : 'not graded'],
          ['Citations clean', run.n_graded ? `${run.n_citation_clean}/${run.n_graded}` : 'not graded'],
          ['Took', `${run.duration_s}s`],
        ].map(([k, v]) => (
          <div key={k} className="border-t border-hair pt-1.5">
            <dt className="text-xs text-faint">{k}</dt>
            <dd className="tabular text-sm">{v}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}
