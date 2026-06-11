# Architectural Review & Enterprise Refactor Plan (Synapse B2B SaaS)

> **Canonical roadmap** (agreed 2026-06-12). Execute top-down by priority. Detailed
> per-phase waste audit kept as Appendix below.
>
> **✅ Phase 0.5 — Dead code/infra cleanup DONE (2026-06-12):** removed dead `packages/ui`
> (never imported), MinIO/S3 (container + env + schema, no upload code), `Team` model
> (migration `cleanup_team_minio`), dead `GOOGLE_*` env, orphan `emit-test-workspace.ts`.
>
> **✅ Right-sizing / de-over-engineering DONE (2026-06-12):** the whole §3 simplification
> shipped. **api → web** (tRPC now in-process via `createCaller` with the real NextAuth
> session → the P0 `x-user-id` impersonation hole is **closed**, separate process gone).
> **Kafka + 6 consumer services → 1 `services/worker`** using Postgres `LISTEN/NOTIFY`
> (trigger `outbox_notify`); each event projects to activity+audit+notification+analytics
> **and marks the outbox PUBLISHED in one transaction** (exactly-once, no ProcessedEvent
> needed). **Meilisearch → Postgres** full-text in the router (`packages/search` +
> `search-indexer` deleted). Infra: **5 containers → 2** (Postgres + Redis); dev processes
> **9 → 3** (web, realtime, worker). Green: typecheck 8/8, test 22/22, lint, build; worker
> verified live (outbox insert → NOTIFY → projections → PUBLISHED).
> Security score is now ~7/10 (impersonation closed; still TODO: API rate-limit).

## 1. Executive Summary & Core Metrics
- **Current Architecture Score:** ~5.7 / 10 (Event-Driven MVP stage)
- **Lockfile:** 7514 lines (~250–300 KB, healthy)
- **Router debt:** `apps/api/src/router.ts` — 697 lines, 24 procedures, **0 layers**
- **Security surface:** High (unsigned trust-header identity model)
- **DB strategy:** 100% type-safe Prisma (no raw SQL, SQLi surface ~0)

## 1.5 Project Structure (visual)

```text
synapse/
├── apps/
│   ├── api/                          # tRPC Core API (standalone HTTP)
│   │   └── src/
│   │       ├── main.ts               # server bootstrap
│   │       ├── trpc.ts               # context + procedures   🔴 P0: unsigned x-user-id trust
│   │       ├── router.ts             # 🟠 697 lines · 24 procs · ALL business logic (P1: split)
│   │       ├── realtime.ts           # Redis publish (board changes)
│   │       └── env.ts
│   ├── realtime/                     # WebSocket hub
│   │   └── src/
│   │       ├── index.ts              # WS server · board presence · Redis relay
│   │       ├── yjs.ts                # Faz 3/4: Yjs CRDT sync + Postgres persistence
│   │       └── env.ts
│   └── web/                          # Next.js 15 (App Router) + React 19
│       └── src/
│           ├── app/
│           │   ├── (app)/            # authed shell: layout · global-search · notification-bell
│           │   │   ├── dashboard/
│           │   │   └── workspace/[slug]/
│           │   │       └── project/[projectId]/   # kanban-board · doc-editor · canvas-board
│           │   ├── (auth)/           # login · register
│           │   ├── api/              # nextauth · register · health
│           │   └── invite/[token]/
│           ├── components/ui/        # shadcn primitives (dialog, select, …)
│           └── lib/                  # api client · use-board-socket · utils
├── services/                         # Kafka consumers (event-driven backbone)
│   ├── outbox-publisher/             # Faz 1: Outbox → Kafka relay   🟡 1s poll (P2)
│   ├── activity/                     # Faz 1: events → activity feed
│   ├── search-indexer/               # Faz 5: events → Meilisearch   🟡 full reindex on boot (P2)
│   ├── audit/                        # Faz 5: events → audit log     🟠 ~80% overlaps activity (P1: merge)
│   ├── notification/                 # Faz 5: member events → notifications
│   └── analytics/                    # Faz 5: events → daily metrics 🟠 derive from audit (P1: drop)
├── packages/                         # shared workspace libraries
│   ├── db/                           # Prisma schema · client · seed
│   ├── events/                       # Zod event schemas + kafkajs helpers
│   ├── auth/                         # RBAC + scrypt password
│   ├── search/                       # Meilisearch client + EntityDoc
│   ├── env/                          # Zod env validation (getEnv)  🔴 services don't call it (P0)
│   ├── ui/                           # shared UI primitives
│   ├── ratelimit/                    # Redis rate limiter           🔴 only used in auth (P0: globalize)
│   └── config/                       # shared tsconfig presets
├── infra/
│   └── docker-compose.yml            # Postgres · Redis · Redpanda · Meilisearch · MinIO
├── .github/workflows/ci.yml          # lint · typecheck · test · build
├── turbo.json · pnpm-workspace.yaml · vitest.config.ts
└── REVIEW.md                         # ← this file
```

