-- Private organizer payment QR for the existing manual proof-and-review workflow.
alter table tournaments add column if not exists payment_qr_path text;

select 'payment_qr_column' as check, count(*) as n
from information_schema.columns
where table_schema = 'public' and table_name = 'tournaments' and column_name = 'payment_qr_path';
-- Expect payment_qr_column=1.
