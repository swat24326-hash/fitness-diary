-- clients: manual archive flag
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- active/archived filtering by club
CREATE INDEX IF NOT EXISTS idx_clients_club_archived_at ON public.clients (club_id, archived_at);