> Legend: 🔴 P0 (security)  ·  🟠 P1 (layering / waste)  ·  🟡 P2 (perf / ops)

## 1.6 Target Structure (after Phase 0–1)

```text
synapse/                              # ✅ = resolved debt vs §1.5
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── modules/              # feature-layered (replaces 697-line router.ts)
│   │       │   ├── workspace/        #   workspace.{router,service,repository,schema}.ts
│   │       │   ├── project/
│   │       │   ├── board/
│   │       │   └── member/
│   │       ├── shared/               # error classes · rate-limit middleware · trpc base
│   │       ├── router.ts             # ~20-line index that just merges modules
│   │       └── trpc.ts               # ✅ jose JWT verify + global rate-limit (P0)
│   ├── realtime/
│   └── web/
├── services/
│   ├── outbox-publisher/             # ✅ SKIP LOCKED / LISTEN-NOTIFY (P2)
│   ├── audit-activity/               # ✅ merged single consumer (was audit + activity) (P1)
│   ├── search-indexer/               # ✅ incremental, no full reindex on boot (P2)
│   └── notification/                 # ✅ WS push (no polling) + email/assignment
│   ✗  analytics/                     # ❌ removed — metrics derived from AuditLog (P1)
├── packages/
│   ├── db/                           # ✅ Team model removed · tuned connection pool
│   ├── env/                          # ✅ getEnv() called at every service boot (P0)
│   ├── ratelimit/                    # ✅ active on ALL protected routes, not just auth (P0)
│   └── … (events · auth · search · ui · config)
└── …
```

> **Before → After:** -1 service (analytics dropped, audit+activity merged) · router 697 → ~20 lines · identity now cryptographically verified · env fail-fast at boot.

## 2. Refined Categorical Scoring
| Category | Score | Priority | Core Blocker |
| :--- | :--- | :--- | :--- |
| **Security** | 4/10 | 🔴 P0 | Unsigned `x-user-id` header bypass; no global rate-limiting. |
| **Maintainability** | 5/10 | 🟠 P1 | Monolithic `router.ts`; no business-service layer; ad-hoc errors. |
| **Architecture** | 6/10 | 🟠 P1 | Good macro (Outbox/Kafka), weak micro (no route/service/repo boundaries). |
| **Scalability** | 6/10 | 🟡 P2 | O(n) card renumber; infinite `ProcessedEvent` growth; raw outbox polling. |
| **Performance** | 6/10 | 🟡 P2 | Write amplification (1 card move = 12+ writes); full-board refetches. |
| **Dev Experience** | 7/10 | 🟡 P2 | Solid pnpm/turbo & CI; loose env loading; console noise. |

## 3. High-Leverage Implementation Roadmap

### Phase 0 — Cryptographic Security & Rate-Limiting (Day 1–2) [P0]
- [ ] Replace unsigned `x-user-id` with asymmetric signed JWT verified via `jose` (web mints short-lived JWT; api verifies in `trpc.ts createContext`).
- [ ] Inject `@synapse/ratelimit` globally across all non-auth tRPC procedures (middleware).
- [ ] Force strict boot-time env validation via `getEnv()` in every app/service entrypoint.

### Phase 1 — Modular Feature Layering (Week 1) [P1]
- [ ] Split `router.ts` into `src/modules/{workspace,project,board,member}`.
- [ ] Enforce `Router (I/O) -> Service (business/tx) -> Repository (Prisma)`.
- [ ] Merge Audit + Activity consumers into one handler (cut write amplification ~30%); derive analytics from AuditLog (drop DailyMetric service/table).

