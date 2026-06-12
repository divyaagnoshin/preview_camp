CREATE TABLE IF NOT EXISTS public.campaign_summary
(
    id               uuid        NOT NULL DEFAULT gen_random_uuid(),
    campaign_id      uuid        NOT NULL,
    job_id           uuid        NOT NULL,
    org_id           uuid        NOT NULL,
    total_in_ccs     integer     NOT NULL DEFAULT 0,
    completed_count  integer     NOT NULL DEFAULT 0,
    exhausted_count  integer     NOT NULL DEFAULT 0,
    dnc_count        integer     NOT NULL DEFAULT 0,
    queued_count     integer     NOT NULL DEFAULT 0,
    trigger          text        NOT NULL DEFAULT 'stop',
    date             date        NOT NULL DEFAULT CURRENT_DATE,
    snapshot_at      timestamptz NOT NULL DEFAULT now(),
    created_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT campaign_summary_pkey PRIMARY KEY (id),

    CONSTRAINT campaign_summary_campaign_id_fkey
        FOREIGN KEY (campaign_id)
        REFERENCES public.campaigns (id)
        ON UPDATE NO ACTION
        ON DELETE CASCADE,

    CONSTRAINT campaign_summary_job_id_fkey
        FOREIGN KEY (job_id)
        REFERENCES public.campaign_jobs (id)
        ON UPDATE NO ACTION
        ON DELETE CASCADE
);



CREATE TABLE IF NOT EXISTS public.ccs_archive
(
    id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
    original_ccs_id     uuid        NOT NULL,
    contact_id          uuid        NOT NULL,
    job_id              uuid        NOT NULL,
    campaign_id         uuid        NOT NULL,
    org_id              uuid        NOT NULL,
    status              text        NOT NULL,
    priority            integer     NOT NULL DEFAULT 100,
    assigned_agent_id   uuid,
    attempts_made       integer     NOT NULL DEFAULT 0,
    last_attempted_at   timestamptz,
    next_attempt_at     timestamptz,
    archive_trigger     text        NOT NULL DEFAULT 'stop',
    date                date        NOT NULL DEFAULT CURRENT_DATE,
    archived_at         timestamptz NOT NULL DEFAULT now(),
    original_created_at timestamptz,
    original_updated_at timestamptz,

    CONSTRAINT ccs_archive_pkey PRIMARY KEY (id),

    CONSTRAINT ccs_archive_campaign_id_fkey
        FOREIGN KEY (campaign_id)
        REFERENCES public.campaigns (id)
        ON UPDATE NO ACTION
        ON DELETE CASCADE,

    CONSTRAINT ccs_archive_contact_id_fkey
        FOREIGN KEY (contact_id)
        REFERENCES public.contacts (id)
        ON UPDATE NO ACTION
        ON DELETE CASCADE,

    CONSTRAINT ccs_archive_job_id_fkey
        FOREIGN KEY (job_id)
        REFERENCES public.campaign_jobs (id)
        ON UPDATE NO ACTION
        ON DELETE CASCADE
);

-- ★ Unique index that drives the ON CONFLICT upsert (one row per job per day)
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_summary_job_date
    ON public.campaign_summary (job_id, date);