### Phase 2 — Performance & Data Pruning (Week 2) [P1-P2]
- [ ] **LexoRank** string positions → card moves O(n) → O(1).
- [ ] Outbox worker `FOR UPDATE SKIP LOCKED` or `LISTEN/NOTIFY`.
- [ ] `ProcessedEvent` TTL/prune; fix search boot-time full reindex (make incremental).

### Phase 3 — Monitoring & Response Standards (Week 3) [P2]
- [ ] Replace all `console.*` (31 hits) with `pino` structured logging + request IDs.
- [ ] Standardize responses + central error classes via tRPC `errorFormatter`.
- [ ] Integration tests for untested domains (`board`, `member`, `search`, `notification`) + Playwright e2e in CI.

---

# Appendix — Synapse — Mimari İnceleme & İyileştirme Planı (detaylı denetim)

> Faz faz: **gerekli / boş yere tüketim (waste) / geliştirilebilir / profesyonellik için şart**.
> Durum (2026-06-11): Faz 0–5 + Faz 4 bitti. typecheck 16/16, test 24/24, lint temiz, build ok.
> Token yenilenince buradan devam: en üstteki **Öncelik Sırası**ndan başla.

---

## 🔴 Çapraz kesen (tüm fazları etkileyen) bulgular

### Güvenlik
- **API kimliği `x-user-id` header'ına güveniyor** (`apps/api/src/trpc.ts`). :4000'e erişen herkes herhangi bir kullanıcı gibi davranabilir. Web↔API arası imzalı token/oturum doğrulaması YOK. → Üretimde #1 risk.
- API'de rate limit yok (`@synapse/ratelimit` sadece `register` + `auth`'ta).
- `NEXTAUTH_SECRET="change_me_dev_secret"` .env.example'da — prod'da rotasyon gerek.

### Boş yere tüketim (write amplification)
- **Tek bir "kart taşıma" olayı ≈ 12+ DB yazması** zincire yayılıyor:
  `moveCard` (kolon kartlarını **toplu renumber** = O(n) update) + outbox insert + Redis publish → publisher update → activity insert+ProcessedEvent → audit insert+ProcessedEvent → analytics upsert+ProcessedEvent → search Meili upsert+ProcessedEvent.
- **`ProcessedEvent` ledger'ı hiç budanmıyor** — her tüketici × her olay için satır, sonsuza dek büyür. (TTL/prune job yok.)
- **`search-indexer` her açılışta `reindexAll()`** → tüm workspace+project+card'ı DB'den okuyup Meili'ye yeniden yazıyor. Her boot'ta tam tarama. (Kafka offset'i zaten commit'li olduğu için gereksiz; sadece ilk kurulumda gerekli.)
- **`audit` ≈ `activity` %80 örtüşme** — ikisi de aynı 4 topic'i tüketip neredeyse aynı veriyi iki ayrı tabloya yazıyor (biri ham payload, biri özet). 2× tüketim + 2× depolama.
- **`analytics` ayrı servis + `DailyMetric` tablosu** — `AuditLog`'tan `GROUP BY` ile türetilebilir; sayaç tablosu yalnız milyonlarca olayda gerekli.
- **Realtime "changed" → `router.refresh()`** tüm board'ı yeniden fetch ediyor (granular patch yok). Çok kullanıcıda gereksiz tam-refetch.
- **Outbox publisher 1 sn'de bir boşken bile DB'yi yokluyor** (poll). LISTEN/NOTIFY ile event-driven olabilir.
- Her servis kendi Prisma client + Kafka bağlantısını açıyor (6 servis × bağlantı). Demo'da sorun değil, ölçekte connection pool baskısı.
- **Bildirim zili client'ta 20 sn'de bir polling** → N açık sekme × periyodik API çağrısı. WS push ile bedavaya gelirdi (realtime hub zaten var).

### Test / Gözlemlenebilirlik / Deploy
- Sadece 24 birim test; router/board/member/search/notification **testsiz**, e2e yok (README'de Playwright var, kod yok).
- Her yerde `console.log`; yapısal log (pino) yok, OpenTelemetry trace yok, servislerde `/health` yok.
- App/servisler için **Dockerfile yok**, k8s manifesti yok (README k8s diyor; `infra/` yalnız docker-compose).
- **Outbox `FAILED` olayları için DLQ/işleyici yok** → sessiz kayıp.
- `@synapse/env` `getEnv()` Zod doğrulaması var ama **servisler çağırmıyor** (düz `dotenv.config()`), yani başlangıçta env doğrulanmıyor.

---

## 📋 Faz faz

### Faz 0 — İskelet / Auth
- ✅ Gerekli: monorepo, Auth.js, RBAC, Prisma.
- ❌ Waste/ölü kod: **`Team` modeli kullanılmıyor** (UI/mantık yok) → kullan ya da sil. `@synapse/ratelimit` ayrı paket ama 2 kullanım → auth'a gömülebilir.
- 🔧 Geliştir: `getEnv()`'i tüm servis girişlerine bağla; OAuth aç; e-posta doğrulama.

### Faz 1 — Event backbone
- ✅ Gerekli (mimari omurga, idempotency).
- ⚠️ Ölçeğe göre fazla (kasıtlı showcase): Outbox+Kafka+per-service ProcessedEvent.
- 🔧 Geliştir: outbox `FOR UPDATE SKIP LOCKED` + batch update; **DLQ**; publisher HA; ProcessedEvent prune job.

### Faz 2 — Boards
- ✅ Gerekli (çekirdek ürün).
- ❌ Waste: `moveCard` her taşımada kolonu komple renumber ediyor → **LexoRank** (kesirli sıralama) ile O(1).
- 🔧 Geliştir: kart yorumu/etiket/son tarih; kolon sürükleme; **board API testleri**; "changed"→granular patch (tam refetch yerine).

### Faz 3 — Docs (Yjs)
- ✅ Gerekli (gerçek CRDT + persistence + cursors).
- 🔧 Geliştir: doküman başlık/oluşturma UI; sürüm geçmişi; doküman içeriğini aramaya indexle; "kim bakıyor".

### Faz 4 — Canvas (tldraw)
- ✅ Gerekli (Yjs altyapısını yeniden kullanıyor).
- 🔧 Geliştir: çoklu cursor/awareness; PNG/SVG export.

### Faz 5 — Search / Audit / Notif / Analytics
- ❌ **En çok kırpılacak yer:**
  - audit + activity → **tek servise birleştir** (1 tüketim, 1 tablo).
  - analytics servisi+tablosunu **sil**, `AuditLog`'tan türet.
  - search-indexer `reindexAll`'ı **artımlı** yap (boot'ta tam tarama yok; ayrı `pnpm reindex` komutu).
  - notification → WS push'a geçir (polling'i kaldır), e-posta + atama/mention ekle.

### Faz 6 — (kaldı)
- "Profesyonel" için Stripe **opsiyonel**; asıl ihtiyaç: gözlemlenebilirlik + CI/CD + konteynerleştirme.

---

## 🎯 Öncelik Sırası (token yenilenince buradan başla)

1. **Güvenlik:** web↔api JWT/oturum doğrulaması + API rate limit. *(en kritik)*
2. **Sadeleştir (waste kırp):** audit+activity birleştir · analytics'i AuditLog'tan türet · search reindex'i artımlı yap · ProcessedEvent prune.
3. **Performans:** LexoRank kart pozisyonu · notification polling→WS push · board "changed"→granular patch.
4. **Test:** router/board/member entegrasyon testleri + Playwright e2e + CI'a ekle.
5. **Deploy/Gözlem:** her app/servise Dockerfile + `/health` · pino log · OpenTelemetry trace · Outbox DLQ · `getEnv()`'i servislere bağla.
6. **Temizlik:** `Team` modelini kullan ya da sil · ratelimit paketini sadeleştir.

---

## Notlar
- Tüm değişiklikler henüz **commit'lenmedi** (repo'da hiç commit yok). Temiz commit'lere bölünmeli.
- Yeni app/servis/bağımlılık eklenince `pnpm dev` **yeniden başlatılmalı** (turbo workspace'i başlangıçta okur).
- Doğrulama script'leri `appRouter` import edince `publishBoardChange` (ioredis) açık kalırsa süreç çıkmaz → `process.exit(0)` veya DB'den doğrula.